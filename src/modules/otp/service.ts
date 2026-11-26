import { randomUUID } from "node:crypto";

import { query, sql, withTransaction } from "@/lib/db";
import { RateLimitError } from "@/lib/security/rate-limit";
import { reserveQuota, consumeQuotaReservation, releaseQuotaReservation } from "@/modules/billing/entitlements";
import { USAGE_EVENT_WHATSAPP_OUTBOUND } from "@/modules/billing/period";
import { findWhatsAppConnection } from "@/modules/channels/repository";
import { sendAccountMessage } from "@/modules/channels/runtime-client";
import type { Integration } from "@/types/domain";
import { PLATFORM_SIGNUP_OTP_TYPE } from "@/modules/integrations/otp-scope";

import {
  createOtpCode,
  hashOtpCode,
  matchesOtpCode,
  normalizeOtpPhone,
  OTP_MAX_ATTEMPTS,
  OTP_RESEND_SECONDS,
  OTP_TTL_SECONDS,
} from "./crypto";

export type OtpPurpose = "CUT_CLUB_SIGNUP" | "SIGNUP" | "LOGIN" | "PHONE_CHANGE";

export class OtpApiError extends Error {
  constructor(readonly code: string, readonly status: number, message: string) {
    super(message);
    this.name = "OtpApiError";
  }
}

type ChallengeRow = {
  ChallengeID: string;
  PhoneNormalized: string;
  Purpose: string;
  CodeHash: string;
  Status: "SENDING" | "SENT" | "UNKNOWN" | "FAILED" | "VERIFIED" | "LOCKED";
  AttemptCount: number;
  ExpiresAtUtc: Date;
  CreatedAtUtc: Date;
};

function phoneOrError(raw: string): string {
  const phone = normalizeOtpPhone(raw);
  if (!phone) throw new OtpApiError("INVALID_PHONE", 400, "Phone must be a valid international number");
  return phone;
}

function otpMessage(purpose: OtpPurpose, code: string): string {
  const service = purpose === "CUT_CLUB_SIGNUP" ? "CUT CLUB" : "حسابك";
  return `رمز التحقق الخاص بك في ${service}: *${code}*\nصالح لمدة 5 دقائق. لا تشارك الرمز مع أي شخص.\nإذا لم تطلب الرمز، تجاهل هذه الرسالة.`;
}

/**
 * The existing ERP pairing bearer key is strictly scoped to its DRVO business.
 * No browser may call this with the integration key. Never return or log codes.
 * SQL application locks enforce cooldown and limits across multiple instances.
 */
export async function sendExternalOtp(params: {
  integration: Integration;
  phone: string;
  purpose: OtpPurpose;
  requestId: string;
}): Promise<{
  challengeId: string;
  status: "SENT" | "SENDING" | "UNKNOWN";
  expiresAtUtc: string;
  resendAfterSec: number;
  idempotentReplay: boolean;
}> {
  const phone = phoneOrError(params.phone);
  const businessId = params.integration.businessId;
  const integrationId = params.integration.integrationId;

  const connection = await findWhatsAppConnection({ businessId });
  if (!connection?.isActive || connection.status !== "ACTIVE" || !connection.externalAccountKey) {
    throw new OtpApiError("WHATSAPP_NOT_READY", 409, "WhatsApp is not connected");
  }

  const challengeId = randomUUID();
  const code = createOtpCode();
  const codeHash = hashOtpCode({ businessId, challengeId, phone, purpose: params.purpose, code });
  const now = new Date();
  const expiresAt = new Date(now.getTime() + OTP_TTL_SECONDS * 1000);

  const claim = await withTransaction(async trx => {
    const lockResource = `drvo:otp:${businessId}`;
    const lock = await trx.query<{ lockStatus: number }>(
      `DECLARE @lockStatus INT;
       EXEC @lockStatus = sys.sp_getapplock
         @Resource = @lockResource, @LockMode = 'Exclusive',
         @LockOwner = 'Transaction', @LockTimeout = 10000;
       SELECT @lockStatus AS lockStatus;`,
      [{ name: "lockResource", type: sql.NVarChar(128), value: lockResource }],
    );
    if ((lock.recordset[0]?.lockStatus ?? -1) < 0) {
      throw new OtpApiError("OTP_BUSY", 503, "Please retry verification shortly");
    }

    const prior = await trx.query<ChallengeRow>(
      `SELECT TOP (1) ChallengeID, PhoneNormalized, Purpose, CodeHash,
              Status, AttemptCount, ExpiresAtUtc, CreatedAtUtc
       FROM dbo.TblOtpChallenge WITH (UPDLOCK, HOLDLOCK)
       WHERE IntegrationID = @integrationId AND RequestID = @requestId`,
      [
        { name: "integrationId", type: sql.UniqueIdentifier, value: integrationId },
        { name: "requestId", type: sql.UniqueIdentifier, value: params.requestId },
      ],
    );
    const found = prior.recordset[0];
    if (found) {
      if (found.PhoneNormalized !== phone || found.Purpose !== params.purpose) {
        throw new OtpApiError("REQUEST_ID_CONFLICT", 409, "Request ID is already used");
      }
      return { created: false, challenge: found };
    }

    const recent = await trx.query<{ CreatedAtUtc: Date }>(
      `SELECT TOP (10) CreatedAtUtc
       FROM dbo.TblOtpChallenge
       WHERE BusinessID = @businessId
         AND PhoneNormalized = @phone AND Purpose = @purpose
         AND CreatedAtUtc > DATEADD(HOUR, -24, SYSUTCDATETIME())
       ORDER BY CreatedAtUtc DESC`,
      [
        { name: "businessId", type: sql.UniqueIdentifier, value: businessId },
        { name: "phone", type: sql.NVarChar(20), value: phone },
        { name: "purpose", type: sql.NVarChar(48), value: params.purpose },
      ],
    );
    const sent = recent.recordset;
    const newest = sent[0]?.CreatedAtUtc;
    if (newest && now.getTime() - newest.getTime() < OTP_RESEND_SECONDS * 1000) {
      throw new RateLimitError(Math.ceil((OTP_RESEND_SECONDS * 1000 - (now.getTime() - newest.getTime())) / 1000));
    }
    if (sent.filter(row => now.getTime() - row.CreatedAtUtc.getTime() < 60 * 60_000).length >= 3) {
      throw new RateLimitError(3600, "OTP hourly limit exceeded");
    }
    if (sent.length >= 10) {
      throw new RateLimitError(86400, "OTP daily limit exceeded");
    }
    const globalCount = await trx.query<{ SendCount: number }>(
      `SELECT COUNT(*) AS SendCount FROM dbo.TblOtpChallenge
       WHERE BusinessID = @businessId
         AND CreatedAtUtc > DATEADD(HOUR, -1, SYSUTCDATETIME())`,
      [{ name: "businessId", type: sql.UniqueIdentifier, value: businessId }],
    );
    if ((globalCount.recordset[0]?.SendCount ?? 0) >= 100) {
      throw new RateLimitError(3600, "Business OTP hourly limit exceeded");
    }

    // Supersede prior unconsumed OTPs for the same phone and purpose.
    await trx.query(
      `UPDATE dbo.TblOtpChallenge SET Status = N'FAILED', UpdatedAtUtc = SYSUTCDATETIME()
       WHERE BusinessID = @businessId AND PhoneNormalized = @phone AND Purpose = @purpose
         AND Status IN (N'SENDING', N'SENT', N'UNKNOWN')`,
      [
        { name: "businessId", type: sql.UniqueIdentifier, value: businessId },
        { name: "phone", type: sql.NVarChar(20), value: phone },
        { name: "purpose", type: sql.NVarChar(48), value: params.purpose },
      ],
    );

    await trx.query(
      `INSERT INTO dbo.TblOtpChallenge
        (ChallengeID, BusinessID, IntegrationID, RequestID, PhoneNormalized,
         Purpose, CodeHash, Status, ExpiresAtUtc)
       VALUES (@challengeId, @businessId, @integrationId, @requestId,
               @phone, @purpose, @codeHash, N'SENDING', @expiresAtUtc)`,
      [
        { name: "challengeId", type: sql.UniqueIdentifier, value: challengeId },
        { name: "businessId", type: sql.UniqueIdentifier, value: businessId },
        { name: "integrationId", type: sql.UniqueIdentifier, value: integrationId },
        { name: "requestId", type: sql.UniqueIdentifier, value: params.requestId },
        { name: "phone", type: sql.NVarChar(20), value: phone },
        { name: "purpose", type: sql.NVarChar(48), value: params.purpose },
        { name: "codeHash", type: sql.Char(64), value: codeHash },
        { name: "expiresAtUtc", type: sql.DateTime2, value: expiresAt },
      ],
    );
    return { created: true, challenge: null };
  });

  if (!claim.created) {
    const existing = claim.challenge!;
    if (existing.Status !== "SENT" && existing.Status !== "SENDING" && existing.Status !== "UNKNOWN") {
      throw new OtpApiError("OTP_REQUEST_ALREADY_USED", 409, "Request is no longer active");
    }
    return {
      challengeId: existing.ChallengeID,
      status: existing.Status,
      expiresAtUtc: existing.ExpiresAtUtc.toISOString(),
      resendAfterSec: OTP_RESEND_SECONDS,
      idempotentReplay: true,
    };
  }

  const reservationKey = `otp:${integrationId}:${params.requestId}`;
  try {
    await reserveQuota({ businessId, eventType: USAGE_EVENT_WHATSAPP_OUTBOUND, reservationKey });
  } catch (error) {
    await setDeliveryStatus({ challengeId, status: "FAILED" });
    throw error;
  }

  try {
    const sent = await sendAccountMessage({
      accountKey: connection.externalAccountKey,
      phone,
      message: otpMessage(params.purpose, code),
      idempotencyKey: reservationKey,
    });
    if (!sent.success) {
      if (sent.code === "OUTBOUND_RESULT_UNKNOWN" || sent.status === "unknown") {
        await setDeliveryStatus({ challengeId, status: "UNKNOWN" });
        // The runtime might have handed the message to WhatsApp.
        // An observed/ambiguous send is counted as an outbound attempt.
        await consumeQuotaReservation({
          businessId, eventType: USAGE_EVENT_WHATSAPP_OUTBOUND, reservationKey,
          metadata: { source: "OTP_VERIFICATION", purpose: params.purpose, outcome: "UNKNOWN" },
        });
        return {
          challengeId, status: "UNKNOWN", expiresAtUtc: expiresAt.toISOString(),
          resendAfterSec: OTP_RESEND_SECONDS, idempotentReplay: false,
        };
      }
      throw new OtpApiError("OTP_DELIVERY_FAILED", 503, "Unable to send WhatsApp verification");
    }
    await setDeliveryStatus({
      challengeId,
      status: "SENT",
      providerMessageId: sent.messageId ?? null,
    });
    await consumeQuotaReservation({
      businessId,
      eventType: USAGE_EVENT_WHATSAPP_OUTBOUND,
      reservationKey,
      metadata: { source: "OTP_VERIFICATION", purpose: params.purpose },
    });
    return {
      challengeId,
      status: "SENT",
      expiresAtUtc: expiresAt.toISOString(),
      resendAfterSec: OTP_RESEND_SECONDS,
      idempotentReplay: false,
    };
  } catch (error) {
    // A timeout can happen after WhatsApp accepted the message; never
    // auto-retry under a different idempotency key.
    const delivery = await query<{ Status: string }>(
      `SELECT Status FROM dbo.TblOtpChallenge WHERE ChallengeID = @challengeId`,
      [{ name: "challengeId", type: sql.UniqueIdentifier, value: challengeId }],
    );
    if (delivery.recordset[0]?.Status === "SENDING") {
      const isDefinitiveFailure = error instanceof OtpApiError
        && error.code === "OTP_DELIVERY_FAILED";
      await setDeliveryStatus({
        challengeId, status: isDefinitiveFailure ? "FAILED" : "UNKNOWN",
      });
      if (isDefinitiveFailure) {
        await releaseQuotaReservation({
          businessId, eventType: USAGE_EVENT_WHATSAPP_OUTBOUND, reservationKey,
        });
      }
    }
    throw error;
  }
}

async function setDeliveryStatus(params: {
  challengeId: string;
  status: "SENT" | "FAILED" | "UNKNOWN";
  providerMessageId?: string | null;
}): Promise<void> {
  await query(
    `UPDATE dbo.TblOtpChallenge
     SET Status = @status, ProviderMessageID = @providerMessageId,
         UpdatedAtUtc = SYSUTCDATETIME()
     WHERE ChallengeID = @challengeId AND Status = N'SENDING'`,
    [
      { name: "challengeId", type: sql.UniqueIdentifier, value: params.challengeId },
      { name: "status", type: sql.NVarChar(16), value: params.status },
      { name: "providerMessageId", type: sql.NVarChar(128), value: params.providerMessageId ?? null },
    ],
  );
}

/** One successful verification consumes the OTP atomically. */
export async function verifyExternalOtp(params: {
  integration: Integration;
  challengeId: string;
  phone: string;
  purpose: OtpPurpose;
  code: string;
}): Promise<{ verified: true; phoneNormalized: string; purpose: OtpPurpose }> {
  const phone = phoneOrError(params.phone);
  const businessId = params.integration.businessId;
  const result = await withTransaction(async trx => {
    const selected = await trx.query<ChallengeRow>(
      `SELECT TOP (1) ChallengeID, PhoneNormalized, Purpose, CodeHash,
              Status, AttemptCount, ExpiresAtUtc, CreatedAtUtc
       FROM dbo.TblOtpChallenge WITH (UPDLOCK, HOLDLOCK)
       WHERE ChallengeID = @challengeId AND BusinessID = @businessId
         AND IntegrationID = @integrationId
         AND PhoneNormalized = @phone AND Purpose = @purpose`,
      [
        { name: "challengeId", type: sql.UniqueIdentifier, value: params.challengeId },
        { name: "businessId", type: sql.UniqueIdentifier, value: businessId },
        { name: "integrationId", type: sql.UniqueIdentifier, value: params.integration.integrationId },
        { name: "phone", type: sql.NVarChar(20), value: phone },
        { name: "purpose", type: sql.NVarChar(48), value: params.purpose },
      ],
    );
    const challenge = selected.recordset[0];
    if (!challenge || challenge.Status === "FAILED" || challenge.Status === "VERIFIED" || challenge.Status === "LOCKED") {
      return "INVALID" as const;
    }
    if (challenge.Status !== "SENT" && (challenge.Status !== "UNKNOWN" || params.integration.type === PLATFORM_SIGNUP_OTP_TYPE)) return "NOT_READY" as const;
    if (challenge.ExpiresAtUtc.getTime() <= Date.now()) return "EXPIRED" as const;
    if (challenge.AttemptCount >= OTP_MAX_ATTEMPTS) return "INVALID" as const;

    const match = matchesOtpCode(challenge.CodeHash, {
      businessId, challengeId: params.challengeId, phone, purpose: params.purpose, code: params.code,
    });
    if (!match) {
      const attemptCount = challenge.AttemptCount + 1;
      await trx.query(
        `UPDATE dbo.TblOtpChallenge
         SET AttemptCount = @attemptCount,
             Status = CASE WHEN @attemptCount >= @maxAttempts THEN N'LOCKED' ELSE Status END,
             UpdatedAtUtc = SYSUTCDATETIME()
         WHERE ChallengeID = @challengeId`,
        [
          { name: "attemptCount", type: sql.Int, value: attemptCount },
          { name: "maxAttempts", type: sql.Int, value: OTP_MAX_ATTEMPTS },
          { name: "challengeId", type: sql.UniqueIdentifier, value: params.challengeId },
        ],
      );
      return "INVALID" as const;
    }
    await trx.query(
      `UPDATE dbo.TblOtpChallenge
       SET Status = N'VERIFIED', VerifiedAtUtc = SYSUTCDATETIME(),
           UpdatedAtUtc = SYSUTCDATETIME()
       WHERE ChallengeID = @challengeId AND Status IN (N'SENT', N'UNKNOWN')`,
      [{ name: "challengeId", type: sql.UniqueIdentifier, value: params.challengeId }],
    );
    return "VERIFIED" as const;
  });
  if (result === "NOT_READY") throw new OtpApiError("OTP_NOT_READY", 409, "OTP send is not confirmed yet");
  if (result === "EXPIRED") throw new OtpApiError("OTP_EXPIRED", 410, "OTP expired; request another code");
  if (result !== "VERIFIED") throw new OtpApiError("INVALID_OTP", 400, "Invalid or already used verification code");
  return { verified: true, phoneNormalized: phone, purpose: params.purpose };
}
