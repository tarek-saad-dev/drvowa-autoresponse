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
-- Include human replies sent from WhatsApp mobile / desktop (not just DRVO).
-- Those replies are recorded as trusted outbound observations, even where the
-- corresponding Whatsapp message has not been mirrored into TblMessage.
UPDATE p
 SET ActionState=N'IN_PROGRESS',
     LastHumanReplyAtUtc=o.LastHumanAtUtc,
     ActionSource=N'HUMAN_WHATSAPP_BACKFILL',
     ActionUpdatedAtUtc=SYSUTCDATETIME()
 FROM dbo.TblPulseSignal p
 CROSS APPLY (
   SELECT MAX(COALESCE(x.OccurredAtUtc,x.CreatedAtUtc)) AS LastHumanAtUtc
   FROM dbo.TblWhatsappOutboundObservation x
   WHERE x.BusinessID=p.BusinessID AND x.ConversationID=p.ConversationID
     AND x.Origin=N'HUMAN_MANUAL'
     AND COALESCE(x.OccurredAtUtc,x.CreatedAtUtc)>p.MessageAtUtc
 ) o
 WHERE p.ActionType IS NOT NULL AND p.ReviewStatus=N'OPEN'
   AND o.LastHumanAtUtc IS NOT NULL
   AND (p.LastHumanReplyAtUtc IS NULL OR o.LastHumanAtUtc>p.LastHumanReplyAtUtc);
GO
-- Correct ONLY demonstrably misleading legacy rule-v1 matches.
-- Educational chargeback/glossary text is not a refund request, and
-- "I do NOT need a manager" must not be classified as a manager request.
UPDATE p SET
 ActionState=N'DISMISSED',ReviewStatus=N'REVIEWED',
 ActionSource=N'RULE_CORRECTION_V2',
 ReviewedAtUtc=SYSUTCDATETIME(),ActionUpdatedAtUtc=SYSUTCDATETIME()
FROM dbo.TblPulseSignal p
JOIN dbo.TblMessage m ON m.MessageID=p.MessageID AND m.BusinessID=p.BusinessID
WHERE p.ReviewStatus=N'OPEN' AND p.ActionType IS NOT NULL AND
 (
  (p.Intent=N'HUMAN' AND
   (m.TextContent LIKE N'%مش محتاج حد من الادار%'
    OR m.TextContent LIKE N'%مش عايز اكلم المدير%'))
  OR
  (p.Intent=N'REFUND' AND
   (m.TextContent LIKE N'%chargeback%' OR m.TextContent LIKE N'%يعني ايه refund%'
    OR m.TextContent LIKE N'%معنى refund%')
   AND m.TextContent NOT LIKE N'%عايز استرداد%'
   AND m.TextContent NOT LIKE N'%عايز استرجاع%'
   AND m.TextContent NOT LIKE N'%فلوسي%'
   AND m.TextContent NOT LIKE N'%refund my%')
 );
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes
 WHERE object_id=OBJECT_ID(N'dbo.TblPulseSignal') AND name=N'IX_PulseSignal_ActionQueue')
 CREATE INDEX IX_PulseSignal_ActionQueue
 ON dbo.TblPulseSignal(BusinessID,ActionState,MessageAtUtc DESC)
 INCLUDE(ConversationID,Intent,Priority,ActionType,ReviewStatus);
GO
