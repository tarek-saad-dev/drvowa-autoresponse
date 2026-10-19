-- Additive billing document foundation. No rewriting of historical payments.
IF OBJECT_ID(N'dbo.TblBillingInvoice', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.TblBillingInvoice (
    InvoiceID UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_TblBillingInvoice PRIMARY KEY,
    InvoiceNumber BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT UQ_TblBillingInvoice_Number UNIQUE,
    BusinessID UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.TblBusiness(BusinessID),
    PaymentRequestID UNIQUEIDENTIFIER NOT NULL CONSTRAINT UQ_TblBillingInvoice_Payment UNIQUE
      REFERENCES dbo.TblManualPaymentRequest(PaymentRequestID),
    PlanCode NVARCHAR(64) NOT NULL,
    PlanDisplayName NVARCHAR(120) NOT NULL,
    BillingInterval NVARCHAR(16) NOT NULL CONSTRAINT DF_TblBillingInvoice_Interval DEFAULT N'MONTHLY',
    CurrencyCode NVARCHAR(3) NOT NULL,
    SubtotalMinor BIGINT NOT NULL,
    DiscountMinor BIGINT NOT NULL CONSTRAINT DF_TblBillingInvoice_Discount DEFAULT 0,
    DiscountReason NVARCHAR(1000) NULL,
    TotalMinor BIGINT NOT NULL,
    Status NVARCHAR(16) NOT NULL,
    IssuedAtUtc DATETIME2(3) NOT NULL CONSTRAINT DF_TblBillingInvoice_Issued DEFAULT SYSUTCDATETIME(),
    SettledAtUtc DATETIME2(3) NULL,
    CONSTRAINT CK_TblBillingInvoice_Money CHECK (
      SubtotalMinor BETWEEN 0 AND 999999999999 AND DiscountMinor BETWEEN 0 AND SubtotalMinor
      AND TotalMinor = SubtotalMinor - DiscountMinor
      AND (DiscountMinor = 0 OR LEN(LTRIM(RTRIM(DiscountReason))) > 0 AND DiscountReason IS NOT NULL)),
    CONSTRAINT CK_TblBillingInvoice_Interval CHECK (BillingInterval IN (N'MONTHLY', N'ANNUAL')),
    CONSTRAINT CK_TblBillingInvoice_Status CHECK (Status IN (N'OPEN', N'PAID', N'WAIVED', N'VOID')),
    CONSTRAINT CK_TblBillingInvoice_Settlement CHECK (
      (Status = N'PAID' AND TotalMinor > 0 AND SettledAtUtc IS NOT NULL)
      OR (Status = N'WAIVED' AND TotalMinor = 0 AND SettledAtUtc IS NOT NULL)
      OR (Status IN (N'OPEN', N'VOID') AND SettledAtUtc IS NULL))
  );
  CREATE INDEX IX_TblBillingInvoice_Business ON dbo.TblBillingInvoice(BusinessID, IssuedAtUtc DESC);
END;

IF OBJECT_ID(N'dbo.TblBillingReceipt', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.TblBillingReceipt (
    ReceiptID UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_TblBillingReceipt PRIMARY KEY,
    ReceiptNumber BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT UQ_TblBillingReceipt_Number UNIQUE,
    InvoiceID UNIQUEIDENTIFIER NOT NULL CONSTRAINT UQ_TblBillingReceipt_Invoice UNIQUE
      REFERENCES dbo.TblBillingInvoice(InvoiceID),
    AmountMinor BIGINT NOT NULL CONSTRAINT CK_TblBillingReceipt_Amount CHECK (AmountMinor > 0 AND AmountMinor <= 999999999999),
    CurrencyCode NVARCHAR(3) NOT NULL,
    IssuedAtUtc DATETIME2(3) NOT NULL CONSTRAINT DF_TblBillingReceipt_Issued DEFAULT SYSUTCDATETIME()
  );
END;

IF COL_LENGTH(N'dbo.TblManualPaymentRequest', N'BillingInterval') IS NULL
  ALTER TABLE dbo.TblManualPaymentRequest ADD BillingInterval NVARCHAR(16) NOT NULL
    CONSTRAINT DF_ManualPayment_BillingInterval DEFAULT N'MONTHLY'
    CONSTRAINT CK_ManualPayment_BillingInterval CHECK (BillingInterval IN (N'MONTHLY', N'ANNUAL'));
IF COL_LENGTH(N'dbo.TblSubscription', N'BillingInterval') IS NULL
  ALTER TABLE dbo.TblSubscription ADD BillingInterval NVARCHAR(16) NOT NULL
    CONSTRAINT DF_Subscription_BillingInterval DEFAULT N'MONTHLY'
    CONSTRAINT CK_Subscription_BillingInterval CHECK (BillingInterval IN (N'MONTHLY', N'ANNUAL'));

IF OBJECT_ID(N'dbo.TblBillingScheduledChange', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.TblBillingScheduledChange (
    ChangeID UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
    BusinessID UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.TblBusiness(BusinessID),
    SubscriptionID UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.TblSubscription(SubscriptionID),
    PaymentRequestID UNIQUEIDENTIFIER NULL REFERENCES dbo.TblManualPaymentRequest(PaymentRequestID),
    TargetPlanID UNIQUEIDENTIFIER NULL REFERENCES dbo.TblPlan(PlanID),
    BillingInterval NVARCHAR(16) NOT NULL DEFAULT N'MONTHLY',
    Kind NVARCHAR(16) NOT NULL CHECK (Kind IN (N'DOWNGRADE', N'CANCEL')),
    State NVARCHAR(16) NOT NULL CHECK (State IN (N'PENDING', N'APPLIED', N'CANCELED')),
    EffectiveAtUtc DATETIME2(3) NOT NULL,
    Reason NVARCHAR(1000) NOT NULL,
    CreatedAtUtc DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME()
  );
  CREATE UNIQUE INDEX UQ_BillingChange_Pending ON dbo.TblBillingScheduledChange(BusinessID) WHERE State = N'PENDING';
END;

IF OBJECT_ID(N'dbo.CK_TblManualPaymentRequest_Amount', N'C') IS NOT NULL
  ALTER TABLE dbo.TblManualPaymentRequest DROP CONSTRAINT CK_TblManualPaymentRequest_Amount;
ALTER TABLE dbo.TblManualPaymentRequest ADD CONSTRAINT CK_TblManualPaymentRequest_Amount CHECK (Amount >= 0);

IF OBJECT_ID(N'dbo.TblBillingRefund', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.TblBillingRefund (
    RefundID UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
    PaymentRequestID UNIQUEIDENTIFIER NOT NULL UNIQUE REFERENCES dbo.TblManualPaymentRequest(PaymentRequestID),
    InvoiceID UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.TblBillingInvoice(InvoiceID),
    AmountMinor BIGINT NOT NULL CHECK (AmountMinor > 0),
    CurrencyCode NVARCHAR(3) NOT NULL,
    Reason NVARCHAR(1000) NOT NULL,
    State NVARCHAR(16) NOT NULL CHECK (State IN (N'PENDING', N'SUCCEEDED', N'FAILED')),
    TransferReference NVARCHAR(160) NULL,
    RequestedByUserID UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.TblUser(UserID),
    ConfirmedByUserID UNIQUEIDENTIFIER NULL REFERENCES dbo.TblUser(UserID),
    CreatedAtUtc DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
    CompletedAtUtc DATETIME2(3) NULL,
    CONSTRAINT CK_BillingRefund_Completed CHECK (State <> N'SUCCEEDED' OR
      (CompletedAtUtc IS NOT NULL AND ConfirmedByUserID IS NOT NULL AND TransferReference IS NOT NULL))
  );
END;

IF COL_LENGTH(N'dbo.TblBillingInvoice', N'RenewalSubscriptionID') IS NULL
BEGIN
  ALTER TABLE dbo.TblBillingInvoice ADD RenewalSubscriptionID UNIQUEIDENTIFIER NULL,
    ValidUntilUtc DATETIME2(3) NULL, NoticeState NVARCHAR(16) NOT NULL DEFAULT N'NONE';
  EXEC(N'CREATE UNIQUE INDEX UQ_BillingInvoice_Renewal ON dbo.TblBillingInvoice(RenewalSubscriptionID) WHERE RenewalSubscriptionID IS NOT NULL');
END;
