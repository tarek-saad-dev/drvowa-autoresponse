-- Programmed customer hold messages while waiting for a human agent.
-- Step 0 = immediate ack; later steps = delay apologies. Stopped when a human replies or the case resolves.

IF COL_LENGTH(N'dbo.TblHumanEscalation', N'CustomerHoldStep') IS NULL
BEGIN
  ALTER TABLE dbo.TblHumanEscalation ADD
    CustomerHoldStep INT NOT NULL
      CONSTRAINT DF_HumanEscalation_CustomerHoldStep DEFAULT (0),
    CustomerHoldNextAtUtc DATETIME2 NULL,
    CustomerHoldClaimedAtUtc DATETIME2 NULL,
    CustomerHoldLastProviderMessageID NVARCHAR(256) NULL,
    CustomerHoldLastErrorCode NVARCHAR(80) NULL;
END;
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE object_id = OBJECT_ID(N'dbo.TblHumanEscalation')
    AND name = N'IX_HumanEscalation_CustomerHoldQueue'
)
BEGIN
  CREATE INDEX IX_HumanEscalation_CustomerHoldQueue
    ON dbo.TblHumanEscalation(CustomerHoldNextAtUtc, CreatedAtUtc)
    INCLUDE (BusinessID, ConversationID, ChannelConnectionID, CustomerHoldStep, Status)
    WHERE CustomerHoldNextAtUtc IS NOT NULL AND ResolvedAtUtc IS NULL;
END;
GO

-- Backfill open escalations so waiting customers get hold/ack + follow-ups.
UPDATE dbo.TblHumanEscalation
   SET CustomerHoldNextAtUtc = SYSUTCDATETIME(),
       CustomerHoldStep = 0,
       UpdatedAtUtc = SYSUTCDATETIME()
 WHERE ResolvedAtUtc IS NULL
   AND Status IN (N'OPEN', N'ACKNOWLEDGED')
   AND CustomerHoldNextAtUtc IS NULL
   AND CustomerHoldLastProviderMessageID IS NULL;
GO

-- Re-queue owner alerts cancelled only because customer phone was missing (opaque LID),
-- when owner WhatsApp alerts are currently enabled + verified.
UPDATE e
   SET NotificationStatus = N'PENDING',
       NotificationLastErrorCode = NULL,
       NotificationNotBeforeUtc = SYSUTCDATETIME(),
       UpdatedAtUtc = SYSUTCDATETIME()
  FROM dbo.TblHumanEscalation e
 INNER JOIN dbo.TblHumanEscalationSetting s ON s.BusinessID = e.BusinessID
 INNER JOIN dbo.TblConversation c ON c.ConversationID = e.ConversationID
 INNER JOIN dbo.TblContact ct ON ct.ContactID = c.ContactID
 WHERE e.ResolvedAtUtc IS NULL
   AND e.NotificationStatus = N'CANCELLED'
   AND (e.NotificationLastErrorCode = N'NOTIFICATION_NOT_ELIGIBLE' OR e.NotificationLastErrorCode IS NULL)
   AND s.IsEnabled = 1
   AND s.PhoneVerifiedAtUtc IS NOT NULL
   AND s.OwnerPhone IS NOT NULL
   AND (ct.PhoneNormalized IS NULL OR ct.PhoneNormalized <> s.OwnerPhone);
GO
