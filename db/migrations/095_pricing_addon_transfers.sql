-- Isolated add-on transfer requests; never reuse subscription approval path.
IF COL_LENGTH(N'dbo.TblPricingAddonOrder',N'PaymentReference') IS NULL
BEGIN
 ALTER TABLE dbo.TblPricingAddonOrder ADD
 PaymentReference NVARCHAR(64) NULL,
 PayerName NVARCHAR(160) NULL,
 TransferReference NVARCHAR(160) NULL,
 SubmittedAtUtc DATETIME2(3) NULL,
 ReviewedAtUtc DATETIME2(3) NULL,
 ReviewedByUserID UNIQUEIDENTIFIER NULL;
 CREATE UNIQUE INDEX UX_PricingAddonOrder_PaymentReference
 ON dbo.TblPricingAddonOrder(PaymentReference) WHERE PaymentReference IS NOT NULL;
END;
GO
