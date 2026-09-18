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

import { createGeminiProvider, AiProviderError } from "./gemini-provider";
import { completeJob } from "./jobs-repository";
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

export async function processAiReplyJob(params: {
  job: AiReplyJob;
  provider?: AiReplyProvider;
  sendMessage?: typeof sendAccountMessage;
  logger?: { info: (...a: unknown[]) => void; warn: (...a: unknown[]) => void };
}): Promise<{ status: "SENT" | "SKIPPED" | "FAILED"; errorCode?: string }> {
  const logger = params.logger ?? console;
  const job = params.job;
  const businessId = job.businessId;
  const sendMessage = params.sendMessage ?? sendAccountMessage;

  logAi("job_claimed", {
    businessId,
    conversationId: job.conversationId,
    jobId: job.aiReplyJobId,
  }, logger);

  // Wait until NotBeforeUtc if somehow claimed early
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

  let replyText: string;
  let modelName = "unknown";
  let genLatency = 0;
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

  logAi("generation_complete", {
    businessId,
    conversationId: job.conversationId,
    jobId: job.aiReplyJobId,
    latencyMs: genLatency,
    model: modelName,
  }, logger);

  logAi("send_start", {
    businessId,
    conversationId: job.conversationId,
    jobId: job.aiReplyJobId,
  }, logger);

  let sendResult;
  try {
    sendResult = await sendMessage({
      accountKey,
      phone: contact.phoneNormalized,
      message: replyText,
    });
  } catch (error) {
    if (error instanceof WhatsAppRuntimeError) {
      const ambiguous =
        error.code === "RUNTIME_TIMEOUT"
        || error.code === "RUNTIME_UNAVAILABLE";
      const definitive =
        error.code === "NOT_READY"
        || error.code === "LOGGED_OUT"
        || error.code === "NOT_STARTED"
        || error.status === 409;

      if (ambiguous) {
        await completeJob({
          businessId,
          jobId: job.aiReplyJobId,
          status: "FAILED",
          errorCode: "UNKNOWN_SEND_RESULT",
        });
        logAi("failed", {
          businessId,
          jobId: job.aiReplyJobId,
          errorCode: "UNKNOWN_SEND_RESULT",
        }, logger);
        return { status: "FAILED", errorCode: "UNKNOWN_SEND_RESULT" };
      }

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
    await completeJob({
      businessId,
      jobId: job.aiReplyJobId,
      status: "FAILED",
      errorCode: "UNKNOWN_SEND_RESULT",
    });
    return { status: "FAILED", errorCode: "UNKNOWN_SEND_RESULT" };
  }

  if (!sendResult.success || !sendResult.messageId) {
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

  const providerMessageId = String(sendResult.messageId);
  const sentAt = new Date();

  await withTransaction(async (trx) => {
    await messagingRepo.insertMessageIdempotent(
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
    await messagingRepo.insertUsageEventInTrx(
      {
        businessId,
        eventType: "AI_REPLY_GENERATED",
        quantity: 1,
        metadata: { jobId: job.aiReplyJobId, model: modelName },
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
  });

  // recordUsageEvent available for non-trx paths; already inserted in trx above.
  void recordUsageEvent;

  await completeJob({
    businessId,
    jobId: job.aiReplyJobId,
    status: "SENT",
  });

  logAi("sent", {
    businessId,
    conversationId: job.conversationId,
    jobId: job.aiReplyJobId,
    model: modelName,
    latencyMs: genLatency,
  }, logger);

  return { status: "SENT" };
}
