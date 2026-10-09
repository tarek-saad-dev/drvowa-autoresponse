-- Inbox V2 message provenance for WhatsApp-Web style rendering.

IF COL_LENGTH(N'dbo.TblMessage', N'Origin') IS NULL
BEGIN
  ALTER TABLE dbo.TblMessage ADD Origin NVARCHAR(16) NULL;
END;
GO

IF COL_LENGTH(N'dbo.TblMessage', N'ActorUserID') IS NULL
BEGIN
  ALTER TABLE dbo.TblMessage ADD ActorUserID UNIQUEIDENTIFIER NULL;
END;
GO

IF COL_LENGTH(N'dbo.TblMessage', N'ActorName') IS NULL
BEGIN
  ALTER TABLE dbo.TblMessage ADD ActorName NVARCHAR(200) NULL;
END;
GO

UPDATE dbo.TblMessage
SET Origin = CASE
  WHEN Direction = N'INBOUND' THEN N'CUSTOMER'
  ELSE N'UNKNOWN'
END
WHERE Origin IS NULL;
GO

IF EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID(N'dbo.TblMessage')
    AND name = N'Origin'
    AND is_nullable = 1
)
BEGIN
  ALTER TABLE dbo.TblMessage ALTER COLUMN Origin NVARCHAR(16) NOT NULL;
END;
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.default_constraints dc
  INNER JOIN sys.columns c
    ON c.object_id = dc.parent_object_id
   AND c.column_id = dc.parent_column_id
  WHERE dc.parent_object_id = OBJECT_ID(N'dbo.TblMessage')
    AND c.name = N'Origin'
)
BEGIN
  ALTER TABLE dbo.TblMessage
    ADD CONSTRAINT DF_TblMessage_Origin DEFAULT (N'UNKNOWN') FOR Origin;
END;
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.check_constraints
  WHERE name = N'CK_TblMessage_Origin'
)
BEGIN
  ALTER TABLE dbo.TblMessage
    ADD CONSTRAINT CK_TblMessage_Origin
    CHECK (Origin IN (N'CUSTOMER', N'AI', N'HUMAN', N'SYSTEM', N'UNKNOWN'));
END;
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.foreign_keys
  WHERE name = N'FK_TblMessage_ActorUser'
)
BEGIN
  ALTER TABLE dbo.TblMessage
    ADD CONSTRAINT FK_TblMessage_ActorUser FOREIGN KEY (ActorUserID)
      REFERENCES dbo.TblUser (UserID) ON DELETE NO ACTION;
END;
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = N'IX_TblMessage_Conversation_Origin'
    AND object_id = OBJECT_ID(N'dbo.TblMessage')
)
BEGIN
  CREATE INDEX IX_TblMessage_Conversation_Origin
    ON dbo.TblMessage (BusinessID, ConversationID, Origin, CreatedAtUtc DESC);
END;
GO
