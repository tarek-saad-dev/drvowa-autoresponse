IF OBJECT_ID(N'dbo.TblPricingAddonEntitlement',N'U') IS NULL
BEGIN
 CREATE TABLE dbo.TblPricingAddonEntitlement (
  EntitlementID UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
  OrderID UNIQUEIDENTIFIER NOT NULL UNIQUE REFERENCES dbo.TblPricingAddonOrder(OrderID),
  BusinessID UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.TblBusiness(BusinessID),
  AddonCode NVARCHAR(64) NOT NULL,
  Unit NVARCHAR(32) NOT NULL,
  GrantedQuantity INT NOT NULL CHECK(GrantedQuantity>0),
  RemainingQuantity INT NOT NULL CHECK(RemainingQuantity>=0),
  ValidFromUtc DATETIME2(3) NOT NULL,
  ExpiresAtUtc DATETIME2(3) NULL
 );
END;
GO
