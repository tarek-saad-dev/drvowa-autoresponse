import { randomUUID } from "node:crypto";

import {
  isUniqueViolationError,
  query,
  sql,
  type TransactionClient,
} from "@/lib/db";
import { normalizeUuid } from "@/lib/ids/uuid";
import type { AiReplyJob, AiReplyJobStatus } from "@/types/domain";

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
  StartedAtUtc, CompletedAtUtc, LastErrorCode,
  GeneratedReplyText, GeneratedModel, GeneratedAtUtc, OutboundProviderMessageID,
  CreatedAtUtc, UpdatedAtUtc`;

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
      createdAtUtc: new Date(),
      updatedAtUtc: new Date(),
    },
    coalesced: false,
  };
}

const LEASE_SECONDS = 90;

/**
 * Atomically claim the next eligible job.
 * - Never claims PENDING while another PROCESSING job exists for the same conversation.
 * - Expired PROCESSING leases are reclaimable, including OUTBOUND_RESULT_UNKNOWN.
 * - Prefer reclaiming expired PROCESSING over PENDING for the same ordering window.
 */
export async function claimNextJob(params?: {
  workerId?: string;
  leaseSeconds?: number;
  businessId?: string;
}): Promise<AiReplyJob | null> {
  const leaseSeconds = params?.leaseSeconds ?? LEASE_SECONDS;
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
         StartedAtUtc = ISNULL(StartedAtUtc, SYSUTCDATETIME()),
         UpdatedAtUtc = SYSUTCDATETIME()
     OUTPUT
       INSERTED.AiReplyJobID, INSERTED.BusinessID, INSERTED.ChannelConnectionID,
       INSERTED.ConversationID, INSERTED.ContactID, INSERTED.TriggerMessageID,
       INSERTED.Status, INSERTED.NotBeforeUtc, INSERTED.AttemptCount,
       INSERTED.LeaseUntilUtc, INSERTED.StartedAtUtc, INSERTED.CompletedAtUtc,
       INSERTED.LastErrorCode,
       INSERTED.GeneratedReplyText, INSERTED.GeneratedModel, INSERTED.GeneratedAtUtc,
       INSERTED.OutboundProviderMessageID,
       INSERTED.CreatedAtUtc, INSERTED.UpdatedAtUtc;`,
    [
      { name: "leaseSeconds", type: sql.Int, value: leaseSeconds },
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

export async function completeJob(params: {
  businessId: string;
  jobId: string;
  status: Extract<AiReplyJobStatus, "SENT" | "SKIPPED" | "FAILED" | "COALESCED">;
  errorCode?: string | null;
  outboundProviderMessageId?: string | null;
  trx?: TransactionClient;
}): Promise<boolean> {
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
         UpdatedAtUtc = SYSUTCDATETIME()
     OUTPUT INSERTED.AiReplyJobID
     WHERE BusinessID = @businessId
       AND AiReplyJobID = @jobId
       AND Status = N'PROCESSING'`,
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
    ],
  );
  return Boolean(result.recordset[0]);
}

/**
 * Persist Gemini output once. Never overwrite an existing GeneratedReplyText.
 */
export async function persistGeneratedReply(params: {
  businessId: string;
  jobId: string;
  replyText: string;
  model: string;
}, trx?: TransactionClient): Promise<void> {
  await db(trx).execute(
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
       AND Status = N'PROCESSING'`,
    [
      { name: "replyText", type: sql.NVarChar(sql.MAX), value: params.replyText },
      { name: "model", type: sql.NVarChar(128), value: params.model },
      {
        name: "businessId",
        type: sql.UniqueIdentifier,
        value: params.businessId,
      },
      { name: "jobId", type: sql.UniqueIdentifier, value: params.jobId },
    ],
  );
}

/**
 * Keep job PROCESSING but expire the lease after delaySeconds so claim can retry
 * the same idempotency key without regenerating Gemini.
 */
export async function deferUnknownOutbound(params: {
  businessId: string;
  jobId: string;
  delaySeconds: number;
  errorCode?: string;
}): Promise<void> {
  const delay = Math.max(params.delaySeconds, 1);
  await query(
    `UPDATE TblAiReplyJob
     SET LastErrorCode = @errorCode,
         LeaseUntilUtc = DATEADD(second, @delaySeconds, SYSUTCDATETIME()),
         NotBeforeUtc = DATEADD(second, @delaySeconds, SYSUTCDATETIME()),
         UpdatedAtUtc = SYSUTCDATETIME()
     WHERE BusinessID = @businessId
       AND AiReplyJobID = @jobId
       AND Status = N'PROCESSING'`,
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
    ],
  );
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
  leaseSeconds?: number;
}): Promise<void> {
  const leaseSeconds = params.leaseSeconds ?? LEASE_SECONDS;
  await query(
    `UPDATE TblAiReplyJob
     SET LeaseUntilUtc = DATEADD(second, @leaseSeconds, SYSUTCDATETIME()),
         UpdatedAtUtc = SYSUTCDATETIME()
     WHERE BusinessID = @businessId
       AND AiReplyJobID = @jobId
       AND Status = N'PROCESSING'`,
    [
      { name: "leaseSeconds", type: sql.Int, value: leaseSeconds },
      {
        name: "businessId",
        type: sql.UniqueIdentifier,
        value: params.businessId,
      },
      { name: "jobId", type: sql.UniqueIdentifier, value: params.jobId },
    ],
  );
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
