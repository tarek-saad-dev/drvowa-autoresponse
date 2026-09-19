import {
  query,
  sql,
  type TransactionClient,
} from "@/lib/db";
import { normalizeUuid } from "@/lib/ids/uuid";
import type { AiConversationGuard } from "@/types/domain";

import {
  LOOP_GUARD_MAX_SENT,
  LOOP_GUARD_PAUSE_REASON,
  LOOP_GUARD_PAUSE_SECONDS,
  LOOP_GUARD_WINDOW_SECONDS,
} from "./safety-policy";

type GuardRow = {
  BusinessID: string;
  ConversationID: string;
  PausedUntilUtc: Date | null;
  PauseReason: string | null;
  TriggeredAtUtc: Date | null;
  CreatedAtUtc: Date;
  UpdatedAtUtc: Date;
};

function mapGuard(row: GuardRow): AiConversationGuard {
  return {
    businessId: normalizeUuid(row.BusinessID),
    conversationId: normalizeUuid(row.ConversationID),
    pausedUntilUtc: row.PausedUntilUtc,
    pauseReason: row.PauseReason,
    triggeredAtUtc: row.TriggeredAtUtc,
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

export function logAiSafety(
  event: string,
  fields: Record<string, unknown>,
  logger: { info: (...a: unknown[]) => void; warn: (...a: unknown[]) => void } = console,
): void {
  logger.warn(`[ai-safety] ${event}`, fields);
}

export async function getConversationGuard(params: {
  businessId: string;
  conversationId: string;
}, trx?: TransactionClient): Promise<AiConversationGuard | null> {
  const result = await db(trx).query<GuardRow>(
    `SELECT BusinessID, ConversationID, PausedUntilUtc, PauseReason,
            TriggeredAtUtc, CreatedAtUtc, UpdatedAtUtc
     FROM TblAiConversationGuard
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
  return row ? mapGuard(row) : null;
}

export async function isConversationPaused(params: {
  businessId: string;
  conversationId: string;
}, trx?: TransactionClient): Promise<{
  paused: boolean;
  guard: AiConversationGuard | null;
}> {
  const guard = await getConversationGuard(params, trx);
  if (!guard?.pausedUntilUtc) {
    return { paused: false, guard };
  }
  const paused = guard.pausedUntilUtc.getTime() > Date.now();
  return { paused, guard };
}

export async function countRecentSentAiJobs(params: {
  businessId: string;
  conversationId: string;
  windowSeconds?: number;
}, trx?: TransactionClient): Promise<number> {
  const windowSeconds = params.windowSeconds ?? LOOP_GUARD_WINDOW_SECONDS;
  const result = await db(trx).query<{ Cnt: number }>(
    `SELECT COUNT(1) AS Cnt
     FROM TblAiReplyJob
     WHERE BusinessID = @businessId
       AND ConversationID = @conversationId
       AND Status = N'SENT'
       AND CompletedAtUtc IS NOT NULL
       AND CompletedAtUtc >= DATEADD(second, -@windowSeconds, SYSUTCDATETIME())`,
    [
      { name: "businessId", type: sql.UniqueIdentifier, value: params.businessId },
      {
        name: "conversationId",
        type: sql.UniqueIdentifier,
        value: params.conversationId,
      },
      { name: "windowSeconds", type: sql.Int, value: windowSeconds },
    ],
  );
  return Number(result.recordset[0]?.Cnt ?? 0);
}

export async function upsertConversationPause(params: {
  businessId: string;
  conversationId: string;
  pauseReason?: string;
  pauseSeconds?: number;
}, trx?: TransactionClient): Promise<AiConversationGuard> {
  const pauseReason = params.pauseReason ?? LOOP_GUARD_PAUSE_REASON;
  const pauseSeconds = params.pauseSeconds ?? LOOP_GUARD_PAUSE_SECONDS;

  await db(trx).execute(
    `MERGE TblAiConversationGuard AS t
     USING (
       SELECT @businessId AS BusinessID, @conversationId AS ConversationID
     ) AS s
     ON t.BusinessID = s.BusinessID AND t.ConversationID = s.ConversationID
     WHEN MATCHED THEN
       UPDATE SET
         PausedUntilUtc = DATEADD(second, @pauseSeconds, SYSUTCDATETIME()),
         PauseReason = @pauseReason,
         TriggeredAtUtc = SYSUTCDATETIME(),
         UpdatedAtUtc = SYSUTCDATETIME()
     WHEN NOT MATCHED THEN
       INSERT (
         BusinessID, ConversationID, PausedUntilUtc, PauseReason,
         TriggeredAtUtc, CreatedAtUtc, UpdatedAtUtc
       ) VALUES (
         s.BusinessID, s.ConversationID,
         DATEADD(second, @pauseSeconds, SYSUTCDATETIME()),
         @pauseReason,
         SYSUTCDATETIME(), SYSUTCDATETIME(), SYSUTCDATETIME()
       );`,
    [
      { name: "businessId", type: sql.UniqueIdentifier, value: params.businessId },
      {
        name: "conversationId",
        type: sql.UniqueIdentifier,
        value: params.conversationId,
      },
      { name: "pauseReason", type: sql.NVarChar(64), value: pauseReason },
      { name: "pauseSeconds", type: sql.Int, value: pauseSeconds },
    ],
  );

  const guard = await getConversationGuard(params, trx);
  return guard!;
}

/**
 * Schedule-time / send-time circuit breaker.
 * If already paused or recent SENT count >= max, blocks AI work.
 */
export async function evaluateConversationLoopGuard(params: {
  businessId: string;
  conversationId: string;
  jobId?: string;
  logger?: { info: (...a: unknown[]) => void; warn: (...a: unknown[]) => void };
}, trx?: TransactionClient): Promise<{
  allow: boolean;
  reason?: "LOOP_GUARD_ACTIVE";
  recentSentCount: number;
  pausedUntilUtc?: Date | null;
}> {
  const logger = params.logger ?? console;
  const pauseState = await isConversationPaused(
    {
      businessId: params.businessId,
      conversationId: params.conversationId,
    },
    trx,
  );

  if (pauseState.paused) {
    logAiSafety(
      "loop_guard_active",
      {
        businessId: params.businessId,
        conversationId: params.conversationId,
        jobId: params.jobId,
        pausedUntilUtc: pauseState.guard?.pausedUntilUtc?.toISOString() ?? null,
        reason: "LOOP_GUARD_ACTIVE",
      },
      logger,
    );
    return {
      allow: false,
      reason: "LOOP_GUARD_ACTIVE",
      recentSentCount: await countRecentSentAiJobs(params, trx),
      pausedUntilUtc: pauseState.guard?.pausedUntilUtc ?? null,
    };
  }

  const recentSentCount = await countRecentSentAiJobs(params, trx);
  if (recentSentCount >= LOOP_GUARD_MAX_SENT) {
    const guard = await upsertConversationPause(
      {
        businessId: params.businessId,
        conversationId: params.conversationId,
      },
      trx,
    );
    logAiSafety(
      "loop_guard_triggered",
      {
        businessId: params.businessId,
        conversationId: params.conversationId,
        jobId: params.jobId,
        recentSentCount,
        pausedUntilUtc: guard.pausedUntilUtc?.toISOString() ?? null,
        reason: LOOP_GUARD_PAUSE_REASON,
      },
      logger,
    );
    return {
      allow: false,
      reason: "LOOP_GUARD_ACTIVE",
      recentSentCount,
      pausedUntilUtc: guard.pausedUntilUtc,
    };
  }

  return { allow: true, recentSentCount };
}
