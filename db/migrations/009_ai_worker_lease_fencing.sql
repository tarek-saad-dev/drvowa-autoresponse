-- Phase 3B AI worker: durable lease fencing + outbound unknown budget.
-- Additive only. Idempotent. Safe for existing PENDING/PROCESSING/terminal rows.
-- Note: each ALTER is isolated so SQL Server does not parse later statements
-- against columns that do not yet exist in the same batch.

-- ---------------------------------------------------------------------------
-- Lease fencing columns
-- ---------------------------------------------------------------------------
IF COL_LENGTH(N'dbo.TblAiReplyJob', N'LeaseToken') IS NULL
BEGIN
  ALTER TABLE dbo.TblAiReplyJob
    ADD LeaseToken UNIQUEIDENTIFIER NULL;
END;
GO

IF COL_LENGTH(N'dbo.TblAiReplyJob', N'LeaseOwner') IS NULL
BEGIN
  ALTER TABLE dbo.TblAiReplyJob
    ADD LeaseOwner NVARCHAR(128) NULL;
END;
GO

IF COL_LENGTH(N'dbo.TblAiReplyJob', N'LeaseVersion') IS NULL
BEGIN
  ALTER TABLE dbo.TblAiReplyJob
    ADD LeaseVersion BIGINT NOT NULL
      CONSTRAINT DF_TblAiReplyJob_LeaseVersion DEFAULT (0);
END;
GO

IF COL_LENGTH(N'dbo.TblAiReplyJob', N'OutboundUnknownCount') IS NULL
BEGIN
  ALTER TABLE dbo.TblAiReplyJob
    ADD OutboundUnknownCount INT NOT NULL
      CONSTRAINT DF_TblAiReplyJob_OutboundUnknownCount DEFAULT (0);
END;
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.check_constraints
  WHERE name = N'CK_TblAiReplyJob_OutboundUnknownCount'
    AND parent_object_id = OBJECT_ID(N'dbo.TblAiReplyJob')
)
BEGIN
  ALTER TABLE dbo.TblAiReplyJob
    ADD CONSTRAINT CK_TblAiReplyJob_OutboundUnknownCount
    CHECK (OutboundUnknownCount >= 0);
END;
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.check_constraints
  WHERE name = N'CK_TblAiReplyJob_LeaseVersion'
    AND parent_object_id = OBJECT_ID(N'dbo.TblAiReplyJob')
)
BEGIN
  ALTER TABLE dbo.TblAiReplyJob
    ADD CONSTRAINT CK_TblAiReplyJob_LeaseVersion
    CHECK (LeaseVersion >= 0);
END;
GO
