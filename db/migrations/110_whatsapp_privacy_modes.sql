IF OBJECT_ID(N'dbo.TblWhatsAppPrivacyMode', N'U') IS NULL
BEGIN
 CREATE TABLE dbo.TblWhatsAppPrivacyMode (
  BusinessID uniqueidentifier NOT NULL PRIMARY KEY REFERENCES dbo.TblBusiness(BusinessID),
  Mode varchar(20) NOT NULL CHECK (Mode IN ('ALL','BUSINESS_ONLY','MANUAL')),
  UpdatedAtUtc datetime2 NOT NULL DEFAULT SYSUTCDATETIME()
 );
END;
IF OBJECT_ID(N'dbo.TblWhatsAppApprovedContact', N'U') IS NULL
BEGIN
 CREATE TABLE dbo.TblWhatsAppApprovedContact (
  BusinessID uniqueidentifier NOT NULL REFERENCES dbo.TblBusiness(BusinessID),
  PhoneNormalized varchar(15) NOT NULL,
  ApprovedAtUtc datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),
  PRIMARY KEY (BusinessID, PhoneNormalized),
  CHECK (LEN(PhoneNormalized) BETWEEN 8 AND 15 AND PhoneNormalized NOT LIKE '%[^0-9]%')
 );
END;
GO
