import type { TransactionClient } from "@/lib/db";
import type { MessageContentType } from "@/types/domain";

import { evaluateConversationAiScheduleGate } from "./conversation-state-repository";
import { evaluateConversationLoopGuard } from "./guard-repository";
import { scheduleOrCoalesceJob } from "./jobs-repository";
import { getChannelAiSettingByConnection } from "./settings-repository";

/**
 * After a newly inserted inbound TEXT message, schedule/coalesce an AI job.
 * Safe no-op when AI disabled, paused, before watermarks, or loop-guarded.
 */
export async function maybeScheduleAiReplyAfterInbound(params: {
  businessId: string;
  channelConnectionId: string;
  conversationId: string;
  contactId: string;
  triggerMessageId: string;
  contentType: MessageContentType;
  messageReceivedAt: Date;
}, trx?: TransactionClient): Promise<{
  scheduled: boolean;
  coalesced?: boolean;
  reason?: string;
}> {
  if (params.contentType !== "TEXT") {
    return { scheduled: false };
  }

  const setting = await getChannelAiSettingByConnection(
    {
      businessId: params.businessId,
      channelConnectionId: params.channelConnectionId,
    },
    trx,
  );

  if (!setting || !setting.autoReplyEnabled || !setting.enabledAtUtc) {
    return { scheduled: false, reason: "AI_DISABLED" };
  }

  // Historical protection: only messages at/after activation watermark.
  if (params.messageReceivedAt.getTime() < setting.enabledAtUtc.getTime()) {
    return { scheduled: false, reason: "STALE_ACTIVATION" };
  }

  const conversationGate = await evaluateConversationAiScheduleGate(
    {
      businessId: params.businessId,
      conversationId: params.conversationId,
      messageReceivedAt: params.messageReceivedAt,
    },
    trx,
  );
  if (!conversationGate.allow) {
    return {
      scheduled: false,
      reason: conversationGate.reason ?? "CONVERSATION_PAUSED",
    };
  }

  const guard = await evaluateConversationLoopGuard(
    {
      businessId: params.businessId,
      conversationId: params.conversationId,
    },
    trx,
  );
  if (!guard.allow) {
    return { scheduled: false, reason: guard.reason ?? "LOOP_GUARD_ACTIVE" };
  }

  const result = await scheduleOrCoalesceJob(
    {
      businessId: params.businessId,
      channelConnectionId: params.channelConnectionId,
      conversationId: params.conversationId,
      contactId: params.contactId,
      triggerMessageId: params.triggerMessageId,
      debounceMs: setting.debounceMs,
    },
    trx,
  );

  return { scheduled: true, coalesced: result.coalesced };
}
