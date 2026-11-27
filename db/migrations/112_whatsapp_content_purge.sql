IF COL_LENGTH(N'dbo.TblMessage',N'PrivacyPurgedAtUtc') IS NULL
 ALTER TABLE dbo.TblMessage ADD PrivacyPurgedAtUtc datetime2 NULL;
GO
IF OBJECT_ID(N'dbo.TblWhatsAppMediaPurge',N'U') IS NULL
BEGIN
 CREATE TABLE dbo.TblWhatsAppMediaPurge (
  BusinessID uniqueidentifier NOT NULL REFERENCES dbo.TblBusiness(BusinessID),
  StorageKey varchar(64) NOT NULL,
  QueuedAtUtc datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),
  DeletedAtUtc datetime2 NULL,
  PRIMARY KEY(BusinessID,StorageKey),
  CHECK (LEN(StorageKey)=64 AND StorageKey NOT LIKE '%[^0-9a-f]%')
 );
END;
GO
IF OBJECT_ID(N'dbo.TblWhatsAppRetentionPreference',N'U') IS NULL
BEGIN
 CREATE TABLE dbo.TblWhatsAppRetentionPreference (
  BusinessID uniqueidentifier NOT NULL PRIMARY KEY REFERENCES dbo.TblBusiness(BusinessID),
  RetentionDays int NULL CHECK (RetentionDays IN (7,30,90,180,365)),
  UpdatedAtUtc datetime2 NOT NULL DEFAULT SYSUTCDATETIME()
 );
END;
GO
