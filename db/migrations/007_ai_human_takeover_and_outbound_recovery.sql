-- Phase 3B Part 2B: conversation AI state, outbound observation audit,
-- durable generated reply fields, and same-conversation PROCESSING uniqueness.

-- ---------------------------------------------------------------------------
-- TblConversationAiState (no row => AUTO)
-- ---------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.TblConversationAiState', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.TblConversationAiState (
    BusinessID UNIQUEIDENTIFIER NOT NULL,
    ConversationID UNIQUEIDENTIFIER NOT NULL,
    Mode NVARCHAR(32) NOT NULL
      CONSTRAINT DF_TblConversationAiState_Mode DEFAULT (N'AUTO'),
    PausedAtUtc DATETIME2 NULL,
    PauseReason NVARCHAR(64) NULL,
    ResumedAtUtc DATETIME2 NULL,
    LastHumanOutboundProviderMessageID NVARCHAR(256) NULL,
    CreatedAtUtc DATETIME2 NOT NULL
      CONSTRAINT DF_TblConversationAiState_CreatedAtUtc DEFAULT SYSUTCDATETIME(),
    UpdatedAtUtc DATETIME2 NOT NULL
      CONSTRAINT DF_TblConversationAiState_UpdatedAtUtc DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_TblConversationAiState PRIMARY KEY (BusinessID, ConversationID),
    CONSTRAINT CK_TblConversationAiState_Mode CHECK (
      Mode IN (N'AUTO', N'HUMAN_PAUSED', N'SAFETY_PAUSED')
    ),
    CONSTRAINT FK_TblConversationAiState_Business FOREIGN KEY (BusinessID)
      REFERENCES dbo.TblBusiness (BusinessID) ON DELETE NO ACTION,
    CONSTRAINT FK_TblConversationAiState_Conversation FOREIGN KEY (ConversationID)
      REFERENCES dbo.TblConversation (ConversationID) ON DELETE NO ACTION
  );

  CREATE INDEX IX_TblConversationAiState_Mode
    ON dbo.TblConversationAiState (BusinessID, Mode);
END;

-- ---------------------------------------------------------------------------
-- TblWhatsappOutboundObservation (idempotent audit by channel + provider id)
-- ---------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.TblWhatsappOutboundObservation', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.TblWhatsappOutboundObservation (
    OutboundObservationID UNIQUEIDENTIFIER NOT NULL
      CONSTRAINT DF_TblWhatsappOutboundObservation_ID DEFAULT NEWSEQUENTIALID(),
    BusinessID UNIQUEIDENTIFIER NOT NULL,
    ChannelConnectionID UNIQUEIDENTIFIER NOT NULL,
    ConversationID UNIQUEIDENTIFIER NULL,
    ContactID UNIQUEIDENTIFIER NULL,
    ProviderMessageID NVARCHAR(256) NOT NULL,
    Origin NVARCHAR(32) NOT NULL,
    PhoneNormalized NVARCHAR(32) NULL,
    ExternalContactKey NVARCHAR(256) NULL,
    OccurredAtUtc DATETIME2 NULL,
    CreatedAtUtc DATETIME2 NOT NULL
      CONSTRAINT DF_TblWhatsappOutboundObservation_CreatedAtUtc DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_TblWhatsappOutboundObservation PRIMARY KEY (OutboundObservationID),
    CONSTRAINT UQ_TblWhatsappOutboundObservation_Channel_Provider
      UNIQUE (ChannelConnectionID, ProviderMessageID),
    CONSTRAINT CK_TblWhatsappOutboundObservation_Origin CHECK (
      Origin IN (N'DRVOWA_API', N'HUMAN_MANUAL')
    ),
    CONSTRAINT FK_TblWhatsappOutboundObservation_Business FOREIGN KEY (BusinessID)
      REFERENCES dbo.TblBusiness (BusinessID) ON DELETE NO ACTION,
    CONSTRAINT FK_TblWhatsappOutboundObservation_Channel FOREIGN KEY (ChannelConnectionID)
      REFERENCES dbo.TblChannelConnection (ChannelConnectionID) ON DELETE NO ACTION,
    CONSTRAINT FK_TblWhatsappOutboundObservation_Conversation FOREIGN KEY (ConversationID)
      REFERENCES dbo.TblConversation (ConversationID) ON DELETE NO ACTION,
    CONSTRAINT FK_TblWhatsappOutboundObservation_Contact FOREIGN KEY (ContactID)
      REFERENCES dbo.TblContact (ContactID) ON DELETE NO ACTION
  );

  CREATE INDEX IX_TblWhatsappOutboundObservation_Business
    ON dbo.TblWhatsappOutboundObservation (BusinessID, CreatedAtUtc);
END;

-- ---------------------------------------------------------------------------
-- Durable generated reply + outbound provider id on AI jobs
-- ---------------------------------------------------------------------------
IF COL_LENGTH(N'dbo.TblAiReplyJob', N'GeneratedReplyText') IS NULL
BEGIN
  ALTER TABLE dbo.TblAiReplyJob
    ADD GeneratedReplyText NVARCHAR(MAX) NULL;
END;

IF COL_LENGTH(N'dbo.TblAiReplyJob', N'GeneratedModel') IS NULL
BEGIN
  ALTER TABLE dbo.TblAiReplyJob
    ADD GeneratedModel NVARCHAR(128) NULL;
END;

IF COL_LENGTH(N'dbo.TblAiReplyJob', N'GeneratedAtUtc') IS NULL
BEGIN
  ALTER TABLE dbo.TblAiReplyJob
    ADD GeneratedAtUtc DATETIME2 NULL;
END;

IF COL_LENGTH(N'dbo.TblAiReplyJob', N'OutboundProviderMessageID') IS NULL
BEGIN
  ALTER TABLE dbo.TblAiReplyJob
    ADD OutboundProviderMessageID NVARCHAR(256) NULL;
END;

-- ---------------------------------------------------------------------------
-- At most one PROCESSING AI reply job per conversation.
-- Normalize unexpected duplicates before uniqueness is enforced.
-- ---------------------------------------------------------------------------
;WITH DuplicateProcessing AS (
  SELECT
    AiReplyJobID,
    ROW_NUMBER() OVER (
      PARTITION BY BusinessID, ConversationID
      ORDER BY
        CASE WHEN LeaseUntilUtc IS NOT NULL AND LeaseUntilUtc >= SYSUTCDATETIME() THEN 0 ELSE 1 END,
        StartedAtUtc DESC,
        UpdatedAtUtc DESC,
        CreatedAtUtc DESC,
        AiReplyJobID DESC
    ) AS rn
  FROM dbo.TblAiReplyJob
  WHERE Status = N'PROCESSING'
)
UPDATE j
SET
  Status = N'FAILED',
  CompletedAtUtc = SYSUTCDATETIME(),
  LeaseUntilUtc = NULL,
  UpdatedAtUtc = SYSUTCDATETIME(),
  LastErrorCode = N'DEDUP_PROCESSING_UNIQUENESS'
FROM dbo.TblAiReplyJob AS j
INNER JOIN DuplicateProcessing AS d ON d.AiReplyJobID = j.AiReplyJobID
WHERE d.rn > 1
  AND j.Status = N'PROCESSING';

IF NOT EXISTS (
  SELECT 1
  FROM sys.indexes
  WHERE name = N'UQ_TblAiReplyJob_Business_Conversation_Processing'
    AND object_id = OBJECT_ID(N'dbo.TblAiReplyJob')
)
BEGIN
  CREATE UNIQUE INDEX UQ_TblAiReplyJob_Business_Conversation_Processing
    ON dbo.TblAiReplyJob (BusinessID, ConversationID)
    WHERE Status = N'PROCESSING';
END;
