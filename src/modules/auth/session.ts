import { createHash, randomBytes, randomUUID } from "node:crypto";

import { query, sql } from "@/lib/db";
import { normalizeNullableUuid, normalizeUuid } from "@/lib/ids/uuid";
import type { AuthSessionView, Session } from "@/types/domain";

export const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14 days

type SessionRow = {
  SessionID: string;
  UserID: string;
  TokenHash: string;
  ActiveBusinessID: string | null;
  ExpiresAtUtc: Date;
  CreatedAtUtc: Date;
  RevokedAtUtc: Date | null;
};

type SessionUserRow = SessionRow & {
  Email: string;
  FullName: string;
  UserStatus: string;
};

function mapSession(row: SessionRow): Session {
  return {
    sessionId: normalizeUuid(row.SessionID),
    userId: normalizeUuid(row.UserID),
    tokenHash: row.TokenHash,
    activeBusinessId: normalizeNullableUuid(row.ActiveBusinessID),
    expiresAtUtc: row.ExpiresAtUtc,
    createdAtUtc: row.CreatedAtUtc,
    revokedAtUtc: row.RevokedAtUtc,
  };
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export async function createSession(params: {
  userId: string;
  activeBusinessId?: string | null;
}): Promise<{ session: Session; token: string }> {
  const sessionId = randomUUID();
  const token = generateSessionToken();
  const tokenHash = hashSessionToken(token);
  const now = new Date();
  const expiresAtUtc = new Date(now.getTime() + SESSION_TTL_MS);

  await query(
    `INSERT INTO TblSession (
      SessionID, UserID, TokenHash, ActiveBusinessID, ExpiresAtUtc, CreatedAtUtc, RevokedAtUtc
    ) VALUES (
      @sessionId, @userId, @tokenHash, @activeBusinessId, @expiresAtUtc, @createdAtUtc, NULL
    )`,
    [
      { name: "sessionId", type: sql.UniqueIdentifier, value: sessionId },
      { name: "userId", type: sql.UniqueIdentifier, value: params.userId },
      { name: "tokenHash", type: sql.NVarChar(128), value: tokenHash },
      {
        name: "activeBusinessId",
        type: sql.UniqueIdentifier,
        value: params.activeBusinessId ?? null,
      },
      { name: "expiresAtUtc", type: sql.DateTime2, value: expiresAtUtc },
      { name: "createdAtUtc", type: sql.DateTime2, value: now },
    ],
  );

  return {
    token,
    session: {
      sessionId,
      userId: params.userId,
      tokenHash,
      activeBusinessId: params.activeBusinessId ?? null,
      expiresAtUtc,
      createdAtUtc: now,
      revokedAtUtc: null,
    },
  };
}

export async function getSessionByToken(
  token: string,
): Promise<AuthSessionView | null> {
  const tokenHash = hashSessionToken(token);
  const result = await query<SessionUserRow>(
    `SELECT
      s.SessionID,
      s.UserID,
      s.TokenHash,
      s.ActiveBusinessID,
      s.ExpiresAtUtc,
      s.CreatedAtUtc,
      s.RevokedAtUtc,
      u.Email,
      u.FullName,
      u.Status AS UserStatus
    FROM TblSession s
    INNER JOIN TblUser u ON u.UserID = s.UserID
    WHERE s.TokenHash = @tokenHash`,
    [{ name: "tokenHash", type: sql.NVarChar(128), value: tokenHash }],
  );

  const row = result.recordset[0];
  if (!row) {
    return null;
  }

  if (row.RevokedAtUtc) {
    return null;
  }

  if (row.ExpiresAtUtc.getTime() <= Date.now()) {
    return null;
  }

  if (row.UserStatus !== "ACTIVE") {
    return null;
  }

  return {
    sessionId: normalizeUuid(row.SessionID),
    userId: normalizeUuid(row.UserID),
    email: row.Email,
    fullName: row.FullName,
    activeBusinessId: normalizeNullableUuid(row.ActiveBusinessID),
    expiresAtUtc: row.ExpiresAtUtc,
  };
}

export async function revokeSession(sessionId: string): Promise<void> {
  const now = new Date();
  await query(
    `UPDATE TblSession
     SET RevokedAtUtc = @revokedAtUtc
     WHERE SessionID = @sessionId AND RevokedAtUtc IS NULL`,
    [
      { name: "sessionId", type: sql.UniqueIdentifier, value: sessionId },
      { name: "revokedAtUtc", type: sql.DateTime2, value: now },
    ],
  );
}

export async function setSessionActiveBusiness(params: {
  sessionId: string;
  activeBusinessId: string | null;
}): Promise<void> {
  await query(
    `UPDATE TblSession
     SET ActiveBusinessID = @activeBusinessId
     WHERE SessionID = @sessionId AND RevokedAtUtc IS NULL`,
    [
      { name: "sessionId", type: sql.UniqueIdentifier, value: params.sessionId },
      {
        name: "activeBusinessId",
        type: sql.UniqueIdentifier,
        value: params.activeBusinessId,
      },
    ],
  );
}

export async function getSessionById(
  sessionId: string,
): Promise<Session | null> {
  const result = await query<SessionRow>(
    `SELECT SessionID, UserID, TokenHash, ActiveBusinessID, ExpiresAtUtc, CreatedAtUtc, RevokedAtUtc
     FROM TblSession
     WHERE SessionID = @sessionId`,
    [{ name: "sessionId", type: sql.UniqueIdentifier, value: sessionId }],
  );
  const row = result.recordset[0];
  return row ? mapSession(row) : null;
}
