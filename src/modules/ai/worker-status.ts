/**
 * Read-only AI worker queue health (no PII / no LeaseToken / no message bodies).
 */

import { query, sql } from "@/lib/db";

export type AiWorkerQueueStatus = {
  pending: number;
  eligiblePending: number;
  processing: number;
  expiredProcessing: number;
  processingUnknownOutbound: number;
  recentFailed: number;
  recentSent: number;
  safetyPausedConversations: number;
  oldestPendingAgeSeconds: number | null;
  oldestProcessingAgeSeconds: number | null;
};

export async function getAiWorkerQueueStatus(params?: {
  businessId?: string;
}): Promise<AiWorkerQueueStatus> {
  const businessFilter = params?.businessId
    ? "AND j.BusinessID = @businessId"
    : "";
  const inputs = params?.businessId
    ? [
        {
          name: "businessId",
          type: sql.UniqueIdentifier,
          value: params.businessId,
        },
      ]
    : [];

  const result = await query<{
    Pending: number;
    EligiblePending: number;
    Processing: number;
    ExpiredProcessing: number;
    ProcessingUnknown: number;
    RecentFailed: number;
    RecentSent: number;
    SafetyPaused: number;
    OldestPendingAgeSeconds: number | null;
    OldestProcessingAgeSeconds: number | null;
  }>(
    `SELECT
       (SELECT COUNT(1) FROM TblAiReplyJob j WHERE j.Status = N'PENDING' ${businessFilter}) AS Pending,
       (SELECT COUNT(1) FROM TblAiReplyJob j
         WHERE j.Status = N'PENDING'
           AND j.NotBeforeUtc <= SYSUTCDATETIME()
           ${businessFilter}) AS EligiblePending,
       (SELECT COUNT(1) FROM TblAiReplyJob j WHERE j.Status = N'PROCESSING' ${businessFilter}) AS Processing,
       (SELECT COUNT(1) FROM TblAiReplyJob j
         WHERE j.Status = N'PROCESSING'
           AND j.LeaseUntilUtc IS NOT NULL
           AND j.LeaseUntilUtc < SYSUTCDATETIME()
           ${businessFilter}) AS ExpiredProcessing,
       (SELECT COUNT(1) FROM TblAiReplyJob j
         WHERE j.Status = N'PROCESSING'
           AND j.LastErrorCode = N'OUTBOUND_RESULT_UNKNOWN'
           ${businessFilter}) AS ProcessingUnknown,
       (SELECT COUNT(1) FROM TblAiReplyJob j
         WHERE j.Status = N'FAILED'
           AND j.CompletedAtUtc >= DATEADD(hour, -24, SYSUTCDATETIME())
           ${businessFilter}) AS RecentFailed,
       (SELECT COUNT(1) FROM TblAiReplyJob j
         WHERE j.Status = N'SENT'
           AND j.CompletedAtUtc >= DATEADD(hour, -24, SYSUTCDATETIME())
           ${businessFilter}) AS RecentSent,
       (SELECT COUNT(1) FROM TblConversationAiState s
         WHERE s.Mode = N'SAFETY_PAUSED'
           ${params?.businessId ? "AND s.BusinessID = @businessId" : ""}) AS SafetyPaused,
       (SELECT MAX(DATEDIFF(second, j.CreatedAtUtc, SYSUTCDATETIME()))
         FROM TblAiReplyJob j WHERE j.Status = N'PENDING' ${businessFilter}) AS OldestPendingAgeSeconds,
       (SELECT MAX(DATEDIFF(second, j.StartedAtUtc, SYSUTCDATETIME()))
         FROM TblAiReplyJob j
         WHERE j.Status = N'PROCESSING' AND j.StartedAtUtc IS NOT NULL ${businessFilter}) AS OldestProcessingAgeSeconds`,
    inputs,
  );

  const row = result.recordset[0];
  return {
    pending: Number(row?.Pending ?? 0),
    eligiblePending: Number(row?.EligiblePending ?? 0),
    processing: Number(row?.Processing ?? 0),
    expiredProcessing: Number(row?.ExpiredProcessing ?? 0),
    processingUnknownOutbound: Number(row?.ProcessingUnknown ?? 0),
    recentFailed: Number(row?.RecentFailed ?? 0),
    recentSent: Number(row?.RecentSent ?? 0),
    safetyPausedConversations: Number(row?.SafetyPaused ?? 0),
    oldestPendingAgeSeconds: row?.OldestPendingAgeSeconds == null
      ? null
      : Number(row.OldestPendingAgeSeconds),
    oldestProcessingAgeSeconds: row?.OldestProcessingAgeSeconds == null
      ? null
      : Number(row.OldestProcessingAgeSeconds),
  };
}
