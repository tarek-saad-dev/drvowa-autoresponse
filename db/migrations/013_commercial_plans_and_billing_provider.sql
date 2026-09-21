-- Commercial plans (technical limits only; NO prices) + billing provider columns.
-- Additive / idempotent. Safe to re-run. FREE plan left unchanged.
-- GO batches isolate ALTERs so SQL Server can parse new columns.

-- ---------------------------------------------------------------------------
-- Seed STARTER / PRO / BUSINESS if missing (limits only; no price columns)
-- ---------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM dbo.TblPlan WHERE Code = N'STARTER')
BEGIN
  INSERT INTO dbo.TblPlan (
    Code, DisplayName, Status,
    MaxWhatsAppConnections, MaxAgents, MaxActiveKnowledgeItems,
    MonthlyAiReplies, MonthlyWhatsAppOutbound,
    CreatedAtUtc, UpdatedAtUtc
  )
  VALUES (
    N'STARTER', N'Starter', N'ACTIVE',
    1, 2, 100,
    2000, 2000,
    SYSUTCDATETIME(), SYSUTCDATETIME()
  );
END;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.TblPlan WHERE Code = N'PRO')
BEGIN
  INSERT INTO dbo.TblPlan (
    Code, DisplayName, Status,
    MaxWhatsAppConnections, MaxAgents, MaxActiveKnowledgeItems,
    MonthlyAiReplies, MonthlyWhatsAppOutbound,
    CreatedAtUtc, UpdatedAtUtc
  )
  VALUES (
    N'PRO', N'Pro', N'ACTIVE',
    3, 5, 500,
    10000, 10000,
    SYSUTCDATETIME(), SYSUTCDATETIME()
  );
END;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.TblPlan WHERE Code = N'BUSINESS')
BEGIN
  INSERT INTO dbo.TblPlan (
    Code, DisplayName, Status,
    MaxWhatsAppConnections, MaxAgents, MaxActiveKnowledgeItems,
    MonthlyAiReplies, MonthlyWhatsAppOutbound,
    CreatedAtUtc, UpdatedAtUtc
  )
  VALUES (
    N'BUSINESS', N'Business', N'ACTIVE',
    10, 20, 2000,
    NULL, NULL,
    SYSUTCDATETIME(), SYSUTCDATETIME()
  );
END;
GO

-- Ensure ACTIVE status + technical limits if rows already existed without limits
UPDATE dbo.TblPlan
SET Status = N'ACTIVE',
    MaxWhatsAppConnections = COALESCE(MaxWhatsAppConnections, 1),
    MaxAgents = COALESCE(MaxAgents, 2),
    MaxActiveKnowledgeItems = COALESCE(MaxActiveKnowledgeItems, 100),
    MonthlyAiReplies = COALESCE(MonthlyAiReplies, 2000),
    MonthlyWhatsAppOutbound = COALESCE(MonthlyWhatsAppOutbound, 2000),
    UpdatedAtUtc = SYSUTCDATETIME()
WHERE Code = N'STARTER'
  AND (
    Status <> N'ACTIVE'
    OR MaxWhatsAppConnections IS NULL
    OR MaxAgents IS NULL
    OR MaxActiveKnowledgeItems IS NULL
    OR MonthlyAiReplies IS NULL
    OR MonthlyWhatsAppOutbound IS NULL
  );
GO

UPDATE dbo.TblPlan
SET Status = N'ACTIVE',
    MaxWhatsAppConnections = COALESCE(MaxWhatsAppConnections, 3),
    MaxAgents = COALESCE(MaxAgents, 5),
    MaxActiveKnowledgeItems = COALESCE(MaxActiveKnowledgeItems, 500),
    MonthlyAiReplies = COALESCE(MonthlyAiReplies, 10000),
    MonthlyWhatsAppOutbound = COALESCE(MonthlyWhatsAppOutbound, 10000),
    UpdatedAtUtc = SYSUTCDATETIME()
WHERE Code = N'PRO'
  AND (
    Status <> N'ACTIVE'
    OR MaxWhatsAppConnections IS NULL
    OR MaxAgents IS NULL
    OR MaxActiveKnowledgeItems IS NULL
    OR MonthlyAiReplies IS NULL
    OR MonthlyWhatsAppOutbound IS NULL
  );
GO

UPDATE dbo.TblPlan
SET Status = N'ACTIVE',
    MaxWhatsAppConnections = COALESCE(MaxWhatsAppConnections, 10),
    MaxAgents = COALESCE(MaxAgents, 20),
    MaxActiveKnowledgeItems = COALESCE(MaxActiveKnowledgeItems, 2000),
    UpdatedAtUtc = SYSUTCDATETIME()
WHERE Code = N'BUSINESS'
  AND (
    Status <> N'ACTIVE'
    OR MaxWhatsAppConnections IS NULL
    OR MaxAgents IS NULL
    OR MaxActiveKnowledgeItems IS NULL
  );
GO

-- ---------------------------------------------------------------------------
-- TblSubscription billing provider columns (nullable; provider-agnostic)
-- ---------------------------------------------------------------------------
IF COL_LENGTH(N'dbo.TblSubscription', N'ProviderName') IS NULL
BEGIN
  ALTER TABLE dbo.TblSubscription ADD ProviderName NVARCHAR(64) NULL;
END;
GO

IF COL_LENGTH(N'dbo.TblSubscription', N'ExternalCustomerId') IS NULL
BEGIN
  ALTER TABLE dbo.TblSubscription ADD ExternalCustomerId NVARCHAR(200) NULL;
END;
GO

IF COL_LENGTH(N'dbo.TblSubscription', N'ExternalSubscriptionId') IS NULL
BEGIN
  ALTER TABLE dbo.TblSubscription ADD ExternalSubscriptionId NVARCHAR(200) NULL;
END;
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = N'UQ_TblSubscription_ExternalSubscriptionId'
    AND object_id = OBJECT_ID(N'dbo.TblSubscription')
)
BEGIN
  CREATE UNIQUE INDEX UQ_TblSubscription_ExternalSubscriptionId
    ON dbo.TblSubscription (ExternalSubscriptionId)
    WHERE ExternalSubscriptionId IS NOT NULL;
END;
GO

-- ---------------------------------------------------------------------------
-- Billing webhook idempotency / audit ledger
-- ---------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.TblBillingWebhookEvent', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.TblBillingWebhookEvent (
    BillingWebhookEventID UNIQUEIDENTIFIER NOT NULL
      CONSTRAINT DF_TblBillingWebhookEvent_ID DEFAULT NEWSEQUENTIALID(),
    ProviderName NVARCHAR(64) NOT NULL,
    ProviderEventId NVARCHAR(200) NOT NULL,
    EventType NVARCHAR(128) NOT NULL,
    PayloadDigest NVARCHAR(128) NOT NULL,
    ProcessedAtUtc DATETIME2 NULL,
    CreatedAtUtc DATETIME2 NOT NULL
      CONSTRAINT DF_TblBillingWebhookEvent_CreatedAtUtc DEFAULT SYSUTCDATETIME(),
    Outcome NVARCHAR(32) NOT NULL,
    ErrorSummary NVARCHAR(500) NULL,
    CONSTRAINT PK_TblBillingWebhookEvent PRIMARY KEY (BillingWebhookEventID),
    CONSTRAINT UQ_TblBillingWebhookEvent_Provider_Event
      UNIQUE (ProviderName, ProviderEventId),
    CONSTRAINT CK_TblBillingWebhookEvent_Outcome CHECK (
      Outcome IN (N'APPLIED', N'DUPLICATE', N'IGNORED', N'FAILED')
    )
  );

  CREATE INDEX IX_TblBillingWebhookEvent_CreatedAtUtc
    ON dbo.TblBillingWebhookEvent (CreatedAtUtc);
END;
GO
