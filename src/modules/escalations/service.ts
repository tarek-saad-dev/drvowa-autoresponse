import { createHmac, randomInt, randomUUID, timingSafeEqual } from "node:crypto";

import { query, sql, withTransaction, isUniqueViolationError, type TransactionClient } from "@/lib/db";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/tenancy/errors";
import { getMembership } from "@/modules/businesses/repository";
import { findWhatsAppConnection } from "@/modules/channels/repository";
import { sendAccountMessage } from "@/modules/channels/runtime-client";
import { getConversationForBusiness, getContactForBusiness } from "@/modules/messaging/repository";
import { pauseConversationAi } from "@/modules/ai/conversation-state-repository";
import { OPEN_ESCALATION_SQL } from "./open-escalation-sql";

export type EscalationStatus = "OPEN" | "ACKNOWLEDGED" | "RESOLVED";
export type NotifyStatus = "PENDING" | "SENDING" | "SENT" | "UNKNOWN" | "FAILED" | "CANCELLED";
export type EscalationRow = {
  EscalationID: string;
  BusinessID: string;
  ConversationID: string;
  ChannelConnectionID: string;
  ReasonCode: string;
  ReasonText: string;
  Status: EscalationStatus;
  NotificationStatus: NotifyStatus;
  NotificationLastErrorCode: string | null;
  NotificationSentAtUtc: Date | null;
  CreatedAtUtc: Date;
  AcknowledgedAtUtc: Date | null;
  ResolvedAtUtc: Date | null;
  FollowUpPhase: string;
  LastHumanReplyAtUtc: Date | null;
  LastCustomerReplyAtUtc: Date | null;
};
type SettingRow = {
  OwnerPhone: string | null;
  IsEnabled: boolean;
  PhoneVerifiedAtUtc: Date | null;
  VerificationHash: string | null;
  VerificationExpiresAtUtc: Date | null;
  VerificationRequestedAtUtc: Date | null;
  VerificationAttempts: number;
  NotifyBotSelfEnabled?: boolean | null;
};
export type EscalationSetting = {
  phone: string | null;
  enabled: boolean;
  verified: boolean;
  /** Also send the alert into the bot number's own WhatsApp chat (Message yourself). */
  notifyBotSelf: boolean;
};

const businessParam = (id: string) => [{ name: "businessId", type: sql.UniqueIdentifier, value: id }];
const conversationParams = (businessId: string, conversationId: string) => [
  ...businessParam(businessId),
  { name: "conversationId", type: sql.UniqueIdentifier, value: conversationId },
];

export function normalizeOwnerPhone(phone: string): string {
  const digits = phone.replace(/[\s\-()+]/g, "");
  const normalized = digits.length === 11 && digits.startsWith("01") ? "2" + digits : digits;
  if (!/^\d{8,15}$/.test(normalized)) throw new ValidationError("اكتب رقم واتساب دولي صحيح بدون رموز.");
  return normalized;
}

/** Only explicit requests for a real human are auto-escalated; do not guess from sentiment. */
export function requestsHumanAgent(text: string): boolean {
  const normalized = text.trim().toLowerCase().replace(/[أإآ]/g, "ا").replace(/ى/g, "ي");
  return /(?:عايز|عاوز|ممكن|اريد|محتاج)\s+(?:اكلم|اتكلم مع|اتواصل مع|كلموني|حد من|موظف|المدير|مسؤول|انسان|شخص حقيقي)/u.test(normalized)
    || /(?:اكلم|اتواصل مع)\s+(?:موظف|المدير|المسؤول|حد حقيقي|حد من الادارة)/u.test(normalized)
    || /(?:human agent|real person|talk to (?:a )?(?:person|manager|human)|customer support)/i.test(text);
}

/** Business owner replies should be stored, but never become AI customer prompts. */
export async function isEscalationOwnerPhone(businessId: string, phone: string | null): Promise<boolean> {
  if (!phone) return false;
  const res = await query<{ Found: number }>(
    `SELECT 1 AS Found FROM dbo.TblHumanEscalationSetting
      WHERE BusinessID = @businessId AND OwnerPhone = @phone`,
    [...businessParam(businessId), { name: "phone", type: sql.NVarChar(20), value: phone }],
  );
  return Boolean(res.recordset[0]);
}

export async function requireEscalationAdmin(businessId: string, userId: string): Promise<void> {
  const m = await getMembership({ businessId, userId });
  if (!m || m.status !== "ACTIVE" || !["OWNER", "ADMIN"].includes(m.role)) {
    throw new ForbiddenError("Only the business owner or administrator may manage escalations");
  }
}

async function readSetting(businessId: string, trx?: TransactionClient): Promise<SettingRow | null> {
  const result = await (trx?.query ?? query)<SettingRow>(
    `SELECT OwnerPhone, IsEnabled, PhoneVerifiedAtUtc, VerificationHash,
            VerificationExpiresAtUtc, VerificationRequestedAtUtc, VerificationAttempts,
            NotifyBotSelfEnabled
     FROM dbo.TblHumanEscalationSetting WHERE BusinessID = @businessId`,
    businessParam(businessId),
  );
  return result.recordset[0] ?? null;
}
export async function getEscalationSetting(businessId: string): Promise<EscalationSetting> {
  const row = await readSetting(businessId);
  return {
    phone: row?.OwnerPhone ?? null,
    enabled: Boolean(row?.IsEnabled),
    verified: Boolean(row?.PhoneVerifiedAtUtc),
    notifyBotSelf: row?.NotifyBotSelfEnabled !== false,
  };
}

export async function updateEscalationSetting(params: {
  businessId: string;
  userId: string;
  phone: string;
  enabled: boolean;
  notifyBotSelf?: boolean;
}): Promise<EscalationSetting> {
  await requireEscalationAdmin(params.businessId, params.userId);
  const phone = normalizeOwnerPhone(params.phone);
  await withTransaction(async trx => {
    const current = await readSetting(params.businessId, trx);
    if (params.enabled && (!current?.PhoneVerifiedAtUtc || current.OwnerPhone !== phone)) {
      throw new ValidationError("لازم تأكد رقم المالك بالكود قبل تفعيل إشعارات واتساب.");
    }
    const notifyBotSelf = params.notifyBotSelf ?? (current?.NotifyBotSelfEnabled !== false);
    await trx.execute(
      `MERGE dbo.TblHumanEscalationSetting WITH (HOLDLOCK) AS target
       USING (SELECT @businessId AS BusinessID) AS src ON src.BusinessID = target.BusinessID
       WHEN MATCHED THEN UPDATE SET
         OwnerPhone = @phone, IsEnabled = @enabled,
         NotifyBotSelfEnabled = @notifyBotSelf,
         PhoneVerifiedAtUtc = CASE WHEN target.OwnerPhone = @phone THEN target.PhoneVerifiedAtUtc ELSE NULL END,
         VerificationHash = CASE WHEN target.OwnerPhone = @phone THEN target.VerificationHash ELSE NULL END,
         VerificationExpiresAtUtc = CASE WHEN target.OwnerPhone = @phone THEN target.VerificationExpiresAtUtc ELSE NULL END,
         UpdatedAtUtc = SYSUTCDATETIME()
       WHEN NOT MATCHED THEN INSERT (BusinessID, OwnerPhone, IsEnabled, NotifyBotSelfEnabled)
         VALUES (@businessId, @phone, @enabled, @notifyBotSelf);`,
      [...businessParam(params.businessId),
        { name: "phone", type: sql.NVarChar(20), value: phone },
        { name: "enabled", type: sql.Bit, value: params.enabled },
        { name: "notifyBotSelf", type: sql.Bit, value: notifyBotSelf }],
    );
  });
  return getEscalationSetting(params.businessId);
}

function verificationDigest(businessId: string, phone: string, code: string): string {
  const secret = process.env.INTEGRATION_SECRET_KEY?.trim();
  if (!secret || secret.length < 32) {
    throw new ValidationError(
      "إعداد التحقق غير مكتمل على السيرفر (INTEGRATION_SECRET_KEY). راجع إعدادات البيئة.",
    );
  }
  return createHmac("sha256", secret).update([businessId, phone, code].join(":")).digest("hex");
}

export async function requestOwnerVerification(businessId: string, userId: string) {
  await requireEscalationAdmin(businessId, userId);
  const channel = await findWhatsAppConnection({ businessId });
  if (!channel?.externalAccountKey || !channel.isActive) {
    throw new ValidationError("اربط رقم واتساب البيزنس الأول قبل طلب كود التحقق.");
  }
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const sent = await withTransaction(async trx => {
    const current = await trx.query<SettingRow>(
      `SELECT OwnerPhone, IsEnabled, PhoneVerifiedAtUtc, VerificationHash,
        VerificationExpiresAtUtc, VerificationRequestedAtUtc, VerificationAttempts
       FROM dbo.TblHumanEscalationSetting WITH (UPDLOCK, HOLDLOCK)
       WHERE BusinessID = @businessId`, businessParam(businessId),
    );
    const setting = current.recordset[0];
    if (!setting?.OwnerPhone) throw new ValidationError("احفظ رقم المالك الأول.");
    if (setting.VerificationRequestedAtUtc && Date.now() - setting.VerificationRequestedAtUtc.getTime() < 60_000) {
      throw new ValidationError("استنى دقيقة قبل إعادة إرسال كود جديد.");
    }
    await trx.execute(
      `UPDATE dbo.TblHumanEscalationSetting
       SET VerificationHash = @digest, VerificationExpiresAtUtc = DATEADD(minute, 10, SYSUTCDATETIME()),
           VerificationRequestedAtUtc = SYSUTCDATETIME(), VerificationAttempts = 0, UpdatedAtUtc = SYSUTCDATETIME()
       WHERE BusinessID = @businessId`,
      [...businessParam(businessId),
        { name: "digest", type: sql.NVarChar(128), value: verificationDigest(businessId, setting.OwnerPhone, code) }],
    );
    return setting.OwnerPhone;
  });
  // Explicit verification send only, not an escalation; unknown sends aren't retried automatically.
  const outcome = await sendAccountMessage({
    accountKey: channel.externalAccountKey,
    phone: sent,
    message: "DRVO AutoResponse: كود تأكيد رقم مسؤول إشعارات البيزنس هو " + code
      + ". صالح لمدة 10 دقائق. لا تشارك الكود مع أي شخص.",
    idempotencyKey: "owner-verify:" + businessId + ":" + verificationDigest(businessId, sent, code).slice(0, 30),
  });
  if (!outcome.success || !outcome.messageId) {
    throw new ValidationError("تعذر تأكيد إرسال الكود على واتساب. راجع اتصال الرقم.");
  }
  return { sent: true };
}

export async function confirmOwnerVerification(businessId: string, userId: string, code: string) {
  await requireEscalationAdmin(businessId, userId);
  if (!/^\d{6}$/.test(code)) throw new ValidationError("كود التحقق لازم يكون 6 أرقام.");
  return withTransaction(async trx => {
    const rows = await trx.query<SettingRow>(
      `SELECT OwnerPhone, IsEnabled, PhoneVerifiedAtUtc, VerificationHash,
        VerificationExpiresAtUtc, VerificationRequestedAtUtc, VerificationAttempts
       FROM dbo.TblHumanEscalationSetting WITH (UPDLOCK, HOLDLOCK)
       WHERE BusinessID = @businessId`, businessParam(businessId),
    );
    const row = rows.recordset[0];
    if (!row?.OwnerPhone || !row.VerificationHash || !row.VerificationExpiresAtUtc
      || row.VerificationExpiresAtUtc.getTime() < Date.now() || row.VerificationAttempts >= 5) {
      throw new ValidationError("الكود انتهت صلاحيته أو تجاوز عدد المحاولات.");
    }
    const provided = Buffer.from(verificationDigest(businessId, row.OwnerPhone, code), "hex");
    const expected = Buffer.from(row.VerificationHash, "hex");
    if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
      await trx.execute(
        `UPDATE dbo.TblHumanEscalationSetting SET VerificationAttempts = VerificationAttempts + 1 WHERE BusinessID = @businessId`,
        businessParam(businessId),
      );
      return { verified: false };
    }
    await trx.execute(
      `UPDATE dbo.TblHumanEscalationSetting SET PhoneVerifiedAtUtc = SYSUTCDATETIME(),
          VerificationHash = NULL, VerificationExpiresAtUtc = NULL, VerificationAttempts = 0,
          UpdatedAtUtc = SYSUTCDATETIME()
        WHERE BusinessID = @businessId`, businessParam(businessId),
    );
    return { verified: true };
  });
}

export function escalationMessage(params: {
  businessId: string;
  businessName: string;
  customerPhone?: string | null;
  customerLabel?: string | null;
  conversationId: string;
  reason: string;
  /**
   * WhatsApp deep-link to open the customer chat.
   * Only for bot-self ("Message yourself") mirrors — never for the owner alert.
   */
  includeWhatsAppDeepLink?: boolean;
}): string {
  const safeReason = params.reason.replace(/[\r\n\t]+/g, " ").slice(0, 200);
  const phone = params.customerPhone?.trim() || null;
  const label = phone
    ? ("+" + phone)
    : (params.customerLabel?.trim() || "غير ظاهر حاليًا");
  const app = "https://app.drvotech.com/dashboard/inbox?businessId=" + encodeURIComponent(params.businessId)
    + "&conversationId=" + encodeURIComponent(params.conversationId);
  // Compact bot-self mirror: just the alert + clickable customer chat.
  if (params.includeWhatsAppDeepLink) {
    if (phone) {
      return "⚠️ عميل محتاج تدخل\n"
        + label.slice(0, 64) + "\n"
        + "https://wa.me/" + encodeURIComponent(phone);
    }
    return "⚠️ عميل محتاج تدخل\n"
      + label.slice(0, 64) + "\n"
      + app;
  }

  return "⚠️ DRVO | عميل محتاج متابعة بشرية\n"
    + "البيزنس: " + params.businessName.slice(0, 100) + "\n"
    + "العميل: " + label.slice(0, 64) + "\n"
    + "السبب: " + safeReason + "\n\n"
    + "متابعة المحادثة داخل DRVO:\n" + app + "\n\n"
    + "ادخل DRVO لتأكيد استلام الحالة ثم إنهاء المتابعة.";
}

/** Owner alert is allowed even when the customer identity is an opaque LID (no phone yet). */
export function isOwnerNotifyEligible(params: {
  enabled: boolean;
  verified: boolean;
  ownerPhone: string | null;
  customerPhoneNormalized: string | null;
}): boolean {
  if (!params.enabled || !params.verified || !params.ownerPhone) return false;
  if (params.customerPhoneNormalized && params.customerPhoneNormalized === params.ownerPhone) {
    return false;
  }
  return true;
}

/** Unresolved escalations that still need an owner follow-up. */
export async function countOpenEscalations(businessId: string): Promise<number> {
  const result = await query<{ OpenCount: number }>(
    `SELECT COUNT(1) AS OpenCount
       FROM dbo.TblHumanEscalation e
      WHERE e.BusinessID = @businessId AND ${OPEN_ESCALATION_SQL}`,
    businessParam(businessId),
  );
  return Number(result.recordset[0]?.OpenCount ?? 0);
}

export async function getEscalation(businessId: string, conversationId: string) {
  const result = await query<EscalationRow>(
    `SELECT TOP 1 EscalationID, BusinessID, ConversationID, ChannelConnectionID, ReasonCode, ReasonText,
      Status, NotificationStatus, NotificationLastErrorCode, NotificationSentAtUtc,
      CreatedAtUtc, AcknowledgedAtUtc, ResolvedAtUtc,
      FollowUpPhase, LastHumanReplyAtUtc, LastCustomerReplyAtUtc
      FROM dbo.TblHumanEscalation
      WHERE BusinessID = @businessId AND ConversationID = @conversationId AND ResolvedAtUtc IS NULL
      ORDER BY CreatedAtUtc DESC`, conversationParams(businessId, conversationId),
  );
  const row = result.recordset[0];
  return row ? {
    id: row.EscalationID,
    status: row.Status,
    reason: row.ReasonText,
    reasonCode: row.ReasonCode,
    notificationStatus: row.NotificationStatus,
    notificationError: row.NotificationLastErrorCode,
    createdAtUtc: row.CreatedAtUtc.toISOString(),
    acknowledgedAtUtc: row.AcknowledgedAtUtc?.toISOString() ?? null,
    phase: row.FollowUpPhase === "IN_PROGRESS" || row.FollowUpPhase === "WAITING_CUSTOMER"
      ? row.FollowUpPhase : "NEEDS_ATTENTION",
    lastHumanReplyAtUtc: row.LastHumanReplyAtUtc?.toISOString() ?? null,
    lastCustomerReplyAtUtc: row.LastCustomerReplyAtUtc?.toISOString() ?? null,
  } : null;
}

/** Deduplicate manual and automatic triggers: only one unresolved escalation per conversation. */
export async function createEscalation(params: {
  businessId: string; conversationId: string; reasonCode: string; reason: string;
  pauseAi?: boolean;
}): Promise<{ created: boolean; escalation: Awaited<ReturnType<typeof getEscalation>> }> {
  const conversation = await getConversationForBusiness(params);
  if (!conversation) throw new NotFoundError("Conversation not found");
  const setting = await getEscalationSetting(params.businessId);
  // Creating a case must work without alert configuration: operators can still track it.
  const customer = await getContactForBusiness({
    businessId: params.businessId, contactId: conversation.contactId,
  });
  const notifyEligible = isOwnerNotifyEligible({
    enabled: setting.enabled,
    verified: setting.verified,
    ownerPhone: setting.phone,
    customerPhoneNormalized: customer?.phoneNormalized ?? null,
  });
  let created = false;
  await withTransaction(async trx => {
    const active = await trx.query<{
      EscalationID: string;
      NotificationStatus: NotifyStatus;
      NotificationLastErrorCode: string | null;
    }>(
      `SELECT EscalationID, NotificationStatus, NotificationLastErrorCode
         FROM dbo.TblHumanEscalation WITH (UPDLOCK, HOLDLOCK)
       WHERE BusinessID = @businessId AND ConversationID = @conversationId AND ResolvedAtUtc IS NULL`,
      conversationParams(params.businessId, params.conversationId),
    );
    if (active.recordset.length) {
      const row = active.recordset[0]!;
      // Repair cases cancelled only because customer phone was missing (opaque LID).
      if (
        notifyEligible
        && row.NotificationStatus === "CANCELLED"
        && (row.NotificationLastErrorCode === "NOTIFICATION_NOT_ELIGIBLE"
          || row.NotificationLastErrorCode == null)
      ) {
        await trx.execute(
          `UPDATE dbo.TblHumanEscalation
              SET NotificationStatus = N'PENDING',
                  NotificationLastErrorCode = NULL,
                  NotificationNotBeforeUtc = SYSUTCDATETIME(),
                  CustomerHoldNextAtUtc = CASE
                    WHEN CustomerHoldStep = 0 AND LastHumanReplyAtUtc IS NULL
                      THEN COALESCE(CustomerHoldNextAtUtc, SYSUTCDATETIME())
                    ELSE NULL END,
                  UpdatedAtUtc = SYSUTCDATETIME()
            WHERE EscalationID = @id AND BusinessID = @businessId
              AND ResolvedAtUtc IS NULL AND NotificationStatus = N'CANCELLED'`,
          [
            { name: "id", type: sql.UniqueIdentifier, value: row.EscalationID },
            { name: "businessId", type: sql.UniqueIdentifier, value: params.businessId },
          ],
        );
      }
      return;
    }
    const escalationId = randomUUID();
    try {
      await trx.execute(
        `INSERT INTO dbo.TblHumanEscalation (
           EscalationID, BusinessID, ConversationID, ChannelConnectionID,
           ReasonCode, ReasonText, NotificationStatus,
           CustomerHoldStep, CustomerHoldNextAtUtc)
         VALUES (@id, @businessId, @conversationId, @channelConnectionId,
           @reasonCode, @reason, @notificationStatus,
           0, SYSUTCDATETIME())`,
        [...conversationParams(params.businessId, params.conversationId),
          { name: "id", type: sql.UniqueIdentifier, value: escalationId },
          { name: "channelConnectionId", type: sql.UniqueIdentifier, value: conversation.channelConnectionId },
          { name: "reasonCode", type: sql.NVarChar(48), value: params.reasonCode.slice(0, 48) },
          { name: "reason", type: sql.NVarChar(300), value: params.reason.slice(0, 300) },
          { name: "notificationStatus", type: sql.NVarChar(20), value: notifyEligible ? "PENDING" : "CANCELLED" }],
      );
      await trx.execute(
        `INSERT INTO dbo.TblFollowUpEvent
           (BusinessID, EscalationID, ConversationID, EventKey, EventType, EventAtUtc)
         VALUES (@businessId,@escalationId,@conversationId,N'CREATED',N'CASE_OPENED',SYSUTCDATETIME())`,
        [...conversationParams(params.businessId, params.conversationId),
         { name: "escalationId", type: sql.UniqueIdentifier, value: escalationId }],
      );
      created = true;
    } catch (error) {
      if (!isUniqueViolationError(error)) throw error;
    }
    if (params.pauseAi) await pauseConversationAi({
      businessId: params.businessId, conversationId: params.conversationId,
      mode: "HUMAN_PAUSED", pauseReason: "ESCALATION",
    }, trx);
  });
  return { created, escalation: await getEscalation(params.businessId, params.conversationId) };
}

export async function updateEscalationStatus(params: {
  businessId: string; conversationId: string; userId: string; status: "ACKNOWLEDGED" | "RESOLVED";
}) {
  await requireEscalationAdmin(params.businessId, params.userId);
  await withTransaction(async (trx) => {
    const updated = await trx.query<{ EscalationID: string }>(
      `UPDATE e
       SET Status = @status,
           AcknowledgedAtUtc = COALESCE(e.AcknowledgedAtUtc, SYSUTCDATETIME()),
           AcknowledgedByUserID = COALESCE(e.AcknowledgedByUserID, @userId),
           ResolvedAtUtc = CASE WHEN @status = N'RESOLVED' THEN SYSUTCDATETIME() ELSE NULL END,
           FollowUpPhase = CASE WHEN @status = N'RESOLVED' THEN N'RESOLVED' ELSE e.FollowUpPhase END,
           ResolutionSource = CASE WHEN @status = N'RESOLVED' THEN N'MANUAL_CONFIRMED' ELSE e.ResolutionSource END,
           NotificationStatus = CASE WHEN @status = N'RESOLVED' AND e.NotificationStatus = N'PENDING'
             THEN N'CANCELLED' ELSE e.NotificationStatus END,
           CustomerHoldNextAtUtc = NULL,
           CustomerHoldClaimedAtUtc = CASE WHEN @status = N'RESOLVED' THEN NULL ELSE e.CustomerHoldClaimedAtUtc END,
           UpdatedAtUtc = SYSUTCDATETIME()
       OUTPUT INSERTED.EscalationID
       FROM dbo.TblHumanEscalation e WITH (UPDLOCK)
       WHERE e.BusinessID = @businessId AND e.ConversationID = @conversationId
         AND e.ResolvedAtUtc IS NULL
         AND e.Status IN (N'OPEN', N'ACKNOWLEDGED')`,
      [...conversationParams(params.businessId, params.conversationId),
        { name: "status", type: sql.NVarChar(20), value: params.status },
        { name: "userId", type: sql.UniqueIdentifier, value: params.userId }],
    );
    const row = updated.recordset[0];
    if (row) {
      const type = params.status === "RESOLVED" ? "MANUALLY_RESOLVED" : "MANUALLY_ACKNOWLEDGED";
      await trx.execute(
        `INSERT INTO dbo.TblFollowUpEvent
          (BusinessID,EscalationID,ConversationID,EventKey,EventType,EventAtUtc)
         VALUES (@businessId,@escalationId,@conversationId,@eventKey,@eventType,SYSUTCDATETIME())`,
        [...conversationParams(params.businessId, params.conversationId),
          { name: "escalationId", type: sql.UniqueIdentifier, value: row.EscalationID },
          { name: "eventKey", type: sql.NVarChar(160), value: "OPERATOR:" + randomUUID() },
          { name: "eventType", type: sql.NVarChar(40), value: type }],
      );
    }
  });
  return getEscalation(params.businessId, params.conversationId);
}
