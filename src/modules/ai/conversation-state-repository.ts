/**
 * Phase 3B Part 2B — per-conversation AI mode (AUTO / HUMAN_PAUSED / SAFETY_PAUSED).
 * Absence of a row means AUTO.
 */

import {
  query,
  sql,
  type TransactionClient,
} from "@/lib/db";
import { normalizeUuid } from "@/lib/ids/uuid";
import type {
  ConversationAiMode,
  ConversationAiState,
} from "@/types/domain";

import { logAiSafety } from "./guard-repository";


type StateRow = {
  BusinessID: string;
  ConversationID: string;
  Mode: string;
  PausedAtUtc: Date | null;
  PauseReason: string | null;
  ResumedAtUtc: Date | null;
  LastHumanOutboundProviderMessageID: string | null;
  LastHumanReplyAtUtc: Date | null;
  CreatedAtUtc: Date;
  UpdatedAtUtc: Date;
};

function mapState(row: StateRow): ConversationAiState {
  return {
    businessId: normalizeUuid(row.BusinessID),
    conversationId: normalizeUuid(row.ConversationID),
    mode: row.Mode as ConversationAiMode,
    pausedAtUtc: row.PausedAtUtc,
    pauseReason: row.PauseReason,
    resumedAtUtc: row.ResumedAtUtc,
    lastHumanOutboundProviderMessageId: row.LastHumanOutboundProviderMessageID,
    lastHumanReplyAtUtc: row.LastHumanReplyAtUtc,
    createdAtUtc: row.CreatedAtUtc,
    updatedAtUtc: row.UpdatedAtUtc,
  };
}

function db(trx?: TransactionClient) {
  return {
    query: trx ? trx.query.bind(trx) : query,
    execute: trx
      ? trx.execute.bind(trx)
      : async (text: string, inputs: Parameters<typeof query>[1] = []) => {
          const result = await query(text, inputs);
          return result.rowsAffected.reduce((s, n) => s + n, 0);
        },
  };
}

/** Effective mode when no durable row exists. */
export function defaultConversationAiState(params: {
  businessId: string;
  conversationId: string;
}): ConversationAiState {
  const now = new Date(0);
  return {
    businessId: params.businessId,
    conversationId: params.conversationId,
    mode: "AUTO",
    pausedAtUtc: null,
    pauseReason: null,
    resumedAtUtc: null,
    lastHumanOutboundProviderMessageId: null,
    lastHumanReplyAtUtc: null,
    createdAtUtc: now,
    updatedAtUtc: now,
  };
}

export async function getConversationAiState(params: {
  businessId: string;
  conversationId: string;
}, trx?: TransactionClient): Promise<ConversationAiState | null> {
  const result = await db(trx).query<StateRow>(
    `SELECT BusinessID, ConversationID, Mode, PausedAtUtc, PauseReason,
            ResumedAtUtc, LastHumanOutboundProviderMessageID, LastHumanReplyAtUtc,
            CreatedAtUtc, UpdatedAtUtc
     FROM TblConversationAiState
     WHERE BusinessID = @businessId AND ConversationID = @conversationId`,
    [
      { name: "businessId", type: sql.UniqueIdentifier, value: params.businessId },
      {
        name: "conversationId",
        type: sql.UniqueIdentifier,
        value: params.conversationId,
      },
    ],
  );
  const row = result.recordset[0];
  return row ? mapState(row) : null;
}

export async function getEffectiveConversationAiState(params: {
  businessId: string;
  conversationId: string;
}, trx?: TransactionClient): Promise<ConversationAiState> {
  const existing = await getConversationAiState(params, trx);
  return existing ?? defaultConversationAiState(params);
}

export async function pauseConversationAi(params: {
  businessId: string;
  conversationId: string;
  mode: Extract<ConversationAiMode, "HUMAN_PAUSED" | "SAFETY_PAUSED">;
  pauseReason: string;
  pausedAtUtc?: Date | null;
  lastHumanOutboundProviderMessageId?: string | null;
}, trx?: TransactionClient): Promise<ConversationAiState> {
  const pausedAt = params.pausedAtUtc ?? new Date();
  await db(trx).execute(
    `MERGE TblConversationAiState AS target
     USING (SELECT @businessId AS BusinessID, @conversationId AS ConversationID) AS src
       ON target.BusinessID = src.BusinessID
      AND target.ConversationID = src.ConversationID
     WHEN MATCHED
       AND (@mode = N'SAFETY_PAUSED' OR target.Mode <> N'SAFETY_PAUSED')
       AND (@pauseReason <> N'HUMAN_TAKEOVER'
            OR target.ResumedAtUtc IS NULL OR @pausedAtUtc > target.ResumedAtUtc)
     THEN UPDATE SET
         Mode = @mode,
         PausedAtUtc = CASE WHEN target.PausedAtUtc > @pausedAtUtc
           AND target.Mode = @mode THEN target.PausedAtUtc ELSE @pausedAtUtc END,
         PauseReason = @pauseReason,
         ResumedAtUtc = NULL,
         LastHumanReplyAtUtc = CASE
           WHEN @pauseReason = N'HUMAN_TAKEOVER' AND @lastHumanOutboundProviderMessageId IS NOT NULL
             THEN CASE WHEN target.LastHumanReplyAtUtc > @pausedAtUtc
               THEN target.LastHumanReplyAtUtc ELSE @pausedAtUtc END
           WHEN @pauseReason = N'HUMAN_TAKEOVER' THEN target.LastHumanReplyAtUtc
           ELSE NULL END,
         LastHumanOutboundProviderMessageID = COALESCE(
           @lastHumanOutboundProviderMessageId,
           target.LastHumanOutboundProviderMessageID
         ),
         UpdatedAtUtc = SYSUTCDATETIME()
     WHEN NOT MATCHED THEN
       INSERT (
         BusinessID, ConversationID, Mode, PausedAtUtc, PauseReason,
         ResumedAtUtc, LastHumanOutboundProviderMessageID, LastHumanReplyAtUtc,
         CreatedAtUtc, UpdatedAtUtc
       ) VALUES (
         @businessId, @conversationId, @mode, @pausedAtUtc, @pauseReason,
         NULL, @lastHumanOutboundProviderMessageId,
         CASE WHEN @pauseReason = N'HUMAN_TAKEOVER' AND @lastHumanOutboundProviderMessageId IS NOT NULL THEN @pausedAtUtc ELSE NULL END,
         SYSUTCDATETIME(), SYSUTCDATETIME()
       );`,
    [
      { name: "businessId", type: sql.UniqueIdentifier, value: params.businessId },
      {
        name: "conversationId",
        type: sql.UniqueIdentifier,
        value: params.conversationId,
      },
      { name: "mode", type: sql.NVarChar(32), value: params.mode },
      { name: "pausedAtUtc", type: sql.DateTime2, value: pausedAt },
      { name: "pauseReason", type: sql.NVarChar(64), value: params.pauseReason },
      {
        name: "lastHumanOutboundProviderMessageId",
        type: sql.NVarChar(256),
        value: params.lastHumanOutboundProviderMessageId ?? null,
      },
    ],
  );
  return getEffectiveConversationAiState(params, trx);
}

export async function resumeConversationAi(params: {
  businessId: string;
  conversationId: string;
  /**
   * Resume watermark. Inbound messages received before it are not answered.
   * Defaults to now (manual resume: only new messages get AI replies).
   */
  resumedAtUtc?: Date | null;
  logger?: { info: (...a: unknown[]) => void; warn: (...a: unknown[]) => void };
}, trx?: TransactionClient): Promise<ConversationAiState> {
  await db(trx).execute(
    `MERGE TblConversationAiState AS target
     USING (SELECT @businessId AS BusinessID, @conversationId AS ConversationID) AS src
       ON target.BusinessID = src.BusinessID
      AND target.ConversationID = src.ConversationID
     WHEN MATCHED THEN
       UPDATE SET
         Mode = N'AUTO',
         PausedAtUtc = NULL,
         PauseReason = NULL,
         LastHumanReplyAtUtc = NULL,
         ResumedAtUtc = ISNULL(@resumedAtUtc, SYSUTCDATETIME()),
         UpdatedAtUtc = SYSUTCDATETIME()
     WHEN NOT MATCHED THEN
       INSERT (
         BusinessID, ConversationID, Mode, PausedAtUtc, PauseReason,
         ResumedAtUtc, LastHumanOutboundProviderMessageID, LastHumanReplyAtUtc,
         CreatedAtUtc, UpdatedAtUtc
       ) VALUES (
         @businessId, @conversationId, N'AUTO', NULL, NULL,
         ISNULL(@resumedAtUtc, SYSUTCDATETIME()), NULL, NULL,
         SYSUTCDATETIME(), SYSUTCDATETIME()
       );`,
    [
      { name: "businessId", type: sql.UniqueIdentifier, value: params.businessId },
      {
        name: "conversationId",
        type: sql.UniqueIdentifier,
        value: params.conversationId,
      },
      {
        name: "resumedAtUtc",
        type: sql.DateTime2,
        value: params.resumedAtUtc ?? null,
      },
    ],
  );
  const state = await getEffectiveConversationAiState(params, trx);
  logAiSafety(
    "conversation_resumed",
    {
      businessId: params.businessId,
      conversationId: params.conversationId,
      reason: "RESUME",
    },
    params.logger,
  );
  return state;
}

/**
 * Scheduling gate: conversation must be AUTO and inbound must be at/after ResumedAtUtc.
 */
/** One open human case blocks AI even if a past manual action set mode=AUTO.
 * AI mode describes the bot, follow-up status describes unresolved responsibility.
 */
export async function hasActiveFollowUp(params: { businessId: string; conversationId: string }, trx?: TransactionClient): Promise<boolean> {
  const rows = await db(trx).query<{ EscalationID: string }>(
    `SELECT TOP 1 EscalationID FROM dbo.TblHumanEscalation
      WHERE BusinessID=@businessId AND ConversationID=@conversationId
        AND ResolvedAtUtc IS NULL AND Status IN (N'OPEN', N'ACKNOWLEDGED')`,
    [
      { name: "businessId", type: sql.UniqueIdentifier, value: params.businessId },
      { name: "conversationId", type: sql.UniqueIdentifier, value: params.conversationId },
    ],
  );
  return rows.recordset.length > 0;
}

export async function evaluateConversationAiScheduleGate(params: {
  businessId: string;
  conversationId: string;
  messageReceivedAt: Date;
}, trx?: TransactionClient): Promise<{
  allow: boolean;
  reason?: string;
  state: ConversationAiState;
}> {
  const state = await getEffectiveConversationAiState(
    {
      businessId: params.businessId,
      conversationId: params.conversationId,
    },
    trx,
  );

  // Never allow a new inbound message to expire human ownership.
  // Only the atomic quiet-and-answered worker sweep (or explicit handback)
  // may release the conversation to the AI.
  if (state.mode === "HUMAN_PAUSED") {
    return { allow: false, reason: "HUMAN_PAUSED", state };
  }
  if (state.mode === "SAFETY_PAUSED") {
    return { allow: false, reason: "SAFETY_PAUSED", state };
  }

  if (
    state.resumedAtUtc
    && params.messageReceivedAt.getTime() < state.resumedAtUtc.getTime()
  ) {
    return { allow: false, reason: "STALE_CONVERSATION_ACTIVATION", state };
  }

  if (await hasActiveFollowUp(params, trx)) {
    return { allow: false, reason: "ACTIVE_ESCALATION", state };
  }

  return { allow: true, state };
}

/**
 * Send-time gate: pause modes skip; jobs created before ResumedAtUtc are stale.
 */
export async function evaluateConversationAiSendGate(params: {
  businessId: string;
  conversationId: string;
  jobCreatedAtUtc: Date;
}, trx?: TransactionClient): Promise<{
  allow: boolean;
  reason?: string;
  state: ConversationAiState;
}> {
  const state = await getEffectiveConversationAiState(
    {
      businessId: params.businessId,
      conversationId: params.conversationId,
    },
    trx,
  );

  if (state.mode === "HUMAN_PAUSED") {
    return { allow: false, reason: "HUMAN_TAKEOVER_BEFORE_SEND", state };
  }
  if (state.mode === "SAFETY_PAUSED") {
    return { allow: false, reason: "CONVERSATION_SAFETY_PAUSED", state };
  }

  if (
    state.resumedAtUtc
    && params.jobCreatedAtUtc.getTime() < state.resumedAtUtc.getTime()
  ) {
    return { allow: false, reason: "STALE_CONVERSATION_ACTIVATION", state };
  }

  if (await hasActiveFollowUp(params, trx)) {
    return { allow: false, reason: "ACTIVE_ESCALATION", state };
  }

  return { allow: true, state };
}
