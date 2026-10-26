-- Smart Follow-up V1. Keep escalation status separate from responsibility / AI mode.
-- Idempotent for existing active cases and safe for repeated migration rehearsal.
IF COL_LENGTH(N'dbo.TblHumanEscalation', N'FollowUpPhase') IS NULL
  ALTER TABLE dbo.TblHumanEscalation ADD
    FollowUpPhase NVARCHAR(32) NOT NULL
      CONSTRAINT DF_HumanEscalation_FollowUpPhase DEFAULT (N'NEEDS_ATTENTION');
GO
IF COL_LENGTH(N'dbo.TblHumanEscalation', N'LastHumanReplyAtUtc') IS NULL
  ALTER TABLE dbo.TblHumanEscalation ADD LastHumanReplyAtUtc DATETIME2 NULL;
GO
IF COL_LENGTH(N'dbo.TblHumanEscalation', N'LastCustomerReplyAtUtc') IS NULL
  ALTER TABLE dbo.TblHumanEscalation ADD LastCustomerReplyAtUtc DATETIME2 NULL;
GO
IF COL_LENGTH(N'dbo.TblHumanEscalation', N'ResolutionSource') IS NULL
  ALTER TABLE dbo.TblHumanEscalation ADD ResolutionSource NVARCHAR(32) NULL;
GO
IF COL_LENGTH(N'dbo.TblHumanEscalation', N'ResolutionEvidenceMessageID') IS NULL
  ALTER TABLE dbo.TblHumanEscalation ADD ResolutionEvidenceMessageID UNIQUEIDENTIFIER NULL;
GO
IF OBJECT_ID(N'dbo.TblFollowUpEvent', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.TblFollowUpEvent (
    EventID UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_FollowUpEvent_ID DEFAULT NEWSEQUENTIALID(),
    BusinessID UNIQUEIDENTIFIER NOT NULL,
    EscalationID UNIQUEIDENTIFIER NOT NULL,
    ConversationID UNIQUEIDENTIFIER NOT NULL,
    EventKey NVARCHAR(160) NOT NULL,
    EventType NVARCHAR(40) NOT NULL,
    EventAtUtc DATETIME2 NOT NULL,
    CreatedAtUtc DATETIME2 NOT NULL CONSTRAINT DF_FollowUpEvent_Created DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_TblFollowUpEvent PRIMARY KEY (EventID)
  );
END;
GO
IF NOT EXISTS (
 SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.TblFollowUpEvent') AND name=N'UX_FollowUpEvent_Idempotent'
)
 CREATE UNIQUE INDEX UX_FollowUpEvent_Idempotent ON dbo.TblFollowUpEvent(EscalationID,EventKey);
GO
-- Stop legacy scheduled delay-apology loops on already-open customer cases.
-- A future customer message never re-arms this queue.
UPDATE dbo.TblHumanEscalation
SET CustomerHoldNextAtUtc = NULL,
    CustomerHoldClaimedAtUtc = NULL,
    CustomerHoldLastErrorCode = N'FOLLOWUP_POLICY_MIGRATED',
    UpdatedAtUtc = SYSUTCDATETIME()
WHERE ResolvedAtUtc IS NULL AND CustomerHoldStep > 0 AND CustomerHoldNextAtUtc IS NOT NULL;
GO
