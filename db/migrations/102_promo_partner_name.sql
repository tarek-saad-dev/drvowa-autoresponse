-- Optional public-facing name for an influencer/campaign owner.
IF COL_LENGTH(N'dbo.TblPricingDiscountCode',N'PartnerDisplayName') IS NULL
 ALTER TABLE dbo.TblPricingDiscountCode ADD PartnerDisplayName NVARCHAR(80) NULL;
GO
