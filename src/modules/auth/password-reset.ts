import { createHash, randomBytes, randomUUID } from "node:crypto";

import { query, sql } from "@/lib/db";
import { normalizeUuid } from "@/lib/ids/uuid";
import { structuredLog } from "@/lib/observability/logger";

import {
  getEmailProvider,
  isEmailDeliveryEnabled,
} from "./email-provider";
import { hashPassword } from "./password";
import { revokeAllSessionsForUser } from "./session";

const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
const MIN_PASSWORD_LEN = 8;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function hashResetToken(rawToken: string): string {
  return createHash("sha256").update(rawToken, "utf8").digest("hex");
}

/**
 * Public origin for customer-facing links (password reset).
 * Prefer APP_BASE_URL; fall back to NEXT_PUBLIC_APP_URL.
 */
export function resolveAppBaseUrl(): string {
  const fromEnv =
    process.env.APP_BASE_URL?.trim()
    || process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  return "http://localhost:3000";
}

/** Production emails must use HTTPS public host — never localhost. */
export function isProductionSafeAppBaseUrl(url: string): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    const host = parsed.hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1" || host === "::1") {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function buildPasswordResetEmail(resetUrl: string): {
  subject: string;
  textBody: string;
  htmlBody: string;
} {
  const subject = "إعادة تعيين كلمة المرور — DRVOWA";
  const textBody = [
    "DRVOWA AutoResponse",
    "",
    "طلبت إعادة تعيين كلمة المرور لحسابك.",
    "",
    "افتح الرابط التالي خلال ساعة واحدة",
    resetUrl,
    "",
    "إذا لم تطلب ذلك، يمكنك تجاهل هذه الرسالة بأمان.",
    "",
    "— فريق DRVOWA",
  ].join("\n");

  const safeUrl = resetUrl
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  const htmlBody = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
<body style="margin:0;padding:24px;background:#f8fafc;font-family:Tahoma,Arial,sans-serif;color:#0f172a;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;">
    <tr>
      <td style="padding:24px 28px 8px;">
        <p style="margin:0;font-size:13px;letter-spacing:0.04em;color:#b45309;font-weight:700;">DRVOWA</p>
        <h1 style="margin:8px 0 0;font-size:20px;line-height:1.4;">إعادة تعيين كلمة المرور</h1>
      </td>
    </tr>
    <tr>
      <td style="padding:8px 28px 24px;font-size:15px;line-height:1.7;color:#334155;">
        <p style="margin:0 0 16px;">طلبت إعادة تعيين كلمة المرور لحساب DRVOWA AutoResponse.</p>
        <p style="margin:0 0 20px;">الرابط صالح لمدة ساعة واحدة.</p>
        <p style="margin:0 0 24px;">
          <a href="${safeUrl}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:600;">تعيين كلمة مرور جديدة</a>
        </p>
        <p style="margin:0 0 12px;font-size:13px;color:#64748b;word-break:break-all;">أو افتح الرابط مباشرة:<br />${safeUrl}</p>
        <p style="margin:0;font-size:13px;color:#64748b;">إذا لم تطلب ذلك، تجاهل هذه الرسالة.</p>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, textBody, htmlBody };
}

/**
 * Always returns a generic success shape to prevent email enumeration.
 * Creates a durable hashed token when the user exists and is ACTIVE.
 */
export async function requestPasswordReset(params: {
  email: string;
  requestIp?: string | null;
}): Promise<{ accepted: true }> {
  const email = normalizeEmail(params.email);
  if (!email) {
    return { accepted: true };
  }

  const userResult = await query<{ UserID: string; Status: string }>(
    `SELECT UserID, Status FROM TblUser WHERE Email = @email`,
    [{ name: "email", type: sql.NVarChar(320), value: email }],
  );
  const row = userResult.recordset[0];
  if (!row || row.Status !== "ACTIVE") {
    return { accepted: true };
  }

  const userId = normalizeUuid(row.UserID);
  const rawToken = randomBytes(32).toString("base64url");
  const tokenHash = hashResetToken(rawToken);
  const now = new Date();
  const expiresAtUtc = new Date(now.getTime() + TOKEN_TTL_MS);
  const tokenId = randomUUID();

  // Invalidate prior unused tokens for this user
  await query(
    `UPDATE TblPasswordResetToken
     SET UsedAtUtc = @now
     WHERE UserID = @userId AND UsedAtUtc IS NULL`,
    [
      { name: "now", type: sql.DateTime2, value: now },
      { name: "userId", type: sql.UniqueIdentifier, value: userId },
    ],
  );

  await query(
    `INSERT INTO TblPasswordResetToken (
      PasswordResetTokenID, UserID, TokenHash, ExpiresAtUtc, CreatedAtUtc, UsedAtUtc, RequestIp
    ) VALUES (
      @tokenId, @userId, @tokenHash, @expiresAtUtc, @createdAtUtc, NULL, @requestIp
    )`,
    [
      { name: "tokenId", type: sql.UniqueIdentifier, value: tokenId },
      { name: "userId", type: sql.UniqueIdentifier, value: userId },
      { name: "tokenHash", type: sql.NVarChar(128), value: tokenHash },
      { name: "expiresAtUtc", type: sql.DateTime2, value: expiresAtUtc },
      { name: "createdAtUtc", type: sql.DateTime2, value: now },
      {
        name: "requestIp",
        type: sql.NVarChar(64),
        value: params.requestIp?.slice(0, 64) ?? null,
      },
    ],
  );

  const baseUrl = resolveAppBaseUrl();
  const resetUrl = `${baseUrl}/reset-password?token=${encodeURIComponent(rawToken)}`;
  const toDomain = email.includes("@") ? email.split("@")[1]! : "unknown";

  if (!isEmailDeliveryEnabled()) {
    structuredLog("auth", "password_reset.email_skipped", {
      reason: "EMAIL_PROVIDER_NOT_CONFIGURED",
      toDomain,
    });
    return { accepted: true };
  }

  if (!isProductionSafeAppBaseUrl(baseUrl)) {
    structuredLog("auth", "password_reset.email_skipped", {
      reason: "UNSAFE_APP_BASE_URL",
      toDomain,
    });
    return { accepted: true };
  }

  const content = buildPasswordResetEmail(resetUrl);
  const provider = getEmailProvider();
  try {
    const result = await provider.send({
      to: email,
      subject: content.subject,
      textBody: content.textBody,
      htmlBody: content.htmlBody,
    });
    structuredLog("auth", "password_reset.email_result", {
      status: result.status,
      provider: provider.name,
      toDomain,
      ...(result.status === "SENT" && result.providerMessageId
        ? { providerMessageId: result.providerMessageId }
        : {}),
      ...(result.status !== "SENT" ? { reason: result.reason } : {}),
    });
  } catch (error) {
    // Preserve non-enumeration: never fail the HTTP contract on provider errors.
    structuredLog("auth", "password_reset.email_failed", {
      provider: provider.name,
      toDomain,
      error: error instanceof Error ? error.message : "send_failed",
    });
  }

  return { accepted: true };
}

export async function completePasswordReset(params: {
  rawToken: string;
  newPassword: string;
}): Promise<{ ok: true } | { ok: false; code: string }> {
  const rawToken = params.rawToken.trim();
  const newPassword = params.newPassword;
  if (!rawToken) {
    return { ok: false, code: "INVALID_TOKEN" };
  }
  if (!newPassword || newPassword.length < MIN_PASSWORD_LEN) {
    return { ok: false, code: "PASSWORD_TOO_SHORT" };
  }

  const tokenHash = hashResetToken(rawToken);
  const now = new Date();

  const result = await query<{
    PasswordResetTokenID: string;
    UserID: string;
    ExpiresAtUtc: Date;
    UsedAtUtc: Date | null;
  }>(
    `SELECT PasswordResetTokenID, UserID, ExpiresAtUtc, UsedAtUtc
     FROM TblPasswordResetToken
     WHERE TokenHash = @tokenHash`,
    [{ name: "tokenHash", type: sql.NVarChar(128), value: tokenHash }],
  );

  const row = result.recordset[0];
  if (!row || row.UsedAtUtc) {
    return { ok: false, code: "INVALID_TOKEN" };
  }
  if (new Date(row.ExpiresAtUtc).getTime() <= now.getTime()) {
    return { ok: false, code: "TOKEN_EXPIRED" };
  }

  const userId = normalizeUuid(row.UserID);
  const passwordHash = await hashPassword(newPassword);

  await query(
    `UPDATE TblUser
     SET PasswordHash = @passwordHash, UpdatedAtUtc = @now
     WHERE UserID = @userId AND Status = N'ACTIVE'`,
    [
      { name: "passwordHash", type: sql.NVarChar(255), value: passwordHash },
      { name: "now", type: sql.DateTime2, value: now },
      { name: "userId", type: sql.UniqueIdentifier, value: userId },
    ],
  );

  await query(
    `UPDATE TblPasswordResetToken
     SET UsedAtUtc = @now
     WHERE PasswordResetTokenID = @tokenId`,
    [
      { name: "now", type: sql.DateTime2, value: now },
      {
        name: "tokenId",
        type: sql.UniqueIdentifier,
        value: normalizeUuid(row.PasswordResetTokenID),
      },
    ],
  );

  // Invalidate other unused tokens + all sessions (session fixation / theft)
  await query(
    `UPDATE TblPasswordResetToken
     SET UsedAtUtc = @now
     WHERE UserID = @userId AND UsedAtUtc IS NULL`,
    [
      { name: "now", type: sql.DateTime2, value: now },
      { name: "userId", type: sql.UniqueIdentifier, value: userId },
    ],
  );

  await revokeAllSessionsForUser(userId);

  return { ok: true };
}
