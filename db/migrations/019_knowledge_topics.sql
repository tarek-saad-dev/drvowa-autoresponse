-- Topic-aware knowledge grouping and retrieval metadata.
-- Additive and backward-compatible: existing items remain valid with NULL topics.

IF COL_LENGTH(N'dbo.TblKnowledgeItem', N'TopicKey') IS NULL
BEGIN
  ALTER TABLE dbo.TblKnowledgeItem ADD TopicKey NVARCHAR(200) NULL;
END;
GO

IF COL_LENGTH(N'dbo.TblKnowledgeItem', N'TopicTitle') IS NULL
BEGIN
  ALTER TABLE dbo.TblKnowledgeItem ADD TopicTitle NVARCHAR(300) NULL;
END;
GO

IF COL_LENGTH(N'dbo.TblKnowledgeIngestProposal', N'TopicKey') IS NULL
BEGIN
  ALTER TABLE dbo.TblKnowledgeIngestProposal ADD TopicKey NVARCHAR(200) NULL;
END;
GO

IF COL_LENGTH(N'dbo.TblKnowledgeIngestProposal', N'TopicTitle') IS NULL
BEGIN
  ALTER TABLE dbo.TblKnowledgeIngestProposal ADD TopicTitle NVARCHAR(300) NULL;
END;
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = N'IX_TblKnowledgeItem_Business_Topic'
    AND object_id = OBJECT_ID(N'dbo.TblKnowledgeItem')
)
BEGIN
  CREATE INDEX IX_TblKnowledgeItem_Business_Topic
    ON dbo.TblKnowledgeItem (BusinessID, TopicKey, IsActive)
    INCLUDE (Category, Title, TopicTitle, UpdatedAtUtc);
END;
GO
