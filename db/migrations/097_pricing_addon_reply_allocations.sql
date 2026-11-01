IF OBJECT_ID(N'dbo.TblPricingAddonReplyAllocation',N'U') IS NULL
BEGIN
 CREATE TABLE dbo.TblPricingAddonReplyAllocation (
  BusinessID UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.TblBusiness(BusinessID),
  ReservationKey NVARCHAR(200) NOT NULL,
  EntitlementID UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.TblPricingAddonEntitlement(EntitlementID),
  Quantity INT NOT NULL CHECK (Quantity>0),
  State NVARCHAR(16) NOT NULL DEFAULT N'ACTIVE' CHECK (State IN (N'ACTIVE',N'RELEASED')),
  CONSTRAINT PK_PricingAddonReplyAllocation PRIMARY KEY (BusinessID,ReservationKey)
 );
END;
GO
