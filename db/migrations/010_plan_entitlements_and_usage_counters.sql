-- Commercial readiness: plan entitlements, usage period counters, durable reservations.
-- Additive / idempotent. Safe for existing FREE subscriptions.
-- Note: GO batches isolate ALTERs so SQL Server can parse new columns.

-- ---------------------------------------------------------------------------
-- TblPlan limit columns (NULL = unlimited)
-- ---------------------------------------------------------------------------
IF COL_LENGTH(N'dbo.TblPlan', N'MaxWhatsAppConnections') IS NULL
BEGIN
  ALTER TABLE dbo.TblPlan ADD MaxWhatsAppConnections INT NULL;
END;
GO

IF COL_LENGTH(N'dbo.TblPlan', N'MaxAgents') IS NULL
BEGIN
  ALTER TABLE dbo.TblPlan ADD MaxAgents INT NULL;
END;
GO

IF COL_LENGTH(N'dbo.TblPlan', N'MaxActiveKnowledgeItems') IS NULL
BEGIN
  ALTER TABLE dbo.TblPlan ADD MaxActiveKnowledgeItems INT NULL;
END;
GO

IF COL_LENGTH(N'dbo.TblPlan', N'MonthlyAiReplies') IS NULL
BEGIN
  ALTER TABLE dbo.TblPlan ADD MonthlyAiReplies INT NULL;
END;
GO

IF COL_LENGTH(N'dbo.TblPlan', N'MonthlyWhatsAppOutbound') IS NULL
BEGIN
  ALTER TABLE dbo.TblPlan ADD MonthlyWhatsAppOutbound INT NULL;
END;
GO

UPDATE dbo.TblPlan
SET MaxWhatsAppConnections = 1,
    MaxAgents = 1,
    MaxActiveKnowledgeItems = 50,
    MonthlyAiReplies = 500,
    MonthlyWhatsAppOutbound = 500,
    UpdatedAtUtc = SYSUTCDATETIME()
WHERE Code = N'FREE'
  AND (
    MaxWhatsAppConnections IS NULL
    OR MaxAgents IS NULL
    OR MaxActiveKnowledgeItems IS NULL
    OR MonthlyAiReplies IS NULL
    OR MonthlyWhatsAppOutbound IS NULL
  );
GO

-- ---------------------------------------------------------------------------
-- Subscription status: add EXPIRED (keep INACTIVE)
-- ---------------------------------------------------------------------------
IF EXISTS (
  SELECT 1 FROM sys.check_constraints
  WHERE name = N'CK_TblSubscription_Status'
    AND parent_object_id = OBJECT_ID(N'dbo.TblSubscription')
)
BEGIN
  ALTER TABLE dbo.TblSubscription DROP CONSTRAINT CK_TblSubscription_Status;
END;
GO

ALTER TABLE dbo.TblSubscription
  ADD CONSTRAINT CK_TblSubscription_Status CHECK (
    Status IN (
      N'TRIALING', N'ACTIVE', N'PAST_DUE', N'CANCELED', N'INACTIVE', N'EXPIRED'
    )
  );
GO

-- Demote older duplicate "current" subscriptions (keep newest). No deletes.
;WITH ranked AS (
  SELECT SubscriptionID,
         ROW_NUMBER() OVER (
           PARTITION BY BusinessID
           ORDER BY CreatedAtUtc DESC, SubscriptionID DESC
         ) AS rn
  FROM dbo.TblSubscription
  WHERE Status IN (N'ACTIVE', N'TRIALING', N'PAST_DUE')
)
UPDATE s
SET Status = N'INACTIVE',
    UpdatedAtUtc = SYSUTCDATETIME()
FROM dbo.TblSubscription AS s
INNER JOIN ranked AS r ON r.SubscriptionID = s.SubscriptionID
WHERE r.rn > 1;
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = N'UQ_TblSubscription_Business_Current'
    AND object_id = OBJECT_ID(N'dbo.TblSubscription')
)
BEGIN
  CREATE UNIQUE INDEX UQ_TblSubscription_Business_Current
    ON dbo.TblSubscription (BusinessID)
    WHERE Status IN (N'ACTIVE', N'TRIALING', N'PAST_DUE');
END;
GO

-- ---------------------------------------------------------------------------
-- Usage period counter (Quantity = RESERVED+CONSUMED+UNCERTAIN commitments)
-- ---------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.TblUsagePeriodCounter', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.TblUsagePeriodCounter (
    BusinessID UNIQUEIDENTIFIER NOT NULL,
    EventType NVARCHAR(64) NOT NULL,
    PeriodStartUtc DATETIME2 NOT NULL,
    Quantity INT NOT NULL
      CONSTRAINT DF_TblUsagePeriodCounter_Quantity DEFAULT (0),
    UpdatedAtUtc DATETIME2 NOT NULL
      CONSTRAINT DF_TblUsagePeriodCounter_UpdatedAtUtc DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_TblUsagePeriodCounter
      PRIMARY KEY (BusinessID, EventType, PeriodStartUtc),
    CONSTRAINT CK_TblUsagePeriodCounter_Quantity CHECK (Quantity >= 0),
    CONSTRAINT FK_TblUsagePeriodCounter_Business FOREIGN KEY (BusinessID)
      REFERENCES dbo.TblBusiness (BusinessID) ON DELETE NO ACTION
  );
END;
GO

-- ---------------------------------------------------------------------------
-- Durable quota reservations
-- ---------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.TblUsageReservation', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.TblUsageReservation (
    UsageReservationID UNIQUEIDENTIFIER NOT NULL
      CONSTRAINT DF_TblUsageReservation_ID DEFAULT NEWSEQUENTIALID(),
    BusinessID UNIQUEIDENTIFIER NOT NULL,
    EventType NVARCHAR(64) NOT NULL,
    ReservationKey NVARCHAR(200) NOT NULL,
    PeriodStartUtc DATETIME2 NOT NULL,
    Quantity INT NOT NULL,
    State NVARCHAR(32) NOT NULL,
    CreatedAtUtc DATETIME2 NOT NULL
      CONSTRAINT DF_TblUsageReservation_CreatedAtUtc DEFAULT SYSUTCDATETIME(),
    UpdatedAtUtc DATETIME2 NOT NULL
      CONSTRAINT DF_TblUsageReservation_UpdatedAtUtc DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_TblUsageReservation PRIMARY KEY (UsageReservationID),
    CONSTRAINT UQ_TblUsageReservation_Biz_Type_Key
      UNIQUE (BusinessID, EventType, ReservationKey),
    CONSTRAINT CK_TblUsageReservation_Quantity CHECK (Quantity > 0),
    CONSTRAINT CK_TblUsageReservation_State CHECK (
      State IN (N'RESERVED', N'CONSUMED', N'RELEASED', N'UNCERTAIN')
    ),
    CONSTRAINT FK_TblUsageReservation_Business FOREIGN KEY (BusinessID)
      REFERENCES dbo.TblBusiness (BusinessID) ON DELETE NO ACTION
  );

  CREATE INDEX IX_TblUsageReservation_Business_Period
    ON dbo.TblUsageReservation (BusinessID, PeriodStartUtc);
END;
GO

-- ---------------------------------------------------------------------------
-- Idempotent audit usage key
-- ---------------------------------------------------------------------------
IF COL_LENGTH(N'dbo.TblUsageEvent', N'UsageKey') IS NULL
BEGIN
  ALTER TABLE dbo.TblUsageEvent ADD UsageKey NVARCHAR(200) NULL;
END;
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = N'UQ_TblUsageEvent_Biz_Type_UsageKey'
    AND object_id = OBJECT_ID(N'dbo.TblUsageEvent')
)
BEGIN
  CREATE UNIQUE INDEX UQ_TblUsageEvent_Biz_Type_UsageKey
    ON dbo.TblUsageEvent (BusinessID, EventType, UsageKey)
    WHERE UsageKey IS NOT NULL;
END;
GO
