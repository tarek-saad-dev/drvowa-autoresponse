-- Phase 3B Part 1.3: durable per-conversation AI loop guard.
-- Does not disable the Business or Channel globally.

IF OBJECT_ID(N'dbo.TblAiConversationGuard', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.TblAiConversationGuard (
    BusinessID UNIQUEIDENTIFIER NOT NULL,
    ConversationID UNIQUEIDENTIFIER NOT NULL,
    PausedUntilUtc DATETIME2 NULL,
    PauseReason NVARCHAR(64) NULL,
    TriggeredAtUtc DATETIME2 NULL,
    CreatedAtUtc DATETIME2 NOT NULL
      CONSTRAINT DF_TblAiConversationGuard_CreatedAtUtc DEFAULT SYSUTCDATETIME(),
    UpdatedAtUtc DATETIME2 NOT NULL
      CONSTRAINT DF_TblAiConversationGuard_UpdatedAtUtc DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_TblAiConversationGuard PRIMARY KEY (BusinessID, ConversationID),
    CONSTRAINT FK_TblAiConversationGuard_Business FOREIGN KEY (BusinessID)
      REFERENCES dbo.TblBusiness (BusinessID) ON DELETE NO ACTION,
    CONSTRAINT FK_TblAiConversationGuard_Conversation FOREIGN KEY (ConversationID)
      REFERENCES dbo.TblConversation (ConversationID) ON DELETE NO ACTION
  );

  CREATE INDEX IX_TblAiConversationGuard_PausedUntilUtc
    ON dbo.TblAiConversationGuard (PausedUntilUtc)
    WHERE PausedUntilUtc IS NOT NULL;
END;
