-- Phase 3B Part 1.1: at most one PENDING AI reply job per conversation.
-- PROCESSING / SENT / FAILED / SKIPPED / COALESCED do not block a future PENDING.

-- Collapse any pre-existing duplicate PENDING rows before uniqueness is enforced.
;WITH DuplicatePending AS (
  SELECT
    AiReplyJobID,
    ROW_NUMBER() OVER (
      PARTITION BY BusinessID, ConversationID
      ORDER BY UpdatedAtUtc DESC, CreatedAtUtc DESC, AiReplyJobID DESC
    ) AS rn
  FROM dbo.TblAiReplyJob
  WHERE Status = N'PENDING'
)
UPDATE j
SET
  Status = N'COALESCED',
  CompletedAtUtc = SYSUTCDATETIME(),
  UpdatedAtUtc = SYSUTCDATETIME(),
  LastErrorCode = N'DEDUP_PENDING_UNIQUENESS'
FROM dbo.TblAiReplyJob AS j
INNER JOIN DuplicatePending AS d ON d.AiReplyJobID = j.AiReplyJobID
WHERE d.rn > 1
  AND j.Status = N'PENDING';

IF NOT EXISTS (
  SELECT 1
  FROM sys.indexes
  WHERE name = N'UQ_TblAiReplyJob_Business_Conversation_Pending'
    AND object_id = OBJECT_ID(N'dbo.TblAiReplyJob')
)
BEGIN
  CREATE UNIQUE INDEX UQ_TblAiReplyJob_Business_Conversation_Pending
    ON dbo.TblAiReplyJob (BusinessID, ConversationID)
    WHERE Status = N'PENDING';
END;
