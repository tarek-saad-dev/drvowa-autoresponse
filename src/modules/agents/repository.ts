import { randomUUID } from "node:crypto";

import { query, sql } from "@/lib/db";
import type { Agent } from "@/types/domain";

type AgentRow = {
  AgentID: string;
  BusinessID: string;
  Name: string;
  RoleTitle: string;
  Language: string;
  Dialect: string | null;
  Tone: string | null;
  Instructions: string | null;
  IsActive: boolean;
  CreatedAtUtc: Date;
  UpdatedAtUtc: Date;
};

function mapAgent(row: AgentRow): Agent {
  return {
    agentId: row.AgentID,
    businessId: row.BusinessID,
    name: row.Name,
    roleTitle: row.RoleTitle,
    language: row.Language,
    dialect: row.Dialect,
    tone: row.Tone,
    instructions: row.Instructions,
    isActive: Boolean(row.IsActive),
    createdAtUtc: row.CreatedAtUtc,
    updatedAtUtc: row.UpdatedAtUtc,
  };
}

export async function listAgents(params: {
  businessId: string;
}): Promise<Agent[]> {
  const result = await query<AgentRow>(
    `SELECT AgentID, BusinessID, Name, RoleTitle, Language, Dialect, Tone,
            Instructions, IsActive, CreatedAtUtc, UpdatedAtUtc
     FROM TblAgent
     WHERE BusinessID = @businessId
     ORDER BY Name`,
    [
      {
        name: "businessId",
        type: sql.UniqueIdentifier,
        value: params.businessId,
      },
    ],
  );
  return result.recordset.map(mapAgent);
}

export async function getAgent(params: {
  businessId: string;
  agentId: string;
}): Promise<Agent | null> {
  const result = await query<AgentRow>(
    `SELECT AgentID, BusinessID, Name, RoleTitle, Language, Dialect, Tone,
            Instructions, IsActive, CreatedAtUtc, UpdatedAtUtc
     FROM TblAgent
     WHERE BusinessID = @businessId AND AgentID = @agentId`,
    [
      {
        name: "businessId",
        type: sql.UniqueIdentifier,
        value: params.businessId,
      },
      { name: "agentId", type: sql.UniqueIdentifier, value: params.agentId },
    ],
  );
  const row = result.recordset[0];
  return row ? mapAgent(row) : null;
}

export async function createAgent(params: {
  businessId: string;
  name: string;
  roleTitle: string;
  language: string;
  dialect?: string | null;
  tone?: string | null;
  instructions?: string | null;
  isActive?: boolean;
}): Promise<Agent> {
  const agentId = randomUUID();
  const now = new Date();
  const isActive = params.isActive ?? true;

  await query(
    `INSERT INTO TblAgent (
      AgentID, BusinessID, Name, RoleTitle, Language, Dialect, Tone,
      Instructions, IsActive, CreatedAtUtc, UpdatedAtUtc
    ) VALUES (
      @agentId, @businessId, @name, @roleTitle, @language, @dialect, @tone,
      @instructions, @isActive, @createdAtUtc, @updatedAtUtc
    )`,
    [
      { name: "agentId", type: sql.UniqueIdentifier, value: agentId },
      {
        name: "businessId",
        type: sql.UniqueIdentifier,
        value: params.businessId,
      },
      { name: "name", type: sql.NVarChar(200), value: params.name },
      { name: "roleTitle", type: sql.NVarChar(200), value: params.roleTitle },
      { name: "language", type: sql.NVarChar(32), value: params.language },
      {
        name: "dialect",
        type: sql.NVarChar(64),
        value: params.dialect ?? null,
      },
      { name: "tone", type: sql.NVarChar(64), value: params.tone ?? null },
      {
        name: "instructions",
        type: sql.NVarChar(sql.MAX),
        value: params.instructions ?? null,
      },
      { name: "isActive", type: sql.Bit, value: isActive },
      { name: "createdAtUtc", type: sql.DateTime2, value: now },
      { name: "updatedAtUtc", type: sql.DateTime2, value: now },
    ],
  );

  return {
    agentId,
    businessId: params.businessId,
    name: params.name,
    roleTitle: params.roleTitle,
    language: params.language,
    dialect: params.dialect ?? null,
    tone: params.tone ?? null,
    instructions: params.instructions ?? null,
    isActive,
    createdAtUtc: now,
    updatedAtUtc: now,
  };
}

export async function updateAgent(params: {
  businessId: string;
  agentId: string;
  name?: string;
  roleTitle?: string;
  language?: string;
  dialect?: string | null;
  tone?: string | null;
  instructions?: string | null;
  isActive?: boolean;
}): Promise<Agent | null> {
  const existing = await getAgent({
    businessId: params.businessId,
    agentId: params.agentId,
  });
  if (!existing) {
    return null;
  }

  const next = {
    name: params.name ?? existing.name,
    roleTitle: params.roleTitle ?? existing.roleTitle,
    language: params.language ?? existing.language,
    dialect: params.dialect === undefined ? existing.dialect : params.dialect,
    tone: params.tone === undefined ? existing.tone : params.tone,
    instructions:
      params.instructions === undefined
        ? existing.instructions
        : params.instructions,
    isActive: params.isActive ?? existing.isActive,
  };
  const now = new Date();

  await query(
    `UPDATE TblAgent
     SET Name = @name,
         RoleTitle = @roleTitle,
         Language = @language,
         Dialect = @dialect,
         Tone = @tone,
         Instructions = @instructions,
         IsActive = @isActive,
         UpdatedAtUtc = @updatedAtUtc
     WHERE BusinessID = @businessId AND AgentID = @agentId`,
    [
      {
        name: "businessId",
        type: sql.UniqueIdentifier,
        value: params.businessId,
      },
      { name: "agentId", type: sql.UniqueIdentifier, value: params.agentId },
      { name: "name", type: sql.NVarChar(200), value: next.name },
      { name: "roleTitle", type: sql.NVarChar(200), value: next.roleTitle },
      { name: "language", type: sql.NVarChar(32), value: next.language },
      { name: "dialect", type: sql.NVarChar(64), value: next.dialect },
      { name: "tone", type: sql.NVarChar(64), value: next.tone },
      {
        name: "instructions",
        type: sql.NVarChar(sql.MAX),
        value: next.instructions,
      },
      { name: "isActive", type: sql.Bit, value: next.isActive },
      { name: "updatedAtUtc", type: sql.DateTime2, value: now },
    ],
  );

  return { ...existing, ...next, updatedAtUtc: now };
}

export async function deleteAgent(params: {
  businessId: string;
  agentId: string;
}): Promise<boolean> {
  const result = await query(
    `DELETE FROM TblAgent
     WHERE BusinessID = @businessId AND AgentID = @agentId`,
    [
      {
        name: "businessId",
        type: sql.UniqueIdentifier,
        value: params.businessId,
      },
      { name: "agentId", type: sql.UniqueIdentifier, value: params.agentId },
    ],
  );
  return (result.rowsAffected[0] ?? 0) > 0;
}
