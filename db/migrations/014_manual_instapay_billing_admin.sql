-- Manual InstaPay billing + platform admin.
-- Additive / idempotent. Safe to re-run.
-- Updates commercial plan prices/limits to V1 final pricing (EGP monthly).

-- ---------------------------------------------------------------------------
-- Plan pricing columns
-- ---------------------------------------------------------------------------
IF COL_LENGTH(N'dbo.TblPlan', N'MonthlyPriceAmount') IS NULL
BEGIN
  ALTER TABLE dbo.TblPlan ADD MonthlyPriceAmount DECIMAL(12,2) NULL;
END;
GO

IF COL_LENGTH(N'dbo.TblPlan', N'CurrencyCode') IS NULL
BEGIN
  ALTER TABLE dbo.TblPlan ADD CurrencyCode NVARCHAR(3) NULL;
END;
GO

IF COL_LENGTH(N'dbo.TblPlan', N'BillingInterval') IS NULL
BEGIN
  ALTER TABLE dbo.TblPlan ADD BillingInterval NVARCHAR(16) NULL;
END;
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.check_constraints
  WHERE name = N'CK_TblPlan_BillingInterval'
    AND parent_object_id = OBJECT_ID(N'dbo.TblPlan')
)
BEGIN
  ALTER TABLE dbo.TblPlan WITH NOCHECK
    ADD CONSTRAINT CK_TblPlan_BillingInterval CHECK (
      BillingInterval IS NULL OR BillingInterval IN (N'MONTHLY')
    );
END;
GO

-- ---------------------------------------------------------------------------
-- Final V1 plan seed / update (prices + Arabic display + limits)
-- ---------------------------------------------------------------------------
-- FREE
UPDATE dbo.TblPlan
SET DisplayName = N'مجاني',
    Status = N'ACTIVE',
    MaxWhatsAppConnections = 1,
    MaxAgents = 1,
    MaxActiveKnowledgeItems = 50,
    MonthlyAiReplies = 500,
    MonthlyWhatsAppOutbound = 500,
    MonthlyPriceAmount = 0,
    CurrencyCode = N'EGP',
    BillingInterval = N'MONTHLY',
    UpdatedAtUtc = SYSUTCDATETIME()
WHERE Code = N'FREE';
GO

IF NOT EXISTS (SELECT 1 FROM dbo.TblPlan WHERE Code = N'STARTER')
BEGIN
  INSERT INTO dbo.TblPlan (
    Code, DisplayName, Status,
    MaxWhatsAppConnections, MaxAgents, MaxActiveKnowledgeItems,
    MonthlyAiReplies, MonthlyWhatsAppOutbound,
    MonthlyPriceAmount, CurrencyCode, BillingInterval,
    CreatedAtUtc, UpdatedAtUtc
  )
  VALUES (
    N'STARTER', N'بداية', N'ACTIVE',
    1, 2, 200,
    3000, 3000,
    499, N'EGP', N'MONTHLY',
    SYSUTCDATETIME(), SYSUTCDATETIME()
  );
END
ELSE
BEGIN
  UPDATE dbo.TblPlan
  SET DisplayName = N'بداية',
      Status = N'ACTIVE',
      MaxWhatsAppConnections = 1,
      MaxAgents = 2,
      MaxActiveKnowledgeItems = 200,
      MonthlyAiReplies = 3000,
      MonthlyWhatsAppOutbound = 3000,
      MonthlyPriceAmount = 499,
      CurrencyCode = N'EGP',
      BillingInterval = N'MONTHLY',
      UpdatedAtUtc = SYSUTCDATETIME()
  WHERE Code = N'STARTER';
END;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.TblPlan WHERE Code = N'PRO')
BEGIN
  INSERT INTO dbo.TblPlan (
    Code, DisplayName, Status,
    MaxWhatsAppConnections, MaxAgents, MaxActiveKnowledgeItems,
    MonthlyAiReplies, MonthlyWhatsAppOutbound,
    MonthlyPriceAmount, CurrencyCode, BillingInterval,
    CreatedAtUtc, UpdatedAtUtc
  )
  VALUES (
    N'PRO', N'احترافي', N'ACTIVE',
    2, 5, 500,
    10000, 10000,
    999, N'EGP', N'MONTHLY',
    SYSUTCDATETIME(), SYSUTCDATETIME()
  );
END
ELSE
BEGIN
  UPDATE dbo.TblPlan
  SET DisplayName = N'احترافي',
      Status = N'ACTIVE',
      MaxWhatsAppConnections = 2,
      MaxAgents = 5,
      MaxActiveKnowledgeItems = 500,
      MonthlyAiReplies = 10000,
      MonthlyWhatsAppOutbound = 10000,
      MonthlyPriceAmount = 999,
      CurrencyCode = N'EGP',
      BillingInterval = N'MONTHLY',
      UpdatedAtUtc = SYSUTCDATETIME()
  WHERE Code = N'PRO';
END;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.TblPlan WHERE Code = N'BUSINESS')
BEGIN
  INSERT INTO dbo.TblPlan (
    Code, DisplayName, Status,
    MaxWhatsAppConnections, MaxAgents, MaxActiveKnowledgeItems,
    MonthlyAiReplies, MonthlyWhatsAppOutbound,
    MonthlyPriceAmount, CurrencyCode, BillingInterval,
    CreatedAtUtc, UpdatedAtUtc
  )
  VALUES (
    N'BUSINESS', N'أعمال', N'ACTIVE',
    5, 15, 2000,
    30000, 30000,
    1999, N'EGP', N'MONTHLY',
    SYSUTCDATETIME(), SYSUTCDATETIME()
  );
END
ELSE
BEGIN
  UPDATE dbo.TblPlan
  SET DisplayName = N'أعمال',
      Status = N'ACTIVE',
      MaxWhatsAppConnections = 5,
      MaxAgents = 15,
      MaxActiveKnowledgeItems = 2000,
      MonthlyAiReplies = 30000,
      MonthlyWhatsAppOutbound = 30000,
      MonthlyPriceAmount = 1999,
      CurrencyCode = N'EGP',
      BillingInterval = N'MONTHLY',
      UpdatedAtUtc = SYSUTCDATETIME()
  WHERE Code = N'BUSINESS';
END;
GO

-- ---------------------------------------------------------------------------
-- Platform admin (separate from BusinessMember)
-- ---------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.TblPlatformAdmin', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.TblPlatformAdmin (
    PlatformAdminID UNIQUEIDENTIFIER NOT NULL
      CONSTRAINT DF_TblPlatformAdmin_ID DEFAULT NEWSEQUENTIALID(),
    UserID UNIQUEIDENTIFIER NOT NULL,
    Role NVARCHAR(32) NOT NULL,
    IsActive BIT NOT NULL
      CONSTRAINT DF_TblPlatformAdmin_IsActive DEFAULT 1,
    CreatedAtUtc DATETIME2 NOT NULL
      CONSTRAINT DF_TblPlatformAdmin_CreatedAtUtc DEFAULT SYSUTCDATETIME(),
    UpdatedAtUtc DATETIME2 NOT NULL
      CONSTRAINT DF_TblPlatformAdmin_UpdatedAtUtc DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_TblPlatformAdmin PRIMARY KEY (PlatformAdminID),
    CONSTRAINT UQ_TblPlatformAdmin_UserID UNIQUE (UserID),
    CONSTRAINT FK_TblPlatformAdmin_User
      FOREIGN KEY (UserID) REFERENCES dbo.TblUser (UserID),
    CONSTRAINT CK_TblPlatformAdmin_Role CHECK (
      Role IN (N'SUPER_ADMIN', N'BILLING_ADMIN')
    )
  );

  CREATE INDEX IX_TblPlatformAdmin_Active
    ON dbo.TblPlatformAdmin (IsActive, Role);
END;
GO

-- ---------------------------------------------------------------------------
-- Manual payment requests (InstaPay)
-- ---------------------------------------------------------------------------
IF OBJECT_ID(N'dbo.TblManualPaymentRequest', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.TblManualPaymentRequest (
    PaymentRequestID UNIQUEIDENTIFIER NOT NULL
      CONSTRAINT DF_TblManualPaymentRequest_ID DEFAULT NEWSEQUENTIALID(),
    BusinessID UNIQUEIDENTIFIER NOT NULL,
    RequestedPlanID UNIQUEIDENTIFIER NOT NULL,
    PaymentMethod NVARCHAR(32) NOT NULL,
    CurrencyCode NVARCHAR(3) NOT NULL,
    Amount DECIMAL(12,2) NOT NULL,
    PaymentReference NVARCHAR(64) NOT NULL,
    PayerName NVARCHAR(160) NULL,
    TransferReference NVARCHAR(160) NULL,
    CustomerNote NVARCHAR(1000) NULL,
    Status NVARCHAR(32) NOT NULL,
    SubmittedByUserID UNIQUEIDENTIFIER NOT NULL,
    SubmittedAtUtc DATETIME2 NOT NULL,
    ReviewedByUserID UNIQUEIDENTIFIER NULL,
    ReviewedAtUtc DATETIME2 NULL,
    ReviewNote NVARCHAR(1000) NULL,
    ApprovedSubscriptionID UNIQUEIDENTIFIER NULL,
    CreatedAtUtc DATETIME2 NOT NULL
      CONSTRAINT DF_TblManualPaymentRequest_CreatedAtUtc DEFAULT SYSUTCDATETIME(),
    UpdatedAtUtc DATETIME2 NOT NULL
      CONSTRAINT DF_TblManualPaymentRequest_UpdatedAtUtc DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_TblManualPaymentRequest PRIMARY KEY (PaymentRequestID),
    CONSTRAINT UQ_TblManualPaymentRequest_PaymentReference UNIQUE (PaymentReference),
    CONSTRAINT FK_TblManualPaymentRequest_Business
      FOREIGN KEY (BusinessID) REFERENCES dbo.TblBusiness (BusinessID),
    CONSTRAINT FK_TblManualPaymentRequest_Plan
      FOREIGN KEY (RequestedPlanID) REFERENCES dbo.TblPlan (PlanID),
    CONSTRAINT FK_TblManualPaymentRequest_SubmittedBy
      FOREIGN KEY (SubmittedByUserID) REFERENCES dbo.TblUser (UserID),
    CONSTRAINT FK_TblManualPaymentRequest_ReviewedBy
      FOREIGN KEY (ReviewedByUserID) REFERENCES dbo.TblUser (UserID),
    CONSTRAINT FK_TblManualPaymentRequest_ApprovedSubscription
      FOREIGN KEY (ApprovedSubscriptionID) REFERENCES dbo.TblSubscription (SubscriptionID),
    CONSTRAINT CK_TblManualPaymentRequest_PaymentMethod CHECK (
      PaymentMethod IN (N'INSTAPAY')
    ),
    CONSTRAINT CK_TblManualPaymentRequest_Status CHECK (
      Status IN (N'PENDING', N'APPROVED', N'REJECTED', N'CANCELED')
    ),
    CONSTRAINT CK_TblManualPaymentRequest_Amount CHECK (Amount > 0)
  );

  CREATE INDEX IX_TblManualPaymentRequest_Business_Status
    ON dbo.TblManualPaymentRequest (BusinessID, Status, SubmittedAtUtc DESC);

  CREATE INDEX IX_TblManualPaymentRequest_Status_Submitted
    ON dbo.TblManualPaymentRequest (Status, SubmittedAtUtc DESC);
END;
GO

-- At most one PENDING request per business
IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = N'UQ_TblManualPaymentRequest_Business_Pending'
    AND object_id = OBJECT_ID(N'dbo.TblManualPaymentRequest')
)
BEGIN
  CREATE UNIQUE INDEX UQ_TblManualPaymentRequest_Business_Pending
    ON dbo.TblManualPaymentRequest (BusinessID)
    WHERE Status = N'PENDING';
END;
GO
