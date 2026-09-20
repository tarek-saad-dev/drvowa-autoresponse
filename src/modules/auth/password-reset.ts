import { createHash, randomBytes, randomUUID } from "node:crypto";

import { query, sql } from "@/lib/db";
import { normalizeUuid } from "@/lib/ids/uuid";

import { getEmailProvider } from "./email-provider";
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

function appBaseUrl(): string {
  const fromEnv =
    process.env.APP_BASE_URL?.trim()
    || process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  return "http://localhost:3000";
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

  const resetUrl = `${appBaseUrl()}/reset-password?token=${encodeURIComponent(rawToken)}`;
  const provider = getEmailProvider();
  await provider.send({
    to: email,
    subject: "إعادة تعيين كلمة المرور — DRVOWA",
    textBody: [
      "طلبت إعادة تعيين كلمة المرور لحساب DRVOWA AutoResponse.",
      "",
      `افتح الرابط خلال ساعة واحدة`,
      resetUrl,
      "",
      "إذا لم تطلب ذلك، تجاهل هذه الرسالة.",
    ].join("\n"),
  });

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
