-- Additive version snapshot for pricing quotes. Existing payment requests remain legacy.
IF COL_LENGTH(N'dbo.TblManualPaymentRequest', N'PricingCatalogVersion') IS NULL
BEGIN
  ALTER TABLE dbo.TblManualPaymentRequest ADD PricingCatalogVersion NVARCHAR(48) NULL;
END;
GO
