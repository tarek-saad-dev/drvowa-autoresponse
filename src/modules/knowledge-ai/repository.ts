import { randomUUID } from "node:crypto";

import type { KnowledgeCategory } from "@/constants/knowledge";
import { query, sql, type TransactionClient } from "@/lib/db";
import { normalizeUuid } from "@/lib/ids/uuid";

import type {
  IngestAction,
  IngestProposalStatus,
  IngestResolution,
  IngestSessionStatus,
} from "./constants";
import type {
  ConversationTurn,
  IngestSummary,
  KnowledgeIngestProposal,
  KnowledgeIngestSession,
} from "./types";

type SessionRow = {
  KnowledgeIngestSessionID: string;
  BusinessID: string;
  CreatedByUserID: string;
  Status: string;
  RawInput: string | null;
  ConversationJson: string | null;
  InputHash: string | null;
  InputLength: number;
  Model: string | null;
  SummaryJson: string | null;
  ErrorCode: string | null;
  CreatedAtUtc: Date;
  UpdatedAtUtc: Date;
  AppliedAtUtc: Date | null;
};

type ProposalRow = {
  KnowledgeIngestProposalID: string;
  SessionID: string;
  Sequence: number;
  Action: string;
  Category: string;
  ProposedTitle: string;
  ProposedContent: string;
  ExistingKnowledgeItemID: string | null;
  ExistingTitle: string | null;
  ExistingContent: string | null;
  ExistingUpdatedAtUtc: Date | null;
  Confidence: number | null;
  Resolution: string | null;
  Selected: boolean;
  Status: string;
  SubjectKey: string | null;
  CreatedAtUtc: Date;
  UpdatedAtUtc: Date;
};

function db(trx?: TransactionClient) {
  return { query: trx?.query.bind(trx) ?? query };
}

function parseConversation(raw: string | null): ConversationTurn[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as ConversationTurn[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseSummary(raw: string | null): IngestSummary | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as IngestSummary;
  } catch {
    return null;
  }
}

function mapSession(row: SessionRow): KnowledgeIngestSession {
  return {
    sessionId: normalizeUuid(row.KnowledgeIngestSessionID),
    businessId: normalizeUuid(row.BusinessID),
    createdByUserId: normalizeUuid(row.CreatedByUserID),
    status: row.Status as IngestSessionStatus,
    rawInput: row.RawInput,
    conversation: parseConversation(row.ConversationJson),
    inputHash: row.InputHash,
    inputLength: Number(row.InputLength ?? 0),
    model: row.Model,
    summary: parseSummary(row.SummaryJson),
    errorCode: row.ErrorCode,
    createdAtUtc: row.CreatedAtUtc,
    updatedAtUtc: row.UpdatedAtUtc,
    appliedAtUtc: row.AppliedAtUtc,
  };
}

function mapProposal(row: ProposalRow): KnowledgeIngestProposal {
  return {
    proposalId: normalizeUuid(row.KnowledgeIngestProposalID),
    sessionId: normalizeUuid(row.SessionID),
    sequence: Number(row.Sequence),
    action: row.Action as IngestAction,
    category: row.Category as KnowledgeCategory,
    proposedTitle: row.ProposedTitle,
    proposedContent: row.ProposedContent,
    existingKnowledgeItemId: row.ExistingKnowledgeItemID
      ? normalizeUuid(row.ExistingKnowledgeItemID)
      : null,
    existingTitle: row.ExistingTitle,
    existingContent: row.ExistingContent,
    existingUpdatedAtUtc: row.ExistingUpdatedAtUtc,
    confidence:
      row.Confidence == null ? null : Number(row.Confidence),
    resolution: (row.Resolution as IngestResolution | null) ?? null,
    selected: Boolean(row.Selected),
    status: row.Status as IngestProposalStatus,
    subjectKey: row.SubjectKey,
    createdAtUtc: row.CreatedAtUtc,
    updatedAtUtc: row.UpdatedAtUtc,
  };
}

export async function createSession(params: {
  businessId: string;
  createdByUserId: string;
  rawInput: string | null;
  conversation: ConversationTurn[];
  inputHash: string | null;
  inputLength: number;
  model?: string | null;
  status?: IngestSessionStatus;
}, trx?: TransactionClient): Promise<KnowledgeIngestSession> {
  const now = new Date();
  const sessionId = randomUUID();
  await db(trx).query(
    `INSERT INTO TblKnowledgeIngestSession (
      KnowledgeIngestSessionID, BusinessID, CreatedByUserID, Status,
      RawInput, ConversationJson, InputHash, InputLength, Model,
      SummaryJson, ErrorCode, CreatedAtUtc, UpdatedAtUtc, AppliedAtUtc
    ) VALUES (
      @sessionId, @businessId, @userId, @status,
      @rawInput, @conversationJson, @inputHash, @inputLength, @model,
      NULL, NULL, @createdAtUtc, @updatedAtUtc, NULL
    )`,
    [
      { name: "sessionId", type: sql.UniqueIdentifier, value: sessionId },
      { name: "businessId", type: sql.UniqueIdentifier, value: params.businessId },
      { name: "userId", type: sql.UniqueIdentifier, value: params.createdByUserId },
      { name: "status", type: sql.NVarChar(32), value: params.status ?? "ANALYZING" },
      { name: "rawInput", type: sql.NVarChar(sql.MAX), value: params.rawInput },
      {
        name: "conversationJson",
        type: sql.NVarChar(sql.MAX),
        value: JSON.stringify(params.conversation),
      },
      { name: "inputHash", type: sql.NVarChar(64), value: params.inputHash },
      { name: "inputLength", type: sql.Int, value: params.inputLength },
      { name: "model", type: sql.NVarChar(128), value: params.model ?? null },
      { name: "createdAtUtc", type: sql.DateTime2, value: now },
      { name: "updatedAtUtc", type: sql.DateTime2, value: now },
    ],
  );
  const created = await getSession({
    businessId: params.businessId,
    sessionId,
  }, trx);
  if (!created) throw new Error("Failed to create ingest session");
  return created;
}

export async function getSession(params: {
  businessId: string;
  sessionId: string;
}, trx?: TransactionClient): Promise<KnowledgeIngestSession | null> {
  const result = await db(trx).query<SessionRow>(
    `SELECT KnowledgeIngestSessionID, BusinessID, CreatedByUserID, Status,
            RawInput, ConversationJson, InputHash, InputLength, Model,
            SummaryJson, ErrorCode, CreatedAtUtc, UpdatedAtUtc, AppliedAtUtc
     FROM TblKnowledgeIngestSession
     WHERE KnowledgeIngestSessionID = @sessionId AND BusinessID = @businessId`,
    [
      { name: "sessionId", type: sql.UniqueIdentifier, value: params.sessionId },
      { name: "businessId", type: sql.UniqueIdentifier, value: params.businessId },
    ],
  );
  const row = result.recordset[0];
  return row ? mapSession(row) : null;
}

export async function lockSession(params: {
  businessId: string;
  sessionId: string;
}, trx: TransactionClient): Promise<KnowledgeIngestSession | null> {
  const result = await trx.query<SessionRow>(
    `SELECT KnowledgeIngestSessionID, BusinessID, CreatedByUserID, Status,
            RawInput, ConversationJson, InputHash, InputLength, Model,
            SummaryJson, ErrorCode, CreatedAtUtc, UpdatedAtUtc, AppliedAtUtc
     FROM TblKnowledgeIngestSession WITH (UPDLOCK, ROWLOCK)
     WHERE KnowledgeIngestSessionID = @sessionId AND BusinessID = @businessId`,
    [
      { name: "sessionId", type: sql.UniqueIdentifier, value: params.sessionId },
      { name: "businessId", type: sql.UniqueIdentifier, value: params.businessId },
    ],
  );
  const row = result.recordset[0];
  return row ? mapSession(row) : null;
}

export async function updateSession(params: {
  businessId: string;
  sessionId: string;
  status?: IngestSessionStatus;
  rawInput?: string | null;
  conversation?: ConversationTurn[];
  inputHash?: string | null;
  inputLength?: number;
  model?: string | null;
  summary?: IngestSummary | null;
  errorCode?: string | null;
  clearRawInput?: boolean;
  appliedAtUtc?: Date | null;
}, trx?: TransactionClient): Promise<void> {
  const now = new Date();
  await db(trx).query(
    `UPDATE TblKnowledgeIngestSession
     SET Status = COALESCE(@status, Status),
         RawInput = CASE WHEN @clearRawInput = 1 THEN NULL ELSE COALESCE(@rawInput, RawInput) END,
         ConversationJson = COALESCE(@conversationJson, ConversationJson),
         InputHash = COALESCE(@inputHash, InputHash),
         InputLength = COALESCE(@inputLength, InputLength),
         Model = COALESCE(@model, Model),
         SummaryJson = COALESCE(@summaryJson, SummaryJson),
         ErrorCode = CASE WHEN @setError = 1 THEN @errorCode ELSE ErrorCode END,
         AppliedAtUtc = COALESCE(@appliedAtUtc, AppliedAtUtc),
         UpdatedAtUtc = @updatedAtUtc
     WHERE KnowledgeIngestSessionID = @sessionId AND BusinessID = @businessId`,
    [
      { name: "sessionId", type: sql.UniqueIdentifier, value: params.sessionId },
      { name: "businessId", type: sql.UniqueIdentifier, value: params.businessId },
      { name: "status", type: sql.NVarChar(32), value: params.status ?? null },
      {
        name: "clearRawInput",
        type: sql.Bit,
        value: params.clearRawInput ? 1 : 0,
      },
      {
        name: "rawInput",
        type: sql.NVarChar(sql.MAX),
        value: params.rawInput === undefined ? null : params.rawInput,
      },
      {
        name: "conversationJson",
        type: sql.NVarChar(sql.MAX),
        value: params.conversation
          ? JSON.stringify(params.conversation)
          : null,
      },
      {
        name: "inputHash",
        type: sql.NVarChar(64),
        value: params.inputHash ?? null,
      },
      {
        name: "inputLength",
        type: sql.Int,
        value: params.inputLength ?? null,
      },
      { name: "model", type: sql.NVarChar(128), value: params.model ?? null },
      {
        name: "summaryJson",
        type: sql.NVarChar(sql.MAX),
        value: params.summary ? JSON.stringify(params.summary) : null,
      },
      {
        name: "setError",
        type: sql.Bit,
        value: params.errorCode !== undefined ? 1 : 0,
      },
      {
        name: "errorCode",
        type: sql.NVarChar(64),
        value: params.errorCode ?? null,
      },
      {
        name: "appliedAtUtc",
        type: sql.DateTime2,
        value: params.appliedAtUtc ?? null,
      },
      { name: "updatedAtUtc", type: sql.DateTime2, value: now },
    ],
  );
}

export async function deleteProposalsForSession(params: {
  sessionId: string;
}, trx?: TransactionClient): Promise<void> {
  await db(trx).query(
    `DELETE FROM TblKnowledgeIngestProposal WHERE SessionID = @sessionId`,
    [{ name: "sessionId", type: sql.UniqueIdentifier, value: params.sessionId }],
  );
}

export async function insertProposals(
  proposals: Array<{
    sessionId: string;
    sequence: number;
    action: IngestAction;
    category: KnowledgeCategory;
    proposedTitle: string;
    proposedContent: string;
    existingKnowledgeItemId: string | null;
    existingTitle: string | null;
    existingContent: string | null;
    existingUpdatedAtUtc: Date | null;
    confidence: number | null;
    selected: boolean;
    status: IngestProposalStatus;
    subjectKey: string | null;
  }>,
  trx?: TransactionClient,
): Promise<void> {
  const now = new Date();
  for (const p of proposals) {
    await db(trx).query(
      `INSERT INTO TblKnowledgeIngestProposal (
        KnowledgeIngestProposalID, SessionID, Sequence, Action, Category,
        ProposedTitle, ProposedContent, ExistingKnowledgeItemID,
        ExistingTitle, ExistingContent, ExistingUpdatedAtUtc,
        Confidence, Resolution, Selected, Status, SubjectKey,
        CreatedAtUtc, UpdatedAtUtc
      ) VALUES (
        @proposalId, @sessionId, @sequence, @action, @category,
        @proposedTitle, @proposedContent, @existingId,
        @existingTitle, @existingContent, @existingUpdatedAtUtc,
        @confidence, NULL, @selected, @status, @subjectKey,
        @createdAtUtc, @updatedAtUtc
      )`,
      [
        { name: "proposalId", type: sql.UniqueIdentifier, value: randomUUID() },
        { name: "sessionId", type: sql.UniqueIdentifier, value: p.sessionId },
        { name: "sequence", type: sql.Int, value: p.sequence },
        { name: "action", type: sql.NVarChar(16), value: p.action },
        { name: "category", type: sql.NVarChar(32), value: p.category },
        { name: "proposedTitle", type: sql.NVarChar(300), value: p.proposedTitle },
        {
          name: "proposedContent",
          type: sql.NVarChar(sql.MAX),
          value: p.proposedContent,
        },
        {
          name: "existingId",
          type: sql.UniqueIdentifier,
          value: p.existingKnowledgeItemId,
        },
        {
          name: "existingTitle",
          type: sql.NVarChar(300),
          value: p.existingTitle,
        },
        {
          name: "existingContent",
          type: sql.NVarChar(sql.MAX),
          value: p.existingContent,
        },
        {
          name: "existingUpdatedAtUtc",
          type: sql.DateTime2,
          value: p.existingUpdatedAtUtc,
        },
        { name: "confidence", type: sql.Float, value: p.confidence },
        { name: "selected", type: sql.Bit, value: p.selected ? 1 : 0 },
        { name: "status", type: sql.NVarChar(32), value: p.status },
        { name: "subjectKey", type: sql.NVarChar(200), value: p.subjectKey },
        { name: "createdAtUtc", type: sql.DateTime2, value: now },
        { name: "updatedAtUtc", type: sql.DateTime2, value: now },
      ],
    );
  }
}

export async function listProposals(params: {
  sessionId: string;
  businessId: string;
}, trx?: TransactionClient): Promise<KnowledgeIngestProposal[]> {
  // Join session to enforce tenant scope
  const result = await db(trx).query<ProposalRow>(
    `SELECT p.KnowledgeIngestProposalID, p.SessionID, p.Sequence, p.Action, p.Category,
            p.ProposedTitle, p.ProposedContent, p.ExistingKnowledgeItemID,
            p.ExistingTitle, p.ExistingContent, p.ExistingUpdatedAtUtc,
            p.Confidence, p.Resolution, p.Selected, p.Status, p.SubjectKey,
            p.CreatedAtUtc, p.UpdatedAtUtc
     FROM TblKnowledgeIngestProposal p
     INNER JOIN TblKnowledgeIngestSession s
       ON s.KnowledgeIngestSessionID = p.SessionID
     WHERE p.SessionID = @sessionId AND s.BusinessID = @businessId
     ORDER BY p.Sequence ASC`,
    [
      { name: "sessionId", type: sql.UniqueIdentifier, value: params.sessionId },
      { name: "businessId", type: sql.UniqueIdentifier, value: params.businessId },
    ],
  );
  return result.recordset.map(mapProposal);
}

export async function getProposal(params: {
  businessId: string;
  proposalId: string;
}, trx?: TransactionClient): Promise<KnowledgeIngestProposal | null> {
  const result = await db(trx).query<ProposalRow>(
    `SELECT p.KnowledgeIngestProposalID, p.SessionID, p.Sequence, p.Action, p.Category,
            p.ProposedTitle, p.ProposedContent, p.ExistingKnowledgeItemID,
            p.ExistingTitle, p.ExistingContent, p.ExistingUpdatedAtUtc,
            p.Confidence, p.Resolution, p.Selected, p.Status, p.SubjectKey,
            p.CreatedAtUtc, p.UpdatedAtUtc
     FROM TblKnowledgeIngestProposal p
     INNER JOIN TblKnowledgeIngestSession s
       ON s.KnowledgeIngestSessionID = p.SessionID
     WHERE p.KnowledgeIngestProposalID = @proposalId
       AND s.BusinessID = @businessId`,
    [
      {
        name: "proposalId",
        type: sql.UniqueIdentifier,
        value: params.proposalId,
      },
      { name: "businessId", type: sql.UniqueIdentifier, value: params.businessId },
    ],
  );
  const row = result.recordset[0];
  return row ? mapProposal(row) : null;
}

export async function updateProposal(params: {
  businessId: string;
  proposalId: string;
  selected?: boolean;
  resolution?: IngestResolution | null;
  proposedTitle?: string;
  proposedContent?: string;
  status?: IngestProposalStatus;
}, trx?: TransactionClient): Promise<KnowledgeIngestProposal | null> {
  const now = new Date();
  await db(trx).query(
    `UPDATE p
     SET Selected = COALESCE(@selected, p.Selected),
         Resolution = CASE WHEN @setResolution = 1 THEN @resolution ELSE p.Resolution END,
         ProposedTitle = COALESCE(@proposedTitle, p.ProposedTitle),
         ProposedContent = COALESCE(@proposedContent, p.ProposedContent),
         Status = COALESCE(@status, p.Status),
         UpdatedAtUtc = @updatedAtUtc
     FROM TblKnowledgeIngestProposal p
     INNER JOIN TblKnowledgeIngestSession s
       ON s.KnowledgeIngestSessionID = p.SessionID
     WHERE p.KnowledgeIngestProposalID = @proposalId
       AND s.BusinessID = @businessId`,
    [
      {
        name: "proposalId",
        type: sql.UniqueIdentifier,
        value: params.proposalId,
      },
      { name: "businessId", type: sql.UniqueIdentifier, value: params.businessId },
      {
        name: "selected",
        type: sql.Bit,
        value: params.selected === undefined ? null : params.selected ? 1 : 0,
      },
      {
        name: "setResolution",
        type: sql.Bit,
        value: params.resolution !== undefined ? 1 : 0,
      },
      {
        name: "resolution",
        type: sql.NVarChar(32),
        value: params.resolution ?? null,
      },
      {
        name: "proposedTitle",
        type: sql.NVarChar(300),
        value: params.proposedTitle ?? null,
      },
      {
        name: "proposedContent",
        type: sql.NVarChar(sql.MAX),
        value: params.proposedContent ?? null,
      },
      { name: "status", type: sql.NVarChar(32), value: params.status ?? null },
      { name: "updatedAtUtc", type: sql.DateTime2, value: now },
    ],
  );
  return getProposal(params, trx);
}
