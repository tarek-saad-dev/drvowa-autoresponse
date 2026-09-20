import { randomUUID } from "node:crypto";

import {
  isUniqueViolationError,
  query,
  sql,
  withTransaction,
  type TransactionClient,
} from "@/lib/db";
import { normalizeUuid } from "@/lib/ids/uuid";
import type { AiReplyJob, AiReplyJobStatus } from "@/types/domain";

import { AiJobLeaseLostError, AI_JOB_LEASE_SECONDS_DEFAULT } from "./lease";
import {
  MAX_SEND_RESOLUTION_ATTEMPTS,
  outboundUnknownRetryDelaySeconds,
} from "./outbound-policy";
import { pauseConversationAi } from "./conversation-state-repository";

type JobRow = {
  AiReplyJobID: string;
  BusinessID: string;
  ChannelConnectionID: string;
  ConversationID: string;
  ContactID: string;
  TriggerMessageID: string;
  Status: string;
  NotBeforeUtc: Date;
  AttemptCount: number;
  LeaseUntilUtc: Date | null;
  LeaseToken: string | null;
  LeaseOwner: string | null;
  LeaseVersion: number | null;
  OutboundUnknownCount: number | null;
  StartedAtUtc: Date | null;
  CompletedAtUtc: Date | null;
  LastErrorCode: string | null;
  GeneratedReplyText: string | null;
  GeneratedModel: string | null;
  GeneratedAtUtc: Date | null;
  OutboundProviderMessageID: string | null;
  CreatedAtUtc: Date;
  UpdatedAtUtc: Date;
};

const JOB_SELECT_COLS = `
  AiReplyJobID, BusinessID, ChannelConnectionID, ConversationID, ContactID,
  TriggerMessageID, Status, NotBeforeUtc, AttemptCount, LeaseUntilUtc,
  LeaseToken, LeaseOwner, LeaseVersion, OutboundUnknownCount,
  StartedAtUtc, CompletedAtUtc, LastErrorCode,
  GeneratedReplyText, GeneratedModel, GeneratedAtUtc, OutboundProviderMessageID,
  CreatedAtUtc, UpdatedAtUtc`;

/** Authoritative live-lease fence (token + unexpired). */
const LIVE_LEASE_FENCE = `
       AND Status = N'PROCESSING'
       AND LeaseToken = @leaseToken
       AND LeaseUntilUtc IS NOT NULL
       AND LeaseUntilUtc >= SYSUTCDATETIME()`;

function mapJob(row: JobRow): AiReplyJob {
  return {
    aiReplyJobId: normalizeUuid(row.AiReplyJobID),
    businessId: normalizeUuid(row.BusinessID),
    channelConnectionId: normalizeUuid(row.ChannelConnectionID),
    conversationId: normalizeUuid(row.ConversationID),
    contactId: normalizeUuid(row.ContactID),
    triggerMessageId: normalizeUuid(row.TriggerMessageID),
    status: row.Status as AiReplyJobStatus,
    notBeforeUtc: row.NotBeforeUtc,
    attemptCount: row.AttemptCount,
    leaseUntilUtc: row.LeaseUntilUtc,
    leaseToken: row.LeaseToken ? normalizeUuid(row.LeaseToken) : null,
    leaseOwner: row.LeaseOwner,
    leaseVersion: Number(row.LeaseVersion ?? 0),
    outboundUnknownCount: Number(row.OutboundUnknownCount ?? 0),
    startedAtUtc: row.StartedAtUtc,
    completedAtUtc: row.CompletedAtUtc,
    lastErrorCode: row.LastErrorCode,
    generatedReplyText: row.GeneratedReplyText,
    generatedModel: row.GeneratedModel,
    generatedAtUtc: row.GeneratedAtUtc,
    outboundProviderMessageId: row.OutboundProviderMessageID,
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

export async function findPendingJobForConversation(params: {
  businessId: string;
  conversationId: string;
}, trx?: TransactionClient): Promise<AiReplyJob | null> {
  const result = await db(trx).query<JobRow>(
    `SELECT TOP 1 ${JOB_SELECT_COLS}
     FROM TblAiReplyJob
     WHERE BusinessID = @businessId
       AND ConversationID = @conversationId
       AND Status = N'PENDING'
     ORDER BY CreatedAtUtc ASC`,
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
  return row ? mapJob(row) : null;
}

async function coalesceOntoPendingJob(params: {
  existing: AiReplyJob;
  triggerMessageId: string;
  notBeforeUtc: Date;
  businessId: string;
}, trx?: TransactionClient): Promise<{ job: AiReplyJob; coalesced: boolean }> {
  await db(trx).execute(
    `UPDATE TblAiReplyJob
     SET TriggerMessageID = @triggerMessageId,
         NotBeforeUtc = @notBeforeUtc,
         UpdatedAtUtc = SYSUTCDATETIME()
     WHERE BusinessID = @businessId
       AND AiReplyJobID = @jobId
       AND Status = N'PENDING'`,
    [
      {
        name: "triggerMessageId",
        type: sql.UniqueIdentifier,
        value: params.triggerMessageId,
      },
      { name: "notBeforeUtc", type: sql.DateTime2, value: params.notBeforeUtc },
      {
        name: "businessId",
        type: sql.UniqueIdentifier,
        value: params.businessId,
      },
      {
        name: "jobId",
        type: sql.UniqueIdentifier,
        value: params.existing.aiReplyJobId,
      },
    ],
  );
  return {
    job: {
      ...params.existing,
      triggerMessageId: params.triggerMessageId,
      notBeforeUtc: params.notBeforeUtc,
      updatedAtUtc: new Date(),
    },
    coalesced: true,
  };
}

/**
 * Create or coalesce a PENDING AI reply job (burst debounce).
 * Race-safe under UQ_TblAiReplyJob_Business_Conversation_Pending.
 */
export async function scheduleOrCoalesceJob(params: {
  businessId: string;
  channelConnectionId: string;
  conversationId: string;
  contactId: string;
  triggerMessageId: string;
  debounceMs: number;
}, trx?: TransactionClient): Promise<{ job: AiReplyJob; coalesced: boolean }> {
  const notBefore = new Date(Date.now() + Math.max(params.debounceMs, 0));
  const existing = await findPendingJobForConversation(
    {
      businessId: params.businessId,
      conversationId: params.conversationId,
    },
    trx,
  );

  if (existing) {
    return coalesceOntoPendingJob(
      {
        existing,
        triggerMessageId: params.triggerMessageId,
        notBeforeUtc: notBefore,
        businessId: params.businessId,
      },
      trx,
    );
  }

  const jobId = randomUUID();
  try {
    await db(trx).execute(
      `INSERT INTO TblAiReplyJob (
         AiReplyJobID, BusinessID, ChannelConnectionID, ConversationID, ContactID,
         TriggerMessageID, Status, NotBeforeUtc, AttemptCount,
         LeaseUntilUtc, StartedAtUtc, CompletedAtUtc, LastErrorCode,
         GeneratedReplyText, GeneratedModel, GeneratedAtUtc, OutboundProviderMessageID,
         CreatedAtUtc, UpdatedAtUtc
       ) VALUES (
         @jobId, @businessId, @channelConnectionId, @conversationId, @contactId,
         @triggerMessageId, N'PENDING', @notBeforeUtc, 0,
         NULL, NULL, NULL, NULL,
         NULL, NULL, NULL, NULL,
         SYSUTCDATETIME(), SYSUTCDATETIME()
       )`,
      [
        { name: "jobId", type: sql.UniqueIdentifier, value: jobId },
        {
          name: "businessId",
          type: sql.UniqueIdentifier,
          value: params.businessId,
        },
        {
          name: "channelConnectionId",
          type: sql.UniqueIdentifier,
          value: params.channelConnectionId,
        },
        {
          name: "conversationId",
          type: sql.UniqueIdentifier,
          value: params.conversationId,
        },
        {
          name: "contactId",
          type: sql.UniqueIdentifier,
          value: params.contactId,
        },
        {
          name: "triggerMessageId",
          type: sql.UniqueIdentifier,
          value: params.triggerMessageId,
        },
        { name: "notBeforeUtc", type: sql.DateTime2, value: notBefore },
      ],
    );
  } catch (error) {
    if (!isUniqueViolationError(error)) throw error;
    const winner = await findPendingJobForConversation(
      {
        businessId: params.businessId,
        conversationId: params.conversationId,
      },
      trx,
    );
    if (!winner) throw error;
    return coalesceOntoPendingJob(
      {
        existing: winner,
        triggerMessageId: params.triggerMessageId,
        notBeforeUtc: notBefore,
        businessId: params.businessId,
      },
      trx,
    );
  }

  return {
    job: {
      aiReplyJobId: jobId,
      businessId: params.businessId,
      channelConnectionId: params.channelConnectionId,
      conversationId: params.conversationId,
      contactId: params.contactId,
      triggerMessageId: params.triggerMessageId,
      status: "PENDING",
      notBeforeUtc: notBefore,
      attemptCount: 0,
      leaseUntilUtc: null,
      startedAtUtc: null,
      completedAtUtc: null,
      lastErrorCode: null,
      generatedReplyText: null,
      generatedModel: null,
      generatedAtUtc: null,
      outboundProviderMessageId: null,
      leaseToken: null,
      leaseOwner: null,
      leaseVersion: 0,
      outboundUnknownCount: 0,
      createdAtUtc: new Date(),
      updatedAtUtc: new Date(),
    },
    coalesced: false,
  };
}

const LEASE_SECONDS = AI_JOB_LEASE_SECONDS_DEFAULT;

/**
 * Atomically claim the next eligible job.
 * Assigns a NEW LeaseToken + increments LeaseVersion on every claim/reclaim.
 */
export async function claimNextJob(params?: {
  workerId?: string;
  leaseSeconds?: number;
  businessId?: string;
}): Promise<AiReplyJob | null> {
  const leaseSeconds = params?.leaseSeconds ?? LEASE_SECONDS;
  const leaseToken = randomUUID();
  const leaseOwner = (params?.workerId ?? "unknown").slice(0, 128);
  const businessFilter = params?.businessId
    ? "AND BusinessID = @businessId"
    : "";
  const result = await query<JobRow>(
    `;WITH cte AS (
       SELECT TOP (1) *
       FROM TblAiReplyJob WITH (UPDLOCK, READPAST, ROWLOCK)
       WHERE (
         (
           Status = N'PENDING'
           AND NotBeforeUtc <= SYSUTCDATETIME()
           AND NOT EXISTS (
             SELECT 1
             FROM TblAiReplyJob AS other WITH (UPDLOCK, READPAST, ROWLOCK)
             WHERE other.BusinessID = TblAiReplyJob.BusinessID
               AND other.ConversationID = TblAiReplyJob.ConversationID
               AND other.Status = N'PROCESSING'
               AND other.AiReplyJobID <> TblAiReplyJob.AiReplyJobID
           )
         ) OR (
           Status = N'PROCESSING'
           AND LeaseUntilUtc IS NOT NULL
           AND LeaseUntilUtc < SYSUTCDATETIME()
           AND (
             LastErrorCode IS NULL
             OR LastErrorCode = N'OUTBOUND_RESULT_UNKNOWN'
           )
         )
       )
       ${businessFilter}
       ORDER BY
         CASE WHEN Status = N'PROCESSING' THEN 0 ELSE 1 END,
         NotBeforeUtc ASC,
         CreatedAtUtc ASC
     )
     UPDATE cte
     SET Status = N'PROCESSING',
         AttemptCount = AttemptCount + 1,
         LeaseUntilUtc = DATEADD(second, @leaseSeconds, SYSUTCDATETIME()),
         LeaseToken = @leaseToken,
         LeaseOwner = @leaseOwner,
         LeaseVersion = ISNULL(LeaseVersion, 0) + 1,
         StartedAtUtc = ISNULL(StartedAtUtc, SYSUTCDATETIME()),
         UpdatedAtUtc = SYSUTCDATETIME()
     OUTPUT
       INSERTED.AiReplyJobID, INSERTED.BusinessID, INSERTED.ChannelConnectionID,
       INSERTED.ConversationID, INSERTED.ContactID, INSERTED.TriggerMessageID,
       INSERTED.Status, INSERTED.NotBeforeUtc, INSERTED.AttemptCount,
       INSERTED.LeaseUntilUtc, INSERTED.LeaseToken, INSERTED.LeaseOwner,
       INSERTED.LeaseVersion, INSERTED.OutboundUnknownCount,
       INSERTED.StartedAtUtc, INSERTED.CompletedAtUtc,
       INSERTED.LastErrorCode,
       INSERTED.GeneratedReplyText, INSERTED.GeneratedModel, INSERTED.GeneratedAtUtc,
       INSERTED.OutboundProviderMessageID,
       INSERTED.CreatedAtUtc, INSERTED.UpdatedAtUtc;`,
    [
      { name: "leaseSeconds", type: sql.Int, value: leaseSeconds },
      { name: "leaseToken", type: sql.UniqueIdentifier, value: leaseToken },
      { name: "leaseOwner", type: sql.NVarChar(128), value: leaseOwner },
      ...(params?.businessId
        ? [
            {
              name: "businessId",
              type: sql.UniqueIdentifier,
              value: params.businessId,
            },
          ]
        : []),
    ],
  );
  const row = result.recordset[0];
  return row ? mapJob(row) : null;
}

/**
 * DB-authoritative live ownership check. Does not create or extend a lease.
 */
export async function assertJobLeaseOwned(params: {
  businessId: string;
  jobId: string;
  leaseToken: string;
  trx?: TransactionClient;
}): Promise<void> {
  // UPDLOCK when transactional so finalization cannot race a reclaim mid-TX.
  const lockHint = params.trx ? "WITH (UPDLOCK, ROWLOCK)" : "";
  const result = await db(params.trx).query<{ Ok: number }>(
    `SELECT 1 AS Ok
     FROM TblAiReplyJob ${lockHint}
     WHERE BusinessID = @businessId
       AND AiReplyJobID = @jobId
       ${LIVE_LEASE_FENCE}`,
    [
      {
        name: "businessId",
        type: sql.UniqueIdentifier,
        value: params.businessId,
      },
      { name: "jobId", type: sql.UniqueIdentifier, value: params.jobId },
      {
        name: "leaseToken",
        type: sql.UniqueIdentifier,
        value: params.leaseToken,
      },
    ],
  );
  if (!result.recordset[0]) {
    throw new AiJobLeaseLostError();
  }
}

export async function completeJob(params: {
  businessId: string;
  jobId: string;
  status: Extract<AiReplyJobStatus, "SENT" | "SKIPPED" | "FAILED" | "COALESCED">;
  errorCode?: string | null;
  outboundProviderMessageId?: string | null;
  leaseToken?: string | null;
  trx?: TransactionClient;
}): Promise<boolean> {
  const fenceByToken = Boolean(params.leaseToken);
  const result = await db(params.trx).query<{ AiReplyJobID: string }>(
    `UPDATE TblAiReplyJob
     SET Status = @status,
         LastErrorCode = @errorCode,
         OutboundProviderMessageID = COALESCE(
           @outboundProviderMessageId,
           OutboundProviderMessageID
         ),
         CompletedAtUtc = SYSUTCDATETIME(),
         LeaseUntilUtc = NULL,
         LeaseToken = NULL,
         LeaseOwner = NULL,
         UpdatedAtUtc = SYSUTCDATETIME()
     OUTPUT INSERTED.AiReplyJobID
     WHERE BusinessID = @businessId
       AND AiReplyJobID = @jobId
       AND Status = N'PROCESSING'
       ${
         fenceByToken
           ? `AND LeaseToken = @leaseToken
              AND LeaseUntilUtc IS NOT NULL
              AND LeaseUntilUtc >= SYSUTCDATETIME()`
           : ""
       }`,
    [
      { name: "status", type: sql.NVarChar(32), value: params.status },
      {
        name: "errorCode",
        type: sql.NVarChar(64),
        value: params.errorCode ?? null,
      },
      {
        name: "outboundProviderMessageId",
        type: sql.NVarChar(256),
        value: params.outboundProviderMessageId ?? null,
      },
      {
        name: "businessId",
        type: sql.UniqueIdentifier,
        value: params.businessId,
      },
      { name: "jobId", type: sql.UniqueIdentifier, value: params.jobId },
      ...(fenceByToken
        ? [
            {
              name: "leaseToken",
              type: sql.UniqueIdentifier,
              value: params.leaseToken,
            },
          ]
        : []),
    ],
  );
  const ok = Boolean(result.recordset[0]);
  // Fenced production calls must never silently fail ownership.
  if (fenceByToken && !ok) {
    throw new AiJobLeaseLostError();
  }
  return ok;
}

/**
 * Persist durable generated reply text. When leaseToken provided, requires live fence.
 */
export async function persistGeneratedReply(params: {
  businessId: string;
  jobId: string;
  replyText: string;
  model: string;
  leaseToken?: string | null;
}, trx?: TransactionClient): Promise<boolean> {
  const fenceByToken = Boolean(params.leaseToken);
  const affected = await db(trx).execute(
    `UPDATE TblAiReplyJob
     SET GeneratedReplyText = CASE
           WHEN GeneratedReplyText IS NULL OR LTRIM(RTRIM(GeneratedReplyText)) = N''
           THEN @replyText
           ELSE GeneratedReplyText
         END,
         GeneratedModel = CASE
           WHEN GeneratedModel IS NULL OR LTRIM(RTRIM(GeneratedModel)) = N''
           THEN @model
           ELSE GeneratedModel
         END,
         GeneratedAtUtc = ISNULL(GeneratedAtUtc, SYSUTCDATETIME()),
         UpdatedAtUtc = SYSUTCDATETIME()
     WHERE BusinessID = @businessId
       AND AiReplyJobID = @jobId
       AND Status = N'PROCESSING'
       ${
         fenceByToken
           ? `AND LeaseToken = @leaseToken
              AND LeaseUntilUtc IS NOT NULL
              AND LeaseUntilUtc >= SYSUTCDATETIME()`
           : ""
       }`,
    [
      { name: "replyText", type: sql.NVarChar(sql.MAX), value: params.replyText },
      { name: "model", type: sql.NVarChar(128), value: params.model },
      {
        name: "businessId",
        type: sql.UniqueIdentifier,
        value: params.businessId,
      },
      { name: "jobId", type: sql.UniqueIdentifier, value: params.jobId },
      ...(fenceByToken
        ? [
            {
              name: "leaseToken",
              type: sql.UniqueIdentifier,
              value: params.leaseToken,
            },
          ]
        : []),
    ],
  );
  if (fenceByToken && affected === 0) {
    throw new AiJobLeaseLostError();
  }
  return affected > 0;
}

/**
 * @deprecated Prefer recordAmbiguousOutbound (atomic increment + relinquish).
 * Kept for transitional callers; requires leaseToken and clears ownership.
 */
export async function deferUnknownOutbound(params: {
  businessId: string;
  jobId: string;
  delaySeconds: number;
  errorCode?: string;
  leaseToken?: string | null;
}): Promise<boolean> {
  const delay = Math.max(params.delaySeconds, 1);
  if (!params.leaseToken) {
    throw new AiJobLeaseLostError("leaseToken required to defer unknown outbound");
  }
  const affected = await query(
    `UPDATE TblAiReplyJob
     SET LastErrorCode = @errorCode,
         LeaseUntilUtc = DATEADD(second, @delaySeconds, SYSUTCDATETIME()),
         NotBeforeUtc = DATEADD(second, @delaySeconds, SYSUTCDATETIME()),
         LeaseToken = NULL,
         LeaseOwner = NULL,
         UpdatedAtUtc = SYSUTCDATETIME()
     WHERE BusinessID = @businessId
       AND AiReplyJobID = @jobId
       ${LIVE_LEASE_FENCE}`,
    [
      {
        name: "errorCode",
        type: sql.NVarChar(64),
        value: params.errorCode ?? "OUTBOUND_RESULT_UNKNOWN",
      },
      { name: "delaySeconds", type: sql.Int, value: delay },
      {
        name: "businessId",
        type: sql.UniqueIdentifier,
        value: params.businessId,
      },
      { name: "jobId", type: sql.UniqueIdentifier, value: params.jobId },
      {
        name: "leaseToken",
        type: sql.UniqueIdentifier,
        value: params.leaseToken,
      },
    ],
  );
  return (affected.rowsAffected?.[0] ?? 0) > 0;
}

export type AmbiguousOutboundResult =
  | {
    outcome: "deferred";
    outboundUnknownCount: number;
    delaySeconds: number;
  }
  | {
    outcome: "finalized";
    outboundUnknownCount: number;
  };

/**
 * Atomic ambiguous-outbound transition:
 * - increments OutboundUnknownCount in SQL
 * - counts 1–2: defer + relinquish lease in same UPDATE
 * - count 3+: FAILED + SAFETY_PAUSED in one transaction
 */
export async function recordAmbiguousOutbound(params: {
  businessId: string;
  jobId: string;
  conversationId: string;
  leaseToken: string;
}): Promise<AmbiguousOutboundResult> {
  return withTransaction(async (trx) => {
    const bump = await trx.query<{
      OutboundUnknownCount: number;
      Status: string;
    }>(
      `UPDATE TblAiReplyJob
       SET OutboundUnknownCount = OutboundUnknownCount + 1,
           LastErrorCode = CASE
             WHEN OutboundUnknownCount + 1 >= @maxAttempts
             THEN N'OUTBOUND_RESULT_UNKNOWN_FINAL'
             ELSE N'OUTBOUND_RESULT_UNKNOWN'
           END,
           Status = CASE
             WHEN OutboundUnknownCount + 1 >= @maxAttempts THEN N'FAILED'
             ELSE Status
           END,
           CompletedAtUtc = CASE
             WHEN OutboundUnknownCount + 1 >= @maxAttempts THEN SYSUTCDATETIME()
             ELSE CompletedAtUtc
           END,
           LeaseToken = NULL,
           LeaseOwner = NULL,
           LeaseUntilUtc = CASE
             WHEN OutboundUnknownCount + 1 >= @maxAttempts THEN NULL
             WHEN OutboundUnknownCount + 1 = 1
             THEN DATEADD(second, 2, SYSUTCDATETIME())
             ELSE DATEADD(second, 5, SYSUTCDATETIME())
           END,
           NotBeforeUtc = CASE
             WHEN OutboundUnknownCount + 1 >= @maxAttempts THEN NotBeforeUtc
             WHEN OutboundUnknownCount + 1 = 1
             THEN DATEADD(second, 2, SYSUTCDATETIME())
             ELSE DATEADD(second, 5, SYSUTCDATETIME())
           END,
           UpdatedAtUtc = SYSUTCDATETIME()
       OUTPUT INSERTED.OutboundUnknownCount, INSERTED.Status
       WHERE BusinessID = @businessId
         AND AiReplyJobID = @jobId
         ${LIVE_LEASE_FENCE}`,
      [
        {
          name: "maxAttempts",
          type: sql.Int,
          value: MAX_SEND_RESOLUTION_ATTEMPTS,
        },
        {
          name: "businessId",
          type: sql.UniqueIdentifier,
          value: params.businessId,
        },
        { name: "jobId", type: sql.UniqueIdentifier, value: params.jobId },
        {
          name: "leaseToken",
          type: sql.UniqueIdentifier,
          value: params.leaseToken,
        },
      ],
    );

    const row = bump.recordset[0];
    if (!row) {
      throw new AiJobLeaseLostError();
    }

    const count = Number(row.OutboundUnknownCount);
    if (row.Status === "FAILED" || count >= MAX_SEND_RESOLUTION_ATTEMPTS) {
      await pauseConversationAi(
        {
          businessId: params.businessId,
          conversationId: params.conversationId,
          mode: "SAFETY_PAUSED",
          pauseReason: "AMBIGUOUS_OUTBOUND",
        },
        trx,
      );
      return { outcome: "finalized", outboundUnknownCount: count };
    }

    const delaySeconds = outboundUnknownRetryDelaySeconds(count) ?? 5;
    return {
      outcome: "deferred",
      outboundUnknownCount: count,
      delaySeconds,
    };
  });
}

export async function skipPendingJobsForConversation(params: {
  businessId: string;
  conversationId: string;
  errorCode: string;
}, trx?: TransactionClient): Promise<number> {
  const result = await db(trx).query<{ AiReplyJobID: string }>(
    `UPDATE TblAiReplyJob
     SET Status = N'SKIPPED',
         LastErrorCode = @errorCode,
         CompletedAtUtc = SYSUTCDATETIME(),
         LeaseUntilUtc = NULL,
         LeaseToken = NULL,
         LeaseOwner = NULL,
         UpdatedAtUtc = SYSUTCDATETIME()
     OUTPUT INSERTED.AiReplyJobID
     WHERE BusinessID = @businessId
       AND ConversationID = @conversationId
       AND Status = N'PENDING'`,
    [
      { name: "errorCode", type: sql.NVarChar(64), value: params.errorCode },
      {
        name: "businessId",
        type: sql.UniqueIdentifier,
        value: params.businessId,
      },
      {
        name: "conversationId",
        type: sql.UniqueIdentifier,
        value: params.conversationId,
      },
    ],
  );
  return result.recordset.length;
}

export async function extendLease(params: {
  businessId: string;
  jobId: string;
  leaseToken: string;
  leaseSeconds?: number;
}): Promise<boolean> {
  const leaseSeconds = params.leaseSeconds ?? LEASE_SECONDS;
  const result = await query<{ AiReplyJobID: string }>(
    `UPDATE TblAiReplyJob
     SET LeaseUntilUtc = DATEADD(second, @leaseSeconds, SYSUTCDATETIME()),
         UpdatedAtUtc = SYSUTCDATETIME()
     OUTPUT INSERTED.AiReplyJobID
     WHERE BusinessID = @businessId
       AND AiReplyJobID = @jobId
       ${LIVE_LEASE_FENCE}`,
    [
      { name: "leaseSeconds", type: sql.Int, value: leaseSeconds },
      {
        name: "businessId",
        type: sql.UniqueIdentifier,
        value: params.businessId,
      },
      { name: "jobId", type: sql.UniqueIdentifier, value: params.jobId },
      {
        name: "leaseToken",
        type: sql.UniqueIdentifier,
        value: params.leaseToken,
      },
    ],
  );
  return Boolean(result.recordset[0]);
}

export async function countJobs(params: {
  businessId: string;
  status?: AiReplyJobStatus;
}): Promise<number> {
  const result = await query<{ Cnt: number }>(
    params.status
      ? `SELECT COUNT(1) AS Cnt FROM TblAiReplyJob
         WHERE BusinessID = @businessId AND Status = @status`
      : `SELECT COUNT(1) AS Cnt FROM TblAiReplyJob WHERE BusinessID = @businessId`,
    [
      {
        name: "businessId",
        type: sql.UniqueIdentifier,
        value: params.businessId,
      },
      ...(params.status
        ? [{ name: "status", type: sql.NVarChar(32), value: params.status }]
        : []),
    ],
  );
  return Number(result.recordset[0]?.Cnt ?? 0);
}

export async function getJob(params: {
  businessId: string;
  jobId: string;
}): Promise<AiReplyJob | null> {
  const result = await query<JobRow>(
    `SELECT ${JOB_SELECT_COLS}
     FROM TblAiReplyJob
     WHERE BusinessID = @businessId AND AiReplyJobID = @jobId`,
    [
      {
        name: "businessId",
        type: sql.UniqueIdentifier,
        value: params.businessId,
      },
      { name: "jobId", type: sql.UniqueIdentifier, value: params.jobId },
    ],
  );
  const row = result.recordset[0];
  return row ? mapJob(row) : null;
}

export async function countProcessingJobsForConversation(params: {
  businessId: string;
  conversationId: string;
}): Promise<number> {
  const result = await query<{ Cnt: number }>(
    `SELECT COUNT(1) AS Cnt FROM TblAiReplyJob
     WHERE BusinessID = @businessId
       AND ConversationID = @conversationId
       AND Status = N'PROCESSING'`,
    [
      {
        name: "businessId",
        type: sql.UniqueIdentifier,
        value: params.businessId,
      },
      {
        name: "conversationId",
        type: sql.UniqueIdentifier,
        value: params.conversationId,
      },
    ],
  );
  return Number(result.recordset[0]?.Cnt ?? 0);
}
