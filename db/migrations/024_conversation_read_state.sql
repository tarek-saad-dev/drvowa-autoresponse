-- Reset existing inbox backlog as read and track read state for future inbound messages.

IF COL_LENGTH(N'dbo.TblConversation', N'LastReadAtUtc') IS NULL
BEGIN
  ALTER TABLE dbo.TblConversation ADD LastReadAtUtc DATETIME2 NULL;
END;
GO

-- One-time baseline: everything that existed before this migration is considered read.
UPDATE dbo.TblConversation
SET LastReadAtUtc = SYSUTCDATETIME()
WHERE LastReadAtUtc IS NULL;
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = N'IX_TblConversation_Business_Unread'
    AND object_id = OBJECT_ID(N'dbo.TblConversation')
)
BEGIN
  CREATE INDEX IX_TblConversation_Business_Unread
    ON dbo.TblConversation (BusinessID, LastInboundAtUtc DESC, LastReadAtUtc);
END;
GO
