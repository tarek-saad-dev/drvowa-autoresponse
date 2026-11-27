IF OBJECT_ID(N'dbo.TblWhatsAppPrivateContact', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.TblWhatsAppPrivateContact (
    BusinessID uniqueidentifier NOT NULL,
    PhoneNormalized varchar(15) NOT NULL,
    CreatedAtUtc datetime2 NOT NULL CONSTRAINT DF_WAPrivateContact_Created DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_WAPrivateContact PRIMARY KEY (BusinessID, PhoneNormalized),
    CONSTRAINT FK_WAPrivateContact_Business FOREIGN KEY (BusinessID) REFERENCES dbo.TblBusiness(BusinessID),
    CONSTRAINT CK_WAPrivateContact_Phone CHECK (LEN(PhoneNormalized) BETWEEN 8 AND 15 AND PhoneNormalized NOT LIKE '%[^0-9]%')
  );
END;
GO
