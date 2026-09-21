import { randomUUID } from "node:crypto";

import { query, sql, type TransactionClient } from "@/lib/db";
import { normalizeUuid } from "@/lib/ids/uuid";
import type { PlatformAdmin, PlatformAdminRole } from "@/types/domain";

type PlatformAdminRow = {
  PlatformAdminID: string;
  UserID: string;
  Role: string;
  IsActive: boolean;
  CreatedAtUtc: Date;
  UpdatedAtUtc: Date;
};

function db(trx?: TransactionClient) {
  return { query: trx?.query.bind(trx) ?? query };
}

function mapAdmin(row: PlatformAdminRow): PlatformAdmin {
  return {
    platformAdminId: normalizeUuid(row.PlatformAdminID),
    userId: normalizeUuid(row.UserID),
    role: row.Role as PlatformAdminRole,
    isActive: Boolean(row.IsActive),
    createdAtUtc: row.CreatedAtUtc,
    updatedAtUtc: row.UpdatedAtUtc,
  };
}

export async function findActivePlatformAdminByUserId(
  userId: string,
  trx?: TransactionClient,
): Promise<PlatformAdmin | null> {
  const result = await db(trx).query<PlatformAdminRow>(
    `SELECT PlatformAdminID, UserID, Role, IsActive, CreatedAtUtc, UpdatedAtUtc
     FROM TblPlatformAdmin
     WHERE UserID = @userId AND IsActive = 1`,
    [{ name: "userId", type: sql.UniqueIdentifier, value: userId }],
  );
  const row = result.recordset[0];
  return row ? mapAdmin(row) : null;
}

export async function upsertPlatformAdmin(params: {
  userId: string;
  role: PlatformAdminRole;
  isActive?: boolean;
}): Promise<PlatformAdmin> {
  const existing = await query<PlatformAdminRow>(
    `SELECT PlatformAdminID, UserID, Role, IsActive, CreatedAtUtc, UpdatedAtUtc
     FROM TblPlatformAdmin WHERE UserID = @userId`,
    [{ name: "userId", type: sql.UniqueIdentifier, value: params.userId }],
  );
  const now = new Date();
  const isActive = params.isActive ?? true;

  if (existing.recordset[0]) {
    await query(
      `UPDATE TblPlatformAdmin
       SET Role = @role, IsActive = @isActive, UpdatedAtUtc = @updatedAtUtc
       WHERE UserID = @userId`,
      [
        { name: "userId", type: sql.UniqueIdentifier, value: params.userId },
        { name: "role", type: sql.NVarChar(32), value: params.role },
        { name: "isActive", type: sql.Bit, value: isActive },
        { name: "updatedAtUtc", type: sql.DateTime2, value: now },
      ],
    );
    const refreshed = await findActivePlatformAdminByUserId(params.userId);
    if (refreshed) return refreshed;
    // Inactive after update — return mapped inactive row
    const row = (
      await query<PlatformAdminRow>(
        `SELECT PlatformAdminID, UserID, Role, IsActive, CreatedAtUtc, UpdatedAtUtc
         FROM TblPlatformAdmin WHERE UserID = @userId`,
        [{ name: "userId", type: sql.UniqueIdentifier, value: params.userId }],
      )
    ).recordset[0]!;
    return mapAdmin(row);
  }

  const platformAdminId = randomUUID();
  await query(
    `INSERT INTO TblPlatformAdmin (
      PlatformAdminID, UserID, Role, IsActive, CreatedAtUtc, UpdatedAtUtc
    ) VALUES (
      @platformAdminId, @userId, @role, @isActive, @createdAtUtc, @updatedAtUtc
    )`,
    [
      {
        name: "platformAdminId",
        type: sql.UniqueIdentifier,
        value: platformAdminId,
      },
      { name: "userId", type: sql.UniqueIdentifier, value: params.userId },
      { name: "role", type: sql.NVarChar(32), value: params.role },
      { name: "isActive", type: sql.Bit, value: isActive },
      { name: "createdAtUtc", type: sql.DateTime2, value: now },
      { name: "updatedAtUtc", type: sql.DateTime2, value: now },
    ],
  );

  return {
    platformAdminId,
    userId: params.userId,
    role: params.role,
    isActive,
    createdAtUtc: now,
    updatedAtUtc: now,
  };
}
