-- Separate "reviewed/acknowledged" from actual customer resolution.
-- Pulse reviews become handled on a verified HUMAN outbound; not on page views or AI replies.
IF COL_LENGTH(N'dbo.TblPulseSignal', N'ActionState') IS NULL
 ALTER TABLE dbo.TblPulseSignal ADD ActionState NVARCHAR(24) NOT NULL
 CONSTRAINT DF_PulseSignal_ActionState DEFAULT (N'NEEDS_REPLY');
GO
IF COL_LENGTH(N'dbo.TblPulseSignal', N'LastHumanReplyAtUtc') IS NULL
 ALTER TABLE dbo.TblPulseSignal ADD LastHumanReplyAtUtc DATETIME2 NULL;
GO
IF COL_LENGTH(N'dbo.TblPulseSignal', N'LastCustomerFollowupAtUtc') IS NULL
 ALTER TABLE dbo.TblPulseSignal ADD LastCustomerFollowupAtUtc DATETIME2 NULL;
GO
IF COL_LENGTH(N'dbo.TblPulseSignal', N'ActionUpdatedAtUtc') IS NULL
 ALTER TABLE dbo.TblPulseSignal ADD ActionUpdatedAtUtc DATETIME2 NULL;
GO
IF COL_LENGTH(N'dbo.TblPulseSignal', N'ActionSource') IS NULL
 ALTER TABLE dbo.TblPulseSignal ADD ActionSource NVARCHAR(40) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints
 WHERE parent_object_id=OBJECT_ID(N'dbo.TblPulseSignal')
 AND name=N'CK_PulseSignal_ActionState')
 ALTER TABLE dbo.TblPulseSignal WITH CHECK ADD CONSTRAINT CK_PulseSignal_ActionState
 CHECK (ActionState IN (N'NEEDS_REPLY',N'IN_PROGRESS',N'DISMISSED'));
GO
-- Previously dismissed signals must not reappear.
UPDATE dbo.TblPulseSignal SET ActionState=N'DISMISSED',
 ActionSource=N'MANUAL_REVIEW',ActionUpdatedAtUtc=COALESCE(ReviewedAtUtc,SYSUTCDATETIME())
WHERE ReviewStatus=N'REVIEWED' AND ActionState=N'NEEDS_REPLY';
GO
-- Repair existing Pulse cards for owners who have already replied to customers.
-- Human replies are not proof of resolution; keep these as IN_PROGRESS.
UPDATE p
 SET ActionState=N'IN_PROGRESS',
     LastHumanReplyAtUtc=h.LastHumanAtUtc,
     ActionSource=N'HUMAN_REPLY_BACKFILL',
     ActionUpdatedAtUtc=SYSUTCDATETIME()
 FROM dbo.TblPulseSignal p
 CROSS APPLY (
   SELECT MAX(COALESCE(m.ProviderTimestampUtc,m.ReceivedAtUtc)) AS LastHumanAtUtc
   FROM dbo.TblMessage m
   WHERE m.BusinessID=p.BusinessID AND m.ConversationID=p.ConversationID
     AND m.Direction=N'OUTBOUND' AND m.Origin=N'HUMAN'
     AND COALESCE(m.ProviderTimestampUtc,m.ReceivedAtUtc)>p.MessageAtUtc
 ) h
 WHERE p.ActionType IS NOT NULL AND p.ReviewStatus=N'OPEN'
   AND p.ActionState=N'NEEDS_REPLY' AND h.LastHumanAtUtc IS NOT NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes
 WHERE object_id=OBJECT_ID(N'dbo.TblPulseSignal') AND name=N'IX_PulseSignal_ActionQueue')
 CREATE INDEX IX_PulseSignal_ActionQueue
 ON dbo.TblPulseSignal(BusinessID,ActionState,MessageAtUtc DESC)
 INCLUDE(ConversationID,Intent,Priority,ActionType,ReviewStatus);
GO
