-- Alter and index must be separate SQL batches for SQL Server compilation.
IF COL_LENGTH(N'dbo.TblPricingAddonOrder', N'PaymentReference') IS NULL
BEGIN
 ALTER TABLE dbo.TblPricingAddonOrder ADD
  PaymentReference NVARCHAR(64) NULL,
  PayerName NVARCHAR(160) NULL,
  TransferReference NVARCHAR(160) NULL,
  SubmittedAtUtc DATETIME2(3) NULL,
  ReviewedAtUtc DATETIME2(3) NULL,
  ReviewedByUserID UNIQUEIDENTIFIER NULL;
END;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.TblPricingAddonOrder') AND name=N'UX_PricingAddonOrder_PaymentReference')
BEGIN
 CREATE UNIQUE INDEX UX_PricingAddonOrder_PaymentReference
 ON dbo.TblPricingAddonOrder(PaymentReference)
 WHERE PaymentReference IS NOT NULL;
END;
GO
