-- Phase 3B Part 1: channel AI settings + durable AI reply jobs
-- AutoReplyEnabled defaults to 0 (disabled). No retroactive replies.

IF OBJECT_ID(N'dbo.TblChannelAiSetting', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.TblChannelAiSetting (
    ChannelAiSettingID UNIQUEIDENTIFIER NOT NULL
      CONSTRAINT DF_TblChannelAiSetting_ChannelAiSettingID DEFAULT NEWSEQUENTIALID(),
    BusinessID UNIQUEIDENTIFIER NOT NULL,
    ChannelConnectionID UNIQUEIDENTIFIER NOT NULL,
    AgentID UNIQUEIDENTIFIER NOT NULL,
    AutoReplyEnabled BIT NOT NULL
      CONSTRAINT DF_TblChannelAiSetting_AutoReplyEnabled DEFAULT (0),
    EnabledAtUtc DATETIME2 NULL,
    DebounceMs INT NOT NULL
      CONSTRAINT DF_TblChannelAiSetting_DebounceMs DEFAULT (900),
    CreatedAtUtc DATETIME2 NOT NULL
      CONSTRAINT DF_TblChannelAiSetting_CreatedAtUtc DEFAULT SYSUTCDATETIME(),
    UpdatedAtUtc DATETIME2 NOT NULL
      CONSTRAINT DF_TblChannelAiSetting_UpdatedAtUtc DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_TblChannelAiSetting PRIMARY KEY (ChannelAiSettingID),
    CONSTRAINT UQ_TblChannelAiSetting_ChannelConnection UNIQUE (ChannelConnectionID),
    CONSTRAINT CK_TblChannelAiSetting_DebounceMs CHECK (DebounceMs >= 0 AND DebounceMs <= 10000),
    CONSTRAINT FK_TblChannelAiSetting_Business FOREIGN KEY (BusinessID)
      REFERENCES dbo.TblBusiness (BusinessID) ON DELETE NO ACTION,
    CONSTRAINT FK_TblChannelAiSetting_ChannelConnection FOREIGN KEY (ChannelConnectionID)
      REFERENCES dbo.TblChannelConnection (ChannelConnectionID) ON DELETE NO ACTION,
    CONSTRAINT FK_TblChannelAiSetting_Agent FOREIGN KEY (AgentID)
      REFERENCES dbo.TblAgent (AgentID) ON DELETE NO ACTION
  );

  CREATE INDEX IX_TblChannelAiSetting_BusinessID ON dbo.TblChannelAiSetting (BusinessID);
END;

IF OBJECT_ID(N'dbo.TblAiReplyJob', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.TblAiReplyJob (
    AiReplyJobID UNIQUEIDENTIFIER NOT NULL
      CONSTRAINT DF_TblAiReplyJob_AiReplyJobID DEFAULT NEWSEQUENTIALID(),
    BusinessID UNIQUEIDENTIFIER NOT NULL,
    ChannelConnectionID UNIQUEIDENTIFIER NOT NULL,
    ConversationID UNIQUEIDENTIFIER NOT NULL,
    ContactID UNIQUEIDENTIFIER NOT NULL,
    TriggerMessageID UNIQUEIDENTIFIER NOT NULL,
    Status NVARCHAR(32) NOT NULL
      CONSTRAINT DF_TblAiReplyJob_Status DEFAULT (N'PENDING'),
    NotBeforeUtc DATETIME2 NOT NULL
      CONSTRAINT DF_TblAiReplyJob_NotBeforeUtc DEFAULT SYSUTCDATETIME(),
    AttemptCount INT NOT NULL
      CONSTRAINT DF_TblAiReplyJob_AttemptCount DEFAULT (0),
    LeaseUntilUtc DATETIME2 NULL,
    StartedAtUtc DATETIME2 NULL,
    CompletedAtUtc DATETIME2 NULL,
    LastErrorCode NVARCHAR(64) NULL,
    CreatedAtUtc DATETIME2 NOT NULL
      CONSTRAINT DF_TblAiReplyJob_CreatedAtUtc DEFAULT SYSUTCDATETIME(),
    UpdatedAtUtc DATETIME2 NOT NULL
      CONSTRAINT DF_TblAiReplyJob_UpdatedAtUtc DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_TblAiReplyJob PRIMARY KEY (AiReplyJobID),
    CONSTRAINT CK_TblAiReplyJob_Status CHECK (
      Status IN (N'PENDING', N'PROCESSING', N'SENT', N'SKIPPED', N'FAILED', N'COALESCED')
    ),
    CONSTRAINT CK_TblAiReplyJob_AttemptCount CHECK (AttemptCount >= 0),
    CONSTRAINT FK_TblAiReplyJob_Business FOREIGN KEY (BusinessID)
      REFERENCES dbo.TblBusiness (BusinessID) ON DELETE NO ACTION,
    CONSTRAINT FK_TblAiReplyJob_ChannelConnection FOREIGN KEY (ChannelConnectionID)
      REFERENCES dbo.TblChannelConnection (ChannelConnectionID) ON DELETE NO ACTION,
    CONSTRAINT FK_TblAiReplyJob_Conversation FOREIGN KEY (ConversationID)
      REFERENCES dbo.TblConversation (ConversationID) ON DELETE NO ACTION,
    CONSTRAINT FK_TblAiReplyJob_Contact FOREIGN KEY (ContactID)
      REFERENCES dbo.TblContact (ContactID) ON DELETE NO ACTION,
    CONSTRAINT FK_TblAiReplyJob_TriggerMessage FOREIGN KEY (TriggerMessageID)
      REFERENCES dbo.TblMessage (MessageID) ON DELETE NO ACTION
  );

  CREATE INDEX IX_TblAiReplyJob_BusinessID ON dbo.TblAiReplyJob (BusinessID);
  CREATE INDEX IX_TblAiReplyJob_Claim
    ON dbo.TblAiReplyJob (Status, NotBeforeUtc, LeaseUntilUtc);
  CREATE INDEX IX_TblAiReplyJob_Conversation_Status
    ON dbo.TblAiReplyJob (BusinessID, ConversationID, Status);
END;
