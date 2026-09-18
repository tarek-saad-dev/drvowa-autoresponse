import type { TransactionClient } from "@/lib/db";
import type { MessageContentType } from "@/types/domain";

import { getChannelAiSettingByConnection } from "./settings-repository";
import { scheduleOrCoalesceJob } from "./jobs-repository";

/**
 * After a newly inserted inbound TEXT message, schedule/coalesce an AI job.
 * Safe no-op when AI disabled or message is before EnabledAtUtc watermark.
 */
export async function maybeScheduleAiReplyAfterInbound(params: {
  businessId: string;
  channelConnectionId: string;
  conversationId: string;
  contactId: string;
  triggerMessageId: string;
  contentType: MessageContentType;
  messageReceivedAt: Date;
}, trx?: TransactionClient): Promise<{ scheduled: boolean; coalesced?: boolean }> {
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
    return { scheduled: false };
  }

  // Historical protection: only messages at/after activation watermark.
  if (params.messageReceivedAt.getTime() < setting.enabledAtUtc.getTime()) {
    return { scheduled: false };
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
