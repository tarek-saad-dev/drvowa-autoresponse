-- Mirror sync is observational; historical imports must never trigger AI jobs.
IF COL_LENGTH(N'dbo.TblConversation', N'IsArchived') IS NULL
  ALTER TABLE dbo.TblConversation ADD IsArchived BIT NOT NULL CONSTRAINT DF_TblConversation_Archived DEFAULT(0);
GO
IF COL_LENGTH(N'dbo.TblConversation', N'IsPinned') IS NULL
  ALTER TABLE dbo.TblConversation ADD IsPinned BIT NOT NULL CONSTRAINT DF_TblConversation_Pinned DEFAULT(0);
GO
IF COL_LENGTH(N'dbo.TblMessage', N'IsHistorical') IS NULL
  ALTER TABLE dbo.TblMessage ADD IsHistorical BIT NOT NULL CONSTRAINT DF_TblMessage_Historical DEFAULT(0);
GO
IF COL_LENGTH(N'dbo.TblMessage', N'MediaMimeType') IS NULL
  ALTER TABLE dbo.TblMessage ADD MediaMimeType NVARCHAR(128) NULL;
GO
IF COL_LENGTH(N'dbo.TblMessage', N'MediaFileName') IS NULL
  ALTER TABLE dbo.TblMessage ADD MediaFileName NVARCHAR(256) NULL;
GO
IF COL_LENGTH(N'dbo.TblMessage', N'MediaSizeBytes') IS NULL
  ALTER TABLE dbo.TblMessage ADD MediaSizeBytes BIGINT NULL;
GO
IF COL_LENGTH(N'dbo.TblMessage', N'MediaStorageKey') IS NULL
  ALTER TABLE dbo.TblMessage ADD MediaStorageKey NVARCHAR(128) NULL;
GO
IF COL_LENGTH(N'dbo.TblMessage', N'QuotedProviderMessageID') IS NULL
  ALTER TABLE dbo.TblMessage ADD QuotedProviderMessageID NVARCHAR(256) NULL;
GO
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE parent_object_id=OBJECT_ID(N'dbo.TblMessage')
  AND name=N'CK_TblMessage_ContentType')
  ALTER TABLE dbo.TblMessage DROP CONSTRAINT CK_TblMessage_ContentType;
GO
ALTER TABLE dbo.TblMessage ADD CONSTRAINT CK_TblMessage_ContentType
  CHECK (ContentType IN (N'TEXT', N'UNKNOWN', N'IMAGE', N'AUDIO', N'VIDEO', N'DOCUMENT', N'STICKER'));
GO
IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.TblConversation') AND name=N'IX_TblConversation_Business_Archived')
  CREATE INDEX IX_TblConversation_Business_Archived
  ON dbo.TblConversation(BusinessID,IsArchived,LastMessageAtUtc DESC);
GO
