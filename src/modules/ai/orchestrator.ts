import { withTransaction } from "@/lib/db";
import { getAgent } from "@/modules/agents/service";
import { getChannelConnection } from "@/modules/channels/repository";
import {
  sendAccountMessage,
  WhatsAppRuntimeError,
} from "@/modules/channels/runtime-client";
import { listItems } from "@/modules/knowledge/service";
import { recordUsageEvent } from "@/modules/usage/service";
import type { AiReplyJob } from "@/types/domain";
import * as messagingRepo from "@/modules/messaging/repository";

import {
  evaluateConversationAiSendGate,
} from "./conversation-state-repository";
import { createGeminiProvider, AiProviderError } from "./gemini-provider";
import { evaluateConversationLoopGuard, logAiSafety } from "./guard-repository";
import {
  assertJobLeaseOwned,
  completeJob,
  getJob,
  persistGeneratedReply,
  recordAmbiguousOutbound,
} from "./jobs-repository";
import {
  isAiJobLeaseLostError,
} from "./lease";
import {
  aiOutboundIdempotencyKey,
} from "./outbound-policy";
import {
  MAX_HISTORY_MESSAGES,
  MAX_KNOWLEDGE_CHARS,
  type AiReplyProvider,
} from "./provider";
import { getChannelAiSettingByConnection } from "./settings-repository";

export type AiJobLeaseContext = {
  token: string;
  isLost: () => boolean;
  markLost?: () => void;
};

function logAi(
  event: string,
  fields: Record<string, unknown>,
  logger: { info: (...a: unknown[]) => void; warn: (...a: unknown[]) => void },
) {
  const fn = event.includes("fail") || event.includes("skipped")
    || event.includes("unknown") || event.includes("lease")
    ? logger.warn.bind(logger)
    : logger.info.bind(logger);
  fn(`[ai-worker] ${event}`, fields);
}

const KNOWLEDGE_CATEGORY_ORDER = [
  "ABOUT",
  "FAQ",
  "SERVICE",
  "POLICY",
  "LOCATION_INFO",
  "CUSTOM",
] as const;

function orderKnowledge<T extends { category: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const ia = KNOWLEDGE_CATEGORY_ORDER.indexOf(
      a.category as (typeof KNOWLEDGE_CATEGORY_ORDER)[number],
    );
    const ib = KNOWLEDGE_CATEGORY_ORDER.indexOf(
      b.category as (typeof KNOWLEDGE_CATEGORY_ORDER)[number],
    );
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
}

async function handleAmbiguousOutbound(params: {
  job: AiReplyJob;
  leaseToken: string | null;
  logger: { info: (...a: unknown[]) => void; warn: (...a: unknown[]) => void };
}): Promise<{ status: "FAILED" | "DEFERRED" | "LEASE_LOST"; errorCode: string }> {
  const { job, logger, leaseToken } = params;
  const businessId = job.businessId;

  if (!leaseToken) {
    return { status: "LEASE_LOST", errorCode: "LEASE_LOST" };
  }

  try {
    const result = await recordAmbiguousOutbound({
      businessId,
      jobId: job.aiReplyJobId,
      conversationId: job.conversationId,
      leaseToken,
    });

    if (result.outcome === "finalized") {
      logAi("outbound_unknown_final", {
        businessId,
        conversationId: job.conversationId,
        jobId: job.aiReplyJobId,
        outboundUnknownCount: result.outboundUnknownCount,
        reason: "OUTBOUND_RESULT_UNKNOWN_FINAL",
      }, logger);
      logAiSafety(
        "safety_paused",
        {
          businessId,
          conversationId: job.conversationId,
          jobId: job.aiReplyJobId,
          reason: "AMBIGUOUS_OUTBOUND",
        },
        logger,
      );
      return { status: "FAILED", errorCode: "OUTBOUND_RESULT_UNKNOWN_FINAL" };
    }

    logAi("outbound_unknown_retry", {
      businessId,
      conversationId: job.conversationId,
      jobId: job.aiReplyJobId,
      outboundUnknownCount: result.outboundUnknownCount,
      delaySeconds: result.delaySeconds,
      reason: "OUTBOUND_RESULT_UNKNOWN",
    }, logger);
    return { status: "DEFERRED", errorCode: "OUTBOUND_RESULT_UNKNOWN" };
  } catch (error) {
    if (isAiJobLeaseLostError(error)) {
      logAi("lease_lost", {
        businessId,
        jobId: job.aiReplyJobId,
        phase: "ambiguous_outbound",
      }, logger);
      return { status: "LEASE_LOST", errorCode: "LEASE_LOST" };
    }
    throw error;
  }
}

export async function processAiReplyJob(params: {
  job: AiReplyJob;
  provider?: AiReplyProvider;
  sendMessage?: typeof sendAccountMessage;
  lease?: AiJobLeaseContext | null;
  logger?: { info: (...a: unknown[]) => void; warn: (...a: unknown[]) => void };
}): Promise<{
  status: "SENT" | "SKIPPED" | "FAILED" | "DEFERRED" | "LEASE_LOST";
  errorCode?: string;
}> {
  const logger = params.logger ?? console;
  const job = params.job;
  const businessId = job.businessId;
  const sendMessage = params.sendMessage ?? sendAccountMessage;
  const idempotencyKey = aiOutboundIdempotencyKey(job.aiReplyJobId);
  const leaseToken = params.lease?.token ?? job.leaseToken ?? null;

  const markLeaseLostLocally = () => {
    params.lease?.markLost?.();
  };

  async function requireLiveLease(phase: string): Promise<boolean> {
    if (params.lease?.isLost()) {
      markLeaseLostLocally();
      logAi("lease_lost", { businessId, jobId: job.aiReplyJobId, phase }, logger);
      return false;
    }
    if (!leaseToken) {
      markLeaseLostLocally();
      logAi("lease_lost", {
        businessId,
        jobId: job.aiReplyJobId,
        phase,
        reason: "missing_token",
      }, logger);
      return false;
    }
    try {
      await assertJobLeaseOwned({
        businessId,
        jobId: job.aiReplyJobId,
        leaseToken,
      });
      return true;
    } catch (error) {
      if (isAiJobLeaseLostError(error)) {
        markLeaseLostLocally();
        logAi("lease_lost", { businessId, jobId: job.aiReplyJobId, phase }, logger);
        return false;
      }
      throw error;
    }
  }

  async function completeFenced(
    args: Omit<Parameters<typeof completeJob>[0], "businessId" | "jobId" | "leaseToken">,
  ): Promise<"ok" | "lease_lost"> {
    if (!leaseToken) {
      markLeaseLostLocally();
      logAi("lease_lost", {
        businessId,
        jobId: job.aiReplyJobId,
        phase: "complete_missing_token",
      }, logger);
      return "lease_lost";
    }
    try {
      await completeJob({
        ...args,
        businessId,
        jobId: job.aiReplyJobId,
        leaseToken,
      });
      return "ok";
    } catch (error) {
      if (isAiJobLeaseLostError(error)) {
        markLeaseLostLocally();
        logAi("lease_lost", {
          businessId,
          jobId: job.aiReplyJobId,
          phase: "complete",
        }, logger);
        return "lease_lost";
      }
      throw error;
    }
  }

  async function finishTerminal(
    status: "SKIPPED" | "FAILED",
    errorCode: string,
    logFields: Record<string, unknown> = {},
  ): Promise<{ status: "SKIPPED" | "FAILED" | "LEASE_LOST"; errorCode: string }> {
    const done = await completeFenced({ status, errorCode });
    if (done === "lease_lost") {
      return { status: "LEASE_LOST", errorCode: "LEASE_LOST" };
    }
    const event = status === "SKIPPED" ? "skipped" : "failed";
    logAi(event, {
      businessId,
      jobId: job.aiReplyJobId,
      errorCode,
      ...logFields,
    }, logger);
    return { status, errorCode };
  }

  logAi("job_claimed", {
    businessId,
    conversationId: job.conversationId,
    jobId: job.aiReplyJobId,
  }, logger);

  const waitMs = job.notBeforeUtc.getTime() - Date.now();
  if (waitMs > 0 && waitMs < 5_000) {
    logAi("debounce_wait", {
      businessId,
      conversationId: job.conversationId,
      jobId: job.aiReplyJobId,
      latencyMs: waitMs,
    }, logger);
    await new Promise((r) => setTimeout(r, waitMs));
  }

  const setting = await getChannelAiSettingByConnection({
    businessId,
    channelConnectionId: job.channelConnectionId,
  });
  if (!setting?.autoReplyEnabled) {
    return finishTerminal("SKIPPED", "AI_DISABLED");
  }

  let agent;
  try {
    agent = await getAgent({ businessId, agentId: setting.agentId });
  } catch {
    return finishTerminal("SKIPPED", "AGENT_NOT_AVAILABLE");
  }
  if (!agent.isActive) {
    return finishTerminal("SKIPPED", "AGENT_NOT_AVAILABLE");
  }

  const contact = await messagingRepo.getContactForBusiness({
    businessId,
    contactId: job.contactId,
  });
  if (!contact?.phoneNormalized) {
    return finishTerminal("SKIPPED", "DESTINATION_UNAVAILABLE");
  }

  const connection = await getChannelConnection({
    businessId,
    channelConnectionId: job.channelConnectionId,
  });
  const accountKey = connection?.externalAccountKey;
  if (!accountKey) {
    return finishTerminal("FAILED", "ACCOUNT_KEY_MISSING");
  }

  // Reuse durable generated reply on outbound recovery — never call Gemini again.
  let replyText = job.generatedReplyText?.trim() || "";
  let modelName = job.generatedModel || "unknown";
  let genLatency = 0;

  if (!replyText) {
    if (!(await requireLiveLease("before_generation"))) {
      return { status: "LEASE_LOST", errorCode: "LEASE_LOST" };
    }

    const knowledgeItems = orderKnowledge(
      await listItems({ businessId, includeInactive: false }),
    );
    let knowledgeChars = 0;
    const knowledge = [];
    for (const item of knowledgeItems) {
      const chunk = `${item.title}\n${item.content}`;
      if (knowledgeChars + chunk.length > MAX_KNOWLEDGE_CHARS) break;
      knowledge.push({
        category: item.category,
        title: item.title,
        content: item.content,
      });
      knowledgeChars += chunk.length;
    }

    const recentMessages = await messagingRepo.listRecentTextMessages({
      businessId,
      conversationId: job.conversationId,
      limit: MAX_HISTORY_MESSAGES,
    });

    const provider = params.provider ?? createGeminiProvider();

    logAi("generation_start", {
      businessId,
      conversationId: job.conversationId,
      jobId: job.aiReplyJobId,
    }, logger);

    try {
      const generated = await provider.generateReply({
        businessId,
        conversationId: job.conversationId,
        agent: {
          name: agent.name,
          roleTitle: agent.roleTitle,
          language: agent.language,
          dialect: agent.dialect,
          tone: agent.tone,
          instructions: agent.instructions,
        },
        knowledge,
        recentMessages: recentMessages.map((m) => ({
          direction: m.direction,
          textContent: m.textContent,
          createdAtUtc: m.createdAtUtc,
          messageId: m.messageId,
        })),
        customerPhoneHint: contact.phoneNormalized,
      });
      replyText = generated.text;
      modelName = generated.model;
      genLatency = generated.latencyMs;
      if (!replyText.trim()) {
        return finishTerminal("FAILED", "GEMINI_EMPTY");
      }
    } catch (error) {
      const code =
        error instanceof AiProviderError ? error.code : "GEMINI_FAILED";
      return finishTerminal("FAILED", code);
    }

    if (!(await requireLiveLease("before_persist_generated"))) {
      return { status: "LEASE_LOST", errorCode: "LEASE_LOST" };
    }

    try {
      await persistGeneratedReply({
        businessId,
        jobId: job.aiReplyJobId,
        replyText,
        model: modelName,
        leaseToken,
      });
    } catch (error) {
      if (isAiJobLeaseLostError(error)) {
        markLeaseLostLocally();
        return { status: "LEASE_LOST", errorCode: "LEASE_LOST" };
      }
      throw error;
    }

    logAi("generation_complete", {
      businessId,
      conversationId: job.conversationId,
      jobId: job.aiReplyJobId,
      latencyMs: genLatency,
      model: modelName,
    }, logger);
  } else {
    logAi("generation_reused", {
      businessId,
      conversationId: job.conversationId,
      jobId: job.aiReplyJobId,
      attempt: job.attemptCount,
    }, logger);
  }

  // Send-time checks (order is deterministic; no check weakens another):
  // 1. global AutoReplyEnabled
  // 2. global activation watermark
  // 3. per-conversation state
  // 4. conversation resume watermark
  // 5. loop guard
  // 6. runtime send
  const liveSetting = await getChannelAiSettingByConnection({
    businessId,
    channelConnectionId: job.channelConnectionId,
  });
  if (!liveSetting?.autoReplyEnabled || !liveSetting.enabledAtUtc) {
    logAiSafety(
      "disabled_before_send",
      {
        businessId,
        conversationId: job.conversationId,
        jobId: job.aiReplyJobId,
        reason: "AI_DISABLED_BEFORE_SEND",
      },
      logger,
    );
    return finishTerminal("SKIPPED", "AI_DISABLED_BEFORE_SEND");
  }

  if (job.createdAtUtc.getTime() < liveSetting.enabledAtUtc.getTime()) {
    logAiSafety(
      "stale_activation",
      {
        businessId,
        conversationId: job.conversationId,
        jobId: job.aiReplyJobId,
        reason: "STALE_ACTIVATION",
      },
      logger,
    );
    return finishTerminal("SKIPPED", "STALE_ACTIVATION");
  }

  const conversationSendGate = await evaluateConversationAiSendGate({
    businessId,
    conversationId: job.conversationId,
    jobCreatedAtUtc: job.createdAtUtc,
  });
  if (!conversationSendGate.allow) {
    const errorCode = conversationSendGate.reason ?? "CONVERSATION_PAUSED";
    if (errorCode === "HUMAN_TAKEOVER_BEFORE_SEND") {
      logAiSafety(
        "human_takeover_before_send",
        {
          businessId,
          conversationId: job.conversationId,
          jobId: job.aiReplyJobId,
          reason: errorCode,
        },
        logger,
      );
    } else if (errorCode === "STALE_CONVERSATION_ACTIVATION") {
      logAiSafety(
        "stale_conversation_activation",
        {
          businessId,
          conversationId: job.conversationId,
          jobId: job.aiReplyJobId,
          reason: errorCode,
        },
        logger,
      );
    } else if (errorCode === "CONVERSATION_SAFETY_PAUSED") {
      logAiSafety(
        "safety_paused",
        {
          businessId,
          conversationId: job.conversationId,
          jobId: job.aiReplyJobId,
          reason: errorCode,
        },
        logger,
      );
    }
    return finishTerminal("SKIPPED", errorCode);
  }

  const sendGuard = await evaluateConversationLoopGuard({
    businessId,
    conversationId: job.conversationId,
    jobId: job.aiReplyJobId,
    logger,
  });
  if (!sendGuard.allow) {
    return finishTerminal("SKIPPED", "LOOP_GUARD_ACTIVE");
  }

  logAi("send_start", {
    businessId,
    conversationId: job.conversationId,
    jobId: job.aiReplyJobId,
    attempt: job.attemptCount,
  }, logger);

  // Final pre-send gate: DB-authoritative ownership (local isLost is only a fast path).
  if (!(await requireLiveLease("before_send"))) {
    return { status: "LEASE_LOST", errorCode: "LEASE_LOST" };
  }

  let sendResult;
  try {
    sendResult = await sendMessage({
      accountKey,
      phone: contact.phoneNormalized,
      message: replyText,
      idempotencyKey,
    });
  } catch (error) {
    if (error instanceof WhatsAppRuntimeError) {
      if (error.code === "IDEMPOTENCY_CONFLICT") {
        return finishTerminal("FAILED", "IDEMPOTENCY_CONFLICT");
      }

      const ambiguous =
        error.code === "OUTBOUND_RESULT_UNKNOWN"
        || error.code === "RUNTIME_TIMEOUT"
        || error.code === "RUNTIME_UNAVAILABLE";

      if (ambiguous) {
        const deferred = await handleAmbiguousOutbound({
          job,
          leaseToken,
          logger,
        });
        return {
          status: deferred.status,
          errorCode: deferred.errorCode,
        };
      }

      const definitive =
        error.code === "NOT_READY"
        || error.code === "LOGGED_OUT"
        || error.code === "NOT_STARTED"
        || error.status === 409;

      const code = definitive ? error.code : `RUNTIME_${error.status}`;
      return finishTerminal("FAILED", code);
    }
    const deferred = await handleAmbiguousOutbound({
      job,
      leaseToken,
      logger,
    });
    return {
      status: deferred.status,
      errorCode: deferred.errorCode,
    };
  }

  const statusLower = (sendResult.status ?? "").toLowerCase();
  const isDuplicate = statusLower === "duplicate";
  const isSent = statusLower === "sent" || sendResult.success;

  if (sendResult.code === "OUTBOUND_RESULT_UNKNOWN") {
    const deferred = await handleAmbiguousOutbound({
      job,
      leaseToken,
      logger,
    });
    return {
      status: deferred.status,
      errorCode: deferred.errorCode,
    };
  }

  if (sendResult.code === "IDEMPOTENCY_CONFLICT") {
    return finishTerminal("FAILED", "IDEMPOTENCY_CONFLICT");
  }

  if ((!isSent && !isDuplicate) || !sendResult.messageId) {
    const code = sendResult.code || "SEND_FAILED";
    return finishTerminal("FAILED", code);
  }

  const providerMessageId = String(
    sendResult.originalMessageId ?? sendResult.messageId,
  );

  if (isDuplicate) {
    logAi("outbound_duplicate_ack", {
      businessId,
      conversationId: job.conversationId,
      jobId: job.aiReplyJobId,
      providerMessageId,
      attempt: job.attemptCount,
    }, logger);
  }

  const sentAt = new Date();
  const freshJob = await getJob({ businessId, jobId: job.aiReplyJobId });
  const usageModel = freshJob?.generatedModel || modelName;

  // Pre-TX fence: lost lease must not begin message/usage finalization.
  if (!(await requireLiveLease("before_finalize"))) {
    return { status: "LEASE_LOST", errorCode: "LEASE_LOST" };
  }

  try {
    await withTransaction(async (trx) => {
      // In-TX ownership lock FIRST — stale lease rolls back all side effects.
      await assertJobLeaseOwned({
        businessId,
        jobId: job.aiReplyJobId,
        leaseToken: leaseToken!,
        trx,
      });

      const { inserted } = await messagingRepo.insertMessageIdempotent(
        {
          businessId,
          conversationId: job.conversationId,
          channelConnectionId: job.channelConnectionId,
          contactId: job.contactId,
          direction: "OUTBOUND",
          provider: "baileys",
          providerMessageId,
          contentType: "TEXT",
          textContent: replyText,
          providerTimestampUtc: sentAt,
          receivedAtUtc: sentAt,
        },
        trx,
      );
      await messagingRepo.touchConversationOutbound(
        {
          businessId,
          conversationId: job.conversationId,
          at: sentAt,
        },
        trx,
      );
      // Fenced complete throws AiJobLeaseLostError on zero rows (never silent false).
      await completeJob({
        businessId,
        jobId: job.aiReplyJobId,
        status: "SENT",
        outboundProviderMessageId: providerMessageId,
        leaseToken: leaseToken!,
        trx,
      });
      // Usage once per successful SENT transition (duplicate ack must not double-bill).
      await messagingRepo.insertUsageEventInTrx(
        {
          businessId,
          eventType: "AI_REPLY_GENERATED",
          quantity: 1,
          metadata: { jobId: job.aiReplyJobId, model: usageModel },
        },
        trx,
      );
      await messagingRepo.insertUsageEventInTrx(
        {
          businessId,
          eventType: "WHATSAPP_OUTBOUND_MESSAGE",
          quantity: 1,
          metadata: {
            jobId: job.aiReplyJobId,
            providerMessageId,
          },
        },
        trx,
      );
      void inserted;
    });
  } catch (error) {
    if (isAiJobLeaseLostError(error)) {
      markLeaseLostLocally();
      logAi("lease_lost", {
        businessId,
        jobId: job.aiReplyJobId,
        phase: "finalize_sent",
      }, logger);
      return { status: "LEASE_LOST", errorCode: "LEASE_LOST" };
    }
    throw error;
  }

  void recordUsageEvent;

  logAi("sent", {
    businessId,
    conversationId: job.conversationId,
    jobId: job.aiReplyJobId,
    model: usageModel,
    latencyMs: genLatency,
    providerMessageId,
  }, logger);

  return { status: "SENT" };
}
