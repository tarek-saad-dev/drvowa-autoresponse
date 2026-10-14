-- Repair the duplicate 022 migration version collision.
-- Historical deployments may have marked 022 applied for ERP pairing before
-- the human escalation tables were introduced. Run both idempotent setups here
-- so either historical 022 state converges on the complete schema.

-- DRVO owner WhatsApp escalation V1.
-- Notification dispatch remains disabled until the owner verifies their phone.
IF OBJECT_ID(N'dbo.TblHumanEscalationSetting', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.TblHumanEscalationSetting (
    BusinessID UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
    OwnerPhone NVARCHAR(20) NULL,
    IsEnabled BIT NOT NULL CONSTRAINT DF_EscalationSetting_Enabled DEFAULT (0),
    PhoneVerifiedAtUtc DATETIME2 NULL,
    VerificationHash NVARCHAR(128) NULL,
    VerificationExpiresAtUtc DATETIME2 NULL,
    VerificationRequestedAtUtc DATETIME2 NULL,
    VerificationAttempts INT NOT NULL CONSTRAINT DF_EscalationSetting_Attempts DEFAULT (0),
    CreatedAtUtc DATETIME2 NOT NULL CONSTRAINT DF_EscalationSetting_Created DEFAULT SYSUTCDATETIME(),
    UpdatedAtUtc DATETIME2 NOT NULL CONSTRAINT DF_EscalationSetting_Updated DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_EscalationSetting_Business FOREIGN KEY (BusinessID)
      REFERENCES dbo.TblBusiness(BusinessID)
  );
END;
GO
IF OBJECT_ID(N'dbo.TblHumanEscalation', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.TblHumanEscalation (
    EscalationID UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_HumanEscalation_ID DEFAULT NEWSEQUENTIALID(),
    BusinessID UNIQUEIDENTIFIER NOT NULL,
    ConversationID UNIQUEIDENTIFIER NOT NULL,
    ChannelConnectionID UNIQUEIDENTIFIER NOT NULL,
    ReasonCode NVARCHAR(48) NOT NULL,
    ReasonText NVARCHAR(300) NOT NULL,
    Status NVARCHAR(20) NOT NULL CONSTRAINT DF_HumanEscalation_Status DEFAULT N'OPEN',
    ResolvedAtUtc DATETIME2 NULL,
    AcknowledgedAtUtc DATETIME2 NULL,
    AcknowledgedByUserID UNIQUEIDENTIFIER NULL,
    NotificationStatus NVARCHAR(20) NOT NULL CONSTRAINT DF_HumanEscalation_Notification DEFAULT N'PENDING',
    NotificationAttempts INT NOT NULL CONSTRAINT DF_HumanEscalation_Attempts DEFAULT (0),
    NotificationNotBeforeUtc DATETIME2 NOT NULL CONSTRAINT DF_HumanEscalation_NotBefore DEFAULT SYSUTCDATETIME(),
    NotificationClaimedAtUtc DATETIME2 NULL,
    NotificationSentAtUtc DATETIME2 NULL,
    NotificationProviderMessageID NVARCHAR(256) NULL,
    NotificationLastErrorCode NVARCHAR(80) NULL,
    CreatedAtUtc DATETIME2 NOT NULL CONSTRAINT DF_HumanEscalation_Created DEFAULT SYSUTCDATETIME(),
    UpdatedAtUtc DATETIME2 NOT NULL CONSTRAINT DF_HumanEscalation_Updated DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_TblHumanEscalation PRIMARY KEY (EscalationID),
    CONSTRAINT FK_HumanEscalation_Business FOREIGN KEY (BusinessID) REFERENCES dbo.TblBusiness(BusinessID),
    CONSTRAINT FK_HumanEscalation_Conversation FOREIGN KEY (ConversationID) REFERENCES dbo.TblConversation(ConversationID),
    CONSTRAINT CK_HumanEscalation_Status CHECK (Status IN (N'OPEN', N'ACKNOWLEDGED', N'RESOLVED')),
    CONSTRAINT CK_HumanEscalation_Notification CHECK (NotificationStatus IN (N'PENDING', N'SENDING', N'SENT', N'UNKNOWN', N'FAILED', N'CANCELLED'))
  );
END;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.TblHumanEscalation') AND name = N'UX_HumanEscalation_Active')
  CREATE UNIQUE INDEX UX_HumanEscalation_Active
  ON dbo.TblHumanEscalation(BusinessID, ConversationID)
  WHERE ResolvedAtUtc IS NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.TblHumanEscalation') AND name = N'IX_HumanEscalation_Queue')
  CREATE INDEX IX_HumanEscalation_Queue
  ON dbo.TblHumanEscalation(NotificationStatus, NotificationNotBeforeUtc, CreatedAtUtc)
  INCLUDE (BusinessID, ConversationID, ChannelConnectionID);
GO
-- The 022 record may alternatively refer to human escalation, leaving ERP
-- pairing unapplied. Its IF OBJECT_ID guard makes replay safe.
-- @include: 022_integration_pairing.sql
