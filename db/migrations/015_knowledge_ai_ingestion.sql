-- Knowledge AI ingestion sessions + proposals (additive / idempotent).

IF OBJECT_ID(N'dbo.TblKnowledgeIngestSession', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.TblKnowledgeIngestSession (
    KnowledgeIngestSessionID UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_TblKnowledgeIngestSession PRIMARY KEY,
    BusinessID UNIQUEIDENTIFIER NOT NULL,
    CreatedByUserID UNIQUEIDENTIFIER NOT NULL,
    Status NVARCHAR(32) NOT NULL,
    RawInput NVARCHAR(MAX) NULL,
    ConversationJson NVARCHAR(MAX) NULL,
    InputHash NVARCHAR(64) NULL,
    InputLength INT NOT NULL CONSTRAINT DF_TblKnowledgeIngestSession_InputLength DEFAULT (0),
    Model NVARCHAR(128) NULL,
    SummaryJson NVARCHAR(MAX) NULL,
    ErrorCode NVARCHAR(64) NULL,
    AnalysisVersion BIGINT NOT NULL CONSTRAINT DF_TblKnowledgeIngestSession_AnalysisVersion DEFAULT (0),
    CreatedAtUtc DATETIME2 NOT NULL,
    UpdatedAtUtc DATETIME2 NOT NULL,
    AppliedAtUtc DATETIME2 NULL,
    CONSTRAINT FK_TblKnowledgeIngestSession_Business
      FOREIGN KEY (BusinessID) REFERENCES dbo.TblBusiness(BusinessID),
    CONSTRAINT FK_TblKnowledgeIngestSession_User
      FOREIGN KEY (CreatedByUserID) REFERENCES dbo.TblUser(UserID),
    CONSTRAINT CK_TblKnowledgeIngestSession_Status CHECK (
      Status IN (N'DRAFT', N'ANALYZING', N'REVIEW', N'APPLIED', N'FAILED', N'CANCELED')
    )
  );
END;
GO

IF COL_LENGTH(N'dbo.TblKnowledgeIngestSession', N'AnalysisVersion') IS NULL
BEGIN
  ALTER TABLE dbo.TblKnowledgeIngestSession
    ADD AnalysisVersion BIGINT NOT NULL
      CONSTRAINT DF_TblKnowledgeIngestSession_AnalysisVersion DEFAULT (0);
END;
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = N'IX_TblKnowledgeIngestSession_Business_Updated'
    AND object_id = OBJECT_ID(N'dbo.TblKnowledgeIngestSession')
)
BEGIN
  CREATE INDEX IX_TblKnowledgeIngestSession_Business_Updated
    ON dbo.TblKnowledgeIngestSession (BusinessID, UpdatedAtUtc DESC);
END;
GO

IF OBJECT_ID(N'dbo.TblKnowledgeIngestProposal', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.TblKnowledgeIngestProposal (
    KnowledgeIngestProposalID UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_TblKnowledgeIngestProposal PRIMARY KEY,
    SessionID UNIQUEIDENTIFIER NOT NULL,
    Sequence INT NOT NULL,
    Action NVARCHAR(16) NOT NULL,
    Category NVARCHAR(32) NOT NULL,
    ProposedTitle NVARCHAR(300) NOT NULL,
    ProposedContent NVARCHAR(MAX) NOT NULL,
    ExistingKnowledgeItemID UNIQUEIDENTIFIER NULL,
    ExistingTitle NVARCHAR(300) NULL,
    ExistingContent NVARCHAR(MAX) NULL,
    ExistingUpdatedAtUtc DATETIME2 NULL,
    Confidence FLOAT NULL,
    Resolution NVARCHAR(32) NULL,
    Selected BIT NOT NULL CONSTRAINT DF_TblKnowledgeIngestProposal_Selected DEFAULT (0),
    Status NVARCHAR(32) NOT NULL,
    SubjectKey NVARCHAR(200) NULL,
    CreatedAtUtc DATETIME2 NOT NULL,
    UpdatedAtUtc DATETIME2 NOT NULL,
    CONSTRAINT FK_TblKnowledgeIngestProposal_Session
      FOREIGN KEY (SessionID) REFERENCES dbo.TblKnowledgeIngestSession(KnowledgeIngestSessionID),
    CONSTRAINT CK_TblKnowledgeIngestProposal_Action CHECK (
      Action IN (N'CREATE', N'MERGE', N'NOOP', N'CONFLICT')
    ),
    CONSTRAINT CK_TblKnowledgeIngestProposal_Category CHECK (
      Category IN (N'ABOUT', N'FAQ', N'SERVICE', N'POLICY', N'LOCATION_INFO', N'CUSTOM')
    ),
    CONSTRAINT CK_TblKnowledgeIngestProposal_Resolution CHECK (
      Resolution IS NULL
      OR Resolution IN (N'USE_NEW', N'KEEP_EXISTING', N'MANUAL')
    ),
    CONSTRAINT CK_TblKnowledgeIngestProposal_Status CHECK (
      Status IN (N'PENDING', N'RESOLVED', N'APPLIED', N'SKIPPED', N'STALE')
    )
  );
END;
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = N'IX_TblKnowledgeIngestProposal_Session_Seq'
    AND object_id = OBJECT_ID(N'dbo.TblKnowledgeIngestProposal')
)
BEGIN
  CREATE UNIQUE INDEX IX_TblKnowledgeIngestProposal_Session_Seq
    ON dbo.TblKnowledgeIngestProposal (SessionID, Sequence);
END;
GO
