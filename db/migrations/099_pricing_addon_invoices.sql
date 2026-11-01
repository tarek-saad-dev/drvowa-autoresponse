-- Separate accounting documents for manual add-on transfers. No subscription invoice aliasing.
IF OBJECT_ID(N'dbo.TblPricingAddonInvoice',N'U') IS NULL
BEGIN
 CREATE TABLE dbo.TblPricingAddonInvoice (
  InvoiceID UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
  InvoiceNumber BIGINT IDENTITY(1,1) NOT NULL UNIQUE,
  OrderID UNIQUEIDENTIFIER NOT NULL UNIQUE REFERENCES dbo.TblPricingAddonOrder(OrderID),
  BusinessID UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.TblBusiness(BusinessID),
  AmountMinor BIGINT NOT NULL CHECK (AmountMinor > 0),
  CurrencyCode NVARCHAR(3) NOT NULL DEFAULT N'EGP',
  Status NVARCHAR(16) NOT NULL CHECK (Status IN (N'OPEN',N'PAID',N'VOID')),
  IssuedAtUtc DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
  SettledAtUtc DATETIME2(3) NULL,
  CONSTRAINT CK_PricingAddonInvoice_Settled CHECK
   ((Status=N'PAID' AND SettledAtUtc IS NOT NULL)
     OR (Status IN (N'OPEN',N'VOID') AND SettledAtUtc IS NULL))
 );
 CREATE INDEX IX_PricingAddonInvoice_Business
  ON dbo.TblPricingAddonInvoice(BusinessID,IssuedAtUtc DESC);
END;
GO
IF OBJECT_ID(N'dbo.TblPricingAddonReceipt',N'U') IS NULL
BEGIN
 CREATE TABLE dbo.TblPricingAddonReceipt (
  ReceiptID UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
  ReceiptNumber BIGINT IDENTITY(1,1) NOT NULL UNIQUE,
  InvoiceID UNIQUEIDENTIFIER NOT NULL UNIQUE REFERENCES dbo.TblPricingAddonInvoice(InvoiceID),
  AmountMinor BIGINT NOT NULL CHECK (AmountMinor > 0),
  CurrencyCode NVARCHAR(3) NOT NULL,
  IssuedAtUtc DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME()
 );
END;
GO
