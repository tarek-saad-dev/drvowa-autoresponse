-- Coupon catalog and immutable payment snapshot. Codes are only redeemed by paid
-- subscription payment intents; canceled/rejected intents release reservations.
IF OBJECT_ID(N'dbo.TblPricingDiscountCode',N'U') IS NULL
BEGIN
 CREATE TABLE dbo.TblPricingDiscountCode (
  Code NVARCHAR(32) NOT NULL PRIMARY KEY,
  Kind NVARCHAR(10) NOT NULL CHECK (Kind IN (N'PERCENT',N'FIXED')),
  Value DECIMAL(12,2) NOT NULL CHECK (Value > 0),
  MaxRedemptions INT NULL CHECK (MaxRedemptions IS NULL OR MaxRedemptions>0),
  StartsAtUtc DATETIME2(3) NULL,
  ExpiresAtUtc DATETIME2(3) NULL,
  PlanCode NVARCHAR(32) NULL CHECK (PlanCode IS NULL OR PlanCode IN (N'STARTER',N'PRO',N'BUSINESS')),
  BillingInterval NVARCHAR(10) NULL CHECK (BillingInterval IS NULL OR BillingInterval IN (N'MONTHLY',N'ANNUAL')),
  IsActive BIT NOT NULL DEFAULT 1,
  CreatedByUserID UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.TblUser(UserID),
  CreatedAtUtc DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT CK_PricingDiscountCode_Window CHECK
    (StartsAtUtc IS NULL OR ExpiresAtUtc IS NULL OR StartsAtUtc < ExpiresAtUtc),
  CONSTRAINT CK_PricingDiscountCode_Percent CHECK
    (Kind <> N'PERCENT' OR Value <= 90)
 );
END;
GO
IF COL_LENGTH(N'dbo.TblManualPaymentRequest',N'DiscountCode') IS NULL
BEGIN
 ALTER TABLE dbo.TblManualPaymentRequest ADD
   DiscountCode NVARCHAR(32) NULL REFERENCES dbo.TblPricingDiscountCode(Code),
   SubtotalMinor BIGINT NULL,
   DiscountMinor BIGINT NULL;
END;
GO
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name=N'CK_ManualPayment_DiscountSnapshot'
 AND parent_object_id=OBJECT_ID(N'dbo.TblManualPaymentRequest'))
BEGIN
 ALTER TABLE dbo.TblManualPaymentRequest ADD
   CONSTRAINT CK_ManualPayment_DiscountSnapshot CHECK (
     (DiscountCode IS NULL AND SubtotalMinor IS NULL AND DiscountMinor IS NULL)
     OR (DiscountCode IS NOT NULL AND SubtotalMinor>0 AND
       DiscountMinor>0 AND DiscountMinor<SubtotalMinor AND
       CONVERT(BIGINT,ROUND(Amount * 100,0)) = SubtotalMinor - DiscountMinor)
   );
END;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'IX_ManualPayment_DiscountCode_Status'
 AND object_id=OBJECT_ID(N'dbo.TblManualPaymentRequest'))
BEGIN
 CREATE INDEX IX_ManualPayment_DiscountCode_Status
   ON dbo.TblManualPaymentRequest(DiscountCode, Status)
   WHERE DiscountCode IS NOT NULL;
END;
GO
