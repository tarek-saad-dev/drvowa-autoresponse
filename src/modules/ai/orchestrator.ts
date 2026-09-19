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
  pauseConversationAi,
} from "./conversation-state-repository";
import { createGeminiProvider, AiProviderError } from "./gemini-provider";
import { evaluateConversationLoopGuard, logAiSafety } from "./guard-repository";
import {
  completeJob,
  deferUnknownOutbound,
  getJob,
  persistGeneratedReply,
} from "./jobs-repository";
import {
  aiOutboundIdempotencyKey,
  outboundUnknownRetryDelaySeconds,
} from "./outbound-policy";
import {
  MAX_HISTORY_MESSAGES,
  MAX_KNOWLEDGE_CHARS,
  type AiReplyProvider,
} from "./provider";
import { getChannelAiSettingByConnection } from "./settings-repository";

function logAi(
  event: string,
  fields: Record<string, unknown>,
  logger: { info: (...a: unknown[]) => void; warn: (...a: unknown[]) => void },
) {
  const fn = event.includes("fail") || event.includes("skipped")
    || event.includes("unknown")
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
  logger: { info: (...a: unknown[]) => void; warn: (...a: unknown[]) => void };
}): Promise<{ status: "FAILED" | "DEFERRED"; errorCode: string }> {
  const { job, logger } = params;
  const businessId = job.businessId;
  const delay = outboundUnknownRetryDelaySeconds(job.attemptCount);

  if (delay === null) {
    await completeJob({
      businessId,
      jobId: job.aiReplyJobId,
      status: "FAILED",
      errorCode: "OUTBOUND_RESULT_UNKNOWN_FINAL",
    });
    await pauseConversationAi({
      businessId,
      conversationId: job.conversationId,
      mode: "SAFETY_PAUSED",
      pauseReason: "AMBIGUOUS_OUTBOUND",
    });
    logAi("outbound_unknown_final", {
      businessId,
      conversationId: job.conversationId,
      jobId: job.aiReplyJobId,
      attempt: job.attemptCount,
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

  await deferUnknownOutbound({
    businessId,
    jobId: job.aiReplyJobId,
    delaySeconds: delay,
    errorCode: "OUTBOUND_RESULT_UNKNOWN",
  });
  logAi("outbound_unknown_retry", {
    businessId,
    conversationId: job.conversationId,
    jobId: job.aiReplyJobId,
    attempt: job.attemptCount,
    reason: "OUTBOUND_RESULT_UNKNOWN",
  }, logger);
  return { status: "DEFERRED", errorCode: "OUTBOUND_RESULT_UNKNOWN" };
}

export async function processAiReplyJob(params: {
  job: AiReplyJob;
  provider?: AiReplyProvider;
  sendMessage?: typeof sendAccountMessage;
  logger?: { info: (...a: unknown[]) => void; warn: (...a: unknown[]) => void };
}): Promise<{
  status: "SENT" | "SKIPPED" | "FAILED" | "DEFERRED";
  errorCode?: string;
}> {
  const logger = params.logger ?? console;
  const job = params.job;
  const businessId = job.businessId;
  const sendMessage = params.sendMessage ?? sendAccountMessage;
  const idempotencyKey = aiOutboundIdempotencyKey(job.aiReplyJobId);

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
    await completeJob({
      businessId,
      jobId: job.aiReplyJobId,
      status: "SKIPPED",
      errorCode: "AI_DISABLED",
    });
    logAi("skipped", { businessId, jobId: job.aiReplyJobId, errorCode: "AI_DISABLED" }, logger);
    return { status: "SKIPPED", errorCode: "AI_DISABLED" };
  }

  let agent;
  try {
    agent = await getAgent({ businessId, agentId: setting.agentId });
  } catch {
    await completeJob({
      businessId,
      jobId: job.aiReplyJobId,
      status: "SKIPPED",
      errorCode: "AGENT_NOT_AVAILABLE",
    });
    logAi("skipped", {
      businessId,
      jobId: job.aiReplyJobId,
      errorCode: "AGENT_NOT_AVAILABLE",
    }, logger);
    return { status: "SKIPPED", errorCode: "AGENT_NOT_AVAILABLE" };
  }
  if (!agent.isActive) {
    await completeJob({
      businessId,
      jobId: job.aiReplyJobId,
      status: "SKIPPED",
      errorCode: "AGENT_NOT_AVAILABLE",
    });
    logAi("skipped", {
      businessId,
      jobId: job.aiReplyJobId,
      errorCode: "AGENT_NOT_AVAILABLE",
    }, logger);
    return { status: "SKIPPED", errorCode: "AGENT_NOT_AVAILABLE" };
  }

  const contact = await messagingRepo.getContactForBusiness({
    businessId,
    contactId: job.contactId,
  });
  if (!contact?.phoneNormalized) {
    await completeJob({
      businessId,
      jobId: job.aiReplyJobId,
      status: "SKIPPED",
      errorCode: "DESTINATION_UNAVAILABLE",
    });
    logAi("skipped", {
      businessId,
      jobId: job.aiReplyJobId,
      errorCode: "DESTINATION_UNAVAILABLE",
    }, logger);
    return { status: "SKIPPED", errorCode: "DESTINATION_UNAVAILABLE" };
  }

  const connection = await getChannelConnection({
    businessId,
    channelConnectionId: job.channelConnectionId,
  });
  const accountKey = connection?.externalAccountKey;
  if (!accountKey) {
    await completeJob({
      businessId,
      jobId: job.aiReplyJobId,
      status: "FAILED",
      errorCode: "ACCOUNT_KEY_MISSING",
    });
    logAi("failed", {
      businessId,
      jobId: job.aiReplyJobId,
      errorCode: "ACCOUNT_KEY_MISSING",
    }, logger);
    return { status: "FAILED", errorCode: "ACCOUNT_KEY_MISSING" };
  }

  // Reuse durable generated reply on outbound recovery — never call Gemini again.
  let replyText = job.generatedReplyText?.trim() || "";
  let modelName = job.generatedModel || "unknown";
  let genLatency = 0;

  if (!replyText) {
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
        await completeJob({
          businessId,
          jobId: job.aiReplyJobId,
          status: "FAILED",
          errorCode: "GEMINI_EMPTY",
        });
        logAi("failed", {
          businessId,
          jobId: job.aiReplyJobId,
          errorCode: "GEMINI_EMPTY",
        }, logger);
        return { status: "FAILED", errorCode: "GEMINI_EMPTY" };
      }
    } catch (error) {
      const code =
        error instanceof AiProviderError ? error.code : "GEMINI_FAILED";
      await completeJob({
        businessId,
        jobId: job.aiReplyJobId,
        status: "FAILED",
        errorCode: code,
      });
      logAi("failed", { businessId, jobId: job.aiReplyJobId, errorCode: code }, logger);
      return { status: "FAILED", errorCode: code };
    }

    await persistGeneratedReply({
      businessId,
      jobId: job.aiReplyJobId,
      replyText,
      model: modelName,
    });

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
    await completeJob({
      businessId,
      jobId: job.aiReplyJobId,
      status: "SKIPPED",
      errorCode: "AI_DISABLED_BEFORE_SEND",
    });
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
    logAi("skipped", {
      businessId,
      jobId: job.aiReplyJobId,
      errorCode: "AI_DISABLED_BEFORE_SEND",
    }, logger);
    return { status: "SKIPPED", errorCode: "AI_DISABLED_BEFORE_SEND" };
  }

  if (job.createdAtUtc.getTime() < liveSetting.enabledAtUtc.getTime()) {
    await completeJob({
      businessId,
      jobId: job.aiReplyJobId,
      status: "SKIPPED",
      errorCode: "STALE_ACTIVATION",
    });
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
    logAi("skipped", {
      businessId,
      jobId: job.aiReplyJobId,
      errorCode: "STALE_ACTIVATION",
    }, logger);
    return { status: "SKIPPED", errorCode: "STALE_ACTIVATION" };
  }

  const conversationSendGate = await evaluateConversationAiSendGate({
    businessId,
    conversationId: job.conversationId,
    jobCreatedAtUtc: job.createdAtUtc,
  });
  if (!conversationSendGate.allow) {
    const errorCode = conversationSendGate.reason ?? "CONVERSATION_PAUSED";
    await completeJob({
      businessId,
      jobId: job.aiReplyJobId,
      status: "SKIPPED",
      errorCode,
    });
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
    logAi("skipped", {
      businessId,
      jobId: job.aiReplyJobId,
      errorCode,
    }, logger);
    return { status: "SKIPPED", errorCode };
  }

  const sendGuard = await evaluateConversationLoopGuard({
    businessId,
    conversationId: job.conversationId,
    jobId: job.aiReplyJobId,
    logger,
  });
  if (!sendGuard.allow) {
    await completeJob({
      businessId,
      jobId: job.aiReplyJobId,
      status: "SKIPPED",
      errorCode: "LOOP_GUARD_ACTIVE",
    });
    logAi("skipped", {
      businessId,
      jobId: job.aiReplyJobId,
      errorCode: "LOOP_GUARD_ACTIVE",
    }, logger);
    return { status: "SKIPPED", errorCode: "LOOP_GUARD_ACTIVE" };
  }

  logAi("send_start", {
    businessId,
    conversationId: job.conversationId,
    jobId: job.aiReplyJobId,
    attempt: job.attemptCount,
  }, logger);

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
        await completeJob({
          businessId,
          jobId: job.aiReplyJobId,
          status: "FAILED",
          errorCode: "IDEMPOTENCY_CONFLICT",
        });
        logAi("failed", {
          businessId,
          jobId: job.aiReplyJobId,
          errorCode: "IDEMPOTENCY_CONFLICT",
        }, logger);
        return { status: "FAILED", errorCode: "IDEMPOTENCY_CONFLICT" };
      }

      const ambiguous =
        error.code === "OUTBOUND_RESULT_UNKNOWN"
        || error.code === "RUNTIME_TIMEOUT"
        || error.code === "RUNTIME_UNAVAILABLE";

      if (ambiguous) {
        const deferred = await handleAmbiguousOutbound({ job, logger });
        return deferred.status === "DEFERRED"
          ? { status: "DEFERRED", errorCode: deferred.errorCode }
          : { status: "FAILED", errorCode: deferred.errorCode };
      }

      const definitive =
        error.code === "NOT_READY"
        || error.code === "LOGGED_OUT"
        || error.code === "NOT_STARTED"
        || error.status === 409;

      const code = definitive ? error.code : `RUNTIME_${error.status}`;
      await completeJob({
        businessId,
        jobId: job.aiReplyJobId,
        status: "FAILED",
        errorCode: code,
      });
      logAi("failed", { businessId, jobId: job.aiReplyJobId, errorCode: code }, logger);
      return { status: "FAILED", errorCode: code };
    }
    const deferred = await handleAmbiguousOutbound({ job, logger });
    return deferred.status === "DEFERRED"
      ? { status: "DEFERRED", errorCode: deferred.errorCode }
      : { status: "FAILED", errorCode: deferred.errorCode };
  }

  const statusLower = (sendResult.status ?? "").toLowerCase();
  const isDuplicate = statusLower === "duplicate";
  const isSent = statusLower === "sent" || sendResult.success;

  if (sendResult.code === "OUTBOUND_RESULT_UNKNOWN") {
    const deferred = await handleAmbiguousOutbound({ job, logger });
    return deferred.status === "DEFERRED"
      ? { status: "DEFERRED", errorCode: deferred.errorCode }
      : { status: "FAILED", errorCode: deferred.errorCode };
  }

  if (sendResult.code === "IDEMPOTENCY_CONFLICT") {
    await completeJob({
      businessId,
      jobId: job.aiReplyJobId,
      status: "FAILED",
      errorCode: "IDEMPOTENCY_CONFLICT",
    });
    logAi("failed", {
      businessId,
      jobId: job.aiReplyJobId,
      errorCode: "IDEMPOTENCY_CONFLICT",
    }, logger);
    return { status: "FAILED", errorCode: "IDEMPOTENCY_CONFLICT" };
  }

  if ((!isSent && !isDuplicate) || !sendResult.messageId) {
    const code = sendResult.code || "SEND_FAILED";
    await completeJob({
      businessId,
      jobId: job.aiReplyJobId,
      status: "FAILED",
      errorCode: code,
    });
    logAi("failed", { businessId, jobId: job.aiReplyJobId, errorCode: code }, logger);
    return { status: "FAILED", errorCode: code };
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

  await withTransaction(async (trx) => {
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
    const completed = await completeJob({
      businessId,
      jobId: job.aiReplyJobId,
      status: "SENT",
      outboundProviderMessageId: providerMessageId,
      trx,
    });
    // Usage once per successful SENT transition (duplicate ack must not double-bill).
    if (completed) {
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
    }
    void inserted;
  });

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
