-- One-time ERP pairing codes for tenant-safe connector setup.

IF OBJECT_ID(N'dbo.TblIntegrationPairing', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.TblIntegrationPairing (
    IntegrationPairingID UNIQUEIDENTIFIER NOT NULL
      CONSTRAINT DF_TblIntegrationPairing_ID DEFAULT NEWSEQUENTIALID(),
    BusinessID UNIQUEIDENTIFIER NOT NULL,
    PairingCodeHash NVARCHAR(128) NOT NULL,
    ExpiresAtUtc DATETIME2 NOT NULL,
    UsedAtUtc DATETIME2 NULL,
    CreatedByUserID UNIQUEIDENTIFIER NULL,
    CreatedAtUtc DATETIME2 NOT NULL
      CONSTRAINT DF_TblIntegrationPairing_Created DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_TblIntegrationPairing PRIMARY KEY (IntegrationPairingID),
    CONSTRAINT UQ_TblIntegrationPairing_Code UNIQUE (PairingCodeHash),
    CONSTRAINT FK_TblIntegrationPairing_Business FOREIGN KEY (BusinessID)
      REFERENCES dbo.TblBusiness (BusinessID) ON DELETE CASCADE
  );

  CREATE INDEX IX_TblIntegrationPairing_Business_Expires
    ON dbo.TblIntegrationPairing (BusinessID, ExpiresAtUtc DESC)
    INCLUDE (UsedAtUtc, CreatedAtUtc);
END;
GO
