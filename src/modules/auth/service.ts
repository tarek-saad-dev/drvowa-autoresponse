import { randomUUID } from "node:crypto";

import { query, sql } from "@/lib/db";
import { AuthError } from "@/lib/tenancy/errors";
import type { AuthSessionView, User } from "@/types/domain";

import { hashPassword, verifyPassword } from "./password";
import {
  clearSessionCookie,
  readSessionCookie,
  setSessionCookie,
} from "./session-cookie";
import {
  createSession,
  getSessionByToken,
  revokeSession,
} from "./session";

type UserAuthRow = {
  UserID: string;
  Email: string;
  PasswordHash: string;
  FullName: string;
  Status: string;
  CreatedAtUtc: Date;
  UpdatedAtUtc: Date;
};

function mapUser(row: UserAuthRow): User {
  return {
    userId: row.UserID,
    email: row.Email,
    fullName: row.FullName,
    status: row.Status as User["status"],
    createdAtUtc: row.CreatedAtUtc,
    updatedAtUtc: row.UpdatedAtUtc,
  };
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function signup(params: {
  email: string;
  password: string;
  fullName: string;
}): Promise<{ user: User; session: AuthSessionView }> {
  const email = normalizeEmail(params.email);
  const fullName = params.fullName.trim();
  if (!email || !params.password || !fullName) {
    throw new AuthError("Email, password, and full name are required");
  }

  const existing = await query<{ UserID: string }>(
    `SELECT UserID FROM TblUser WHERE Email = @email`,
    [{ name: "email", type: sql.NVarChar(320), value: email }],
  );
  if (existing.recordset[0]) {
    throw new AuthError("An account with this email already exists");
  }

  const userId = randomUUID();
  const now = new Date();
  const passwordHash = await hashPassword(params.password);

  await query(
    `INSERT INTO TblUser (
      UserID, Email, PasswordHash, FullName, Status, CreatedAtUtc, UpdatedAtUtc
    ) VALUES (
      @userId, @email, @passwordHash, @fullName, N'ACTIVE', @createdAtUtc, @updatedAtUtc
    )`,
    [
      { name: "userId", type: sql.UniqueIdentifier, value: userId },
      { name: "email", type: sql.NVarChar(320), value: email },
      { name: "passwordHash", type: sql.NVarChar(255), value: passwordHash },
      { name: "fullName", type: sql.NVarChar(200), value: fullName },
      { name: "createdAtUtc", type: sql.DateTime2, value: now },
      { name: "updatedAtUtc", type: sql.DateTime2, value: now },
    ],
  );

  const { token, session } = await createSession({ userId });
  await setSessionCookie(token);

  return {
    user: {
      userId,
      email,
      fullName,
      status: "ACTIVE",
      createdAtUtc: now,
      updatedAtUtc: now,
    },
    session: {
      sessionId: session.sessionId,
      userId,
      email,
      fullName,
      activeBusinessId: session.activeBusinessId,
      expiresAtUtc: session.expiresAtUtc,
    },
  };
}

export async function login(params: {
  email: string;
  password: string;
}): Promise<{ user: User; session: AuthSessionView }> {
  const email = normalizeEmail(params.email);
  const result = await query<UserAuthRow>(
    `SELECT UserID, Email, PasswordHash, FullName, Status, CreatedAtUtc, UpdatedAtUtc
     FROM TblUser
     WHERE Email = @email`,
    [{ name: "email", type: sql.NVarChar(320), value: email }],
  );

  const row = result.recordset[0];
  if (!row || row.Status !== "ACTIVE") {
    throw new AuthError("Invalid email or password");
  }

  const ok = await verifyPassword(params.password, row.PasswordHash);
  if (!ok) {
    throw new AuthError("Invalid email or password");
  }

  const user = mapUser(row);
  const { token, session } = await createSession({ userId: user.userId });
  await setSessionCookie(token);

  return {
    user,
    session: {
      sessionId: session.sessionId,
      userId: user.userId,
      email: user.email,
      fullName: user.fullName,
      activeBusinessId: session.activeBusinessId,
      expiresAtUtc: session.expiresAtUtc,
    },
  };
}

export async function logout(): Promise<void> {
  const token = await readSessionCookie();
  if (token) {
    const current = await getSessionByToken(token);
    if (current) {
      await revokeSession(current.sessionId);
    }
  }
  await clearSessionCookie();
}

export async function getCurrentSession(): Promise<AuthSessionView | null> {
  const token = await readSessionCookie();
  if (!token) {
    return null;
  }
  return getSessionByToken(token);
}
