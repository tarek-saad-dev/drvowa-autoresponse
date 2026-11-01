-- Draft add-on order table, no customer changes.
IF OBJECT_ID(N'dbo.TblPricingAddonOrder', N'U') IS NULL
BEGIN
 CREATE TABLE dbo.TblPricingAddonOrder (
 OrderID UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
 BusinessID UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.TblBusiness(BusinessID),
 AddonCode NVARCHAR(64) NOT NULL,
 Quantity INT NOT NULL CHECK (Quantity > 0),
 AmountEgp DECIMAL(12,2) NOT NULL CHECK (AmountEgp > 0),
 CatalogVersion NVARCHAR(48) NOT NULL,
 Status NVARCHAR(20) NOT NULL DEFAULT N'DRAFT',
 IdempotencyKey NVARCHAR(160) NOT NULL,
 CreatedAtUtc DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
 CONSTRAINT UQ_PricingAddonOrder_TenantKey UNIQUE (BusinessID, IdempotencyKey)
 );
END;
GO
