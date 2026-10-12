import { query, sql } from "@/lib/db";
import { getBusinessById } from "@/modules/businesses/service";
import { getChannelConnection } from "@/modules/channels/repository";
import { sendAccountMessage, WhatsAppRuntimeError } from "@/modules/channels/runtime-client";
import { getContactForBusiness, getConversationForBusiness } from "@/modules/messaging/repository";
import { escalationMessage } from "./service";

type Claimed = {
  EscalationID: string;
  BusinessID: string;
  ConversationID: string;
  ChannelConnectionID: string;
  ReasonText: string;
};
export async function deliverNextEscalationNotification(
  send: typeof sendAccountMessage = sendAccountMessage,
): Promise<"IDLE" | "SENT" | "RETRY" | "UNKNOWN" | "FAILED"> {
  // An uncertain in-flight request is never reclaimed automatically: the runtime
  // may have sent it just before the worker died.
  const r = await query<Claimed>(
    `;WITH due AS (
      SELECT TOP (1) * FROM dbo.TblHumanEscalation WITH (UPDLOCK, READPAST, ROWLOCK)
      WHERE NotificationStatus = N'PENDING'
        AND NotificationNotBeforeUtc <= SYSUTCDATETIME()
        AND ResolvedAtUtc IS NULL
      ORDER BY NotificationNotBeforeUtc, CreatedAtUtc
    )
    UPDATE due
    SET NotificationStatus = N'SENDING', NotificationClaimedAtUtc = SYSUTCDATETIME(),
        NotificationAttempts = NotificationAttempts + 1, UpdatedAtUtc = SYSUTCDATETIME()
    OUTPUT INSERTED.EscalationID, INSERTED.BusinessID, INSERTED.ConversationID,
           INSERTED.ChannelConnectionID, INSERTED.ReasonText;`,
  );
  const job = r.recordset[0];
  if (!job) return "IDLE";

  const params = [
    { name: "id", type: sql.UniqueIdentifier, value: job.EscalationID },
    { name: "businessId", type: sql.UniqueIdentifier, value: job.BusinessID },
  ];
  async function finalize(status: string, code: string | null, providerMessageId: string | null = null) {
    await query(
      `UPDATE dbo.TblHumanEscalation
       SET NotificationStatus = @status, NotificationLastErrorCode = @code,
         NotificationSentAtUtc = CASE WHEN @status = N'SENT' THEN SYSUTCDATETIME() ELSE NotificationSentAtUtc END,
         NotificationProviderMessageID = COALESCE(@providerMessageId, NotificationProviderMessageID),
         NotificationNotBeforeUtc = CASE WHEN @status = N'PENDING' THEN DATEADD(second, 90, SYSUTCDATETIME())
           ELSE NotificationNotBeforeUtc END,
         UpdatedAtUtc = SYSUTCDATETIME()
       WHERE EscalationID = @id AND BusinessID = @businessId AND NotificationStatus = N'SENDING'`,
      [...params, { name: "status", type: sql.NVarChar(20), value: status },
        { name: "code", type: sql.NVarChar(80), value: code },
        { name: "providerMessageId", type: sql.NVarChar(256), value: providerMessageId }],
    );
  }

  try {
    const [setting, business, conversation, channel] = await Promise.all([
      query<{ OwnerPhone: string | null; IsEnabled: boolean; PhoneVerifiedAtUtc: Date | null }>(
        `SELECT OwnerPhone, IsEnabled, PhoneVerifiedAtUtc
         FROM dbo.TblHumanEscalationSetting WHERE BusinessID = @businessId`,
        [{ name: "businessId", type: sql.UniqueIdentifier, value: job.BusinessID }],
      ),
      getBusinessById({ businessId: job.BusinessID }),
      getConversationForBusiness({ businessId: job.BusinessID, conversationId: job.ConversationID }),
      getChannelConnection({ businessId: job.BusinessID, channelConnectionId: job.ChannelConnectionID }),
    ]);
    const cfg = setting.recordset[0];
    const contact = conversation ? await getContactForBusiness({
      businessId: job.BusinessID, contactId: conversation.contactId,
    }) : null;
    if (!cfg?.IsEnabled || !cfg.OwnerPhone || !cfg.PhoneVerifiedAtUtc || !channel?.externalAccountKey
      || !channel.isActive || !contact?.phoneNormalized || cfg.OwnerPhone === contact.phoneNormalized) {
      await finalize("CANCELLED", "NOTIFICATION_NOT_ELIGIBLE");
      return "FAILED";
    }
    const message = escalationMessage({
      businessName: business?.name ?? "البيزنس",
      customerPhone: contact.phoneNormalized,
      conversationId: job.ConversationID,
      reason: job.ReasonText,
    });
    const result = await send({
      accountKey: channel.externalAccountKey,
      phone: cfg.OwnerPhone,
      message,
      idempotencyKey: "owner-escalation:" + job.EscalationID,
    });
    if (result.success && result.messageId) {
      await finalize("SENT", null, result.originalMessageId ?? result.messageId);
      return "SENT";
    }
    // Never replay an uncertain outbound with a new key.
    if (result.code === "NOT_READY" || result.code === "NOT_STARTED" || result.code === "LOGGED_OUT") {
      await finalize("PENDING", result.code);
      return "RETRY";
    }
    await finalize("UNKNOWN", result.code ?? "SEND_RESULT_UNKNOWN");
    return "UNKNOWN";
  } catch (error) {
    const code = error instanceof WhatsAppRuntimeError ? error.code : "NOTIFICATION_WORKER_ERROR";
    if (["NOT_READY", "NOT_STARTED", "LOGGED_OUT"].includes(code)) {
      await finalize("PENDING", code);
      return "RETRY";
    }
    // Timeout/unavailable can be an acknowledged send: no automatic retry.
    await finalize("UNKNOWN", code);
    return "UNKNOWN";
  }
}
