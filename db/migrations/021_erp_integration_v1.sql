-- ERP integration V1: secure connector metadata + idempotent event delivery log.

IF COL_LENGTH(N'dbo.TblIntegration', N'BaseUrl') IS NULL
  ALTER TABLE dbo.TblIntegration ADD BaseUrl NVARCHAR(500) NULL;
GO
IF COL_LENGTH(N'dbo.TblIntegration', N'InboundApiKeyHash') IS NULL
  ALTER TABLE dbo.TblIntegration ADD InboundApiKeyHash NVARCHAR(128) NULL;
GO
IF COL_LENGTH(N'dbo.TblIntegration', N'SecretCiphertext') IS NULL
  ALTER TABLE dbo.TblIntegration ADD SecretCiphertext NVARCHAR(MAX) NULL;
GO
IF COL_LENGTH(N'dbo.TblIntegration', N'CapabilitiesJson') IS NULL
  ALTER TABLE dbo.TblIntegration ADD CapabilitiesJson NVARCHAR(MAX) NULL;
GO
IF COL_LENGTH(N'dbo.TblIntegration', N'LastHealthAtUtc') IS NULL
  ALTER TABLE dbo.TblIntegration ADD LastHealthAtUtc DATETIME2 NULL;
GO
IF COL_LENGTH(N'dbo.TblIntegration', N'LastHealthStatus') IS NULL
  ALTER TABLE dbo.TblIntegration ADD LastHealthStatus NVARCHAR(32) NULL;
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = N'IX_TblIntegration_InboundApiKeyHash'
    AND object_id = OBJECT_ID(N'dbo.TblIntegration')
)
BEGIN
  CREATE UNIQUE INDEX IX_TblIntegration_InboundApiKeyHash
    ON dbo.TblIntegration (InboundApiKeyHash)
    WHERE InboundApiKeyHash IS NOT NULL;
END;
GO

IF OBJECT_ID(N'dbo.TblIntegrationEventLog', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.TblIntegrationEventLog (
    IntegrationEventLogID UNIQUEIDENTIFIER NOT NULL
      CONSTRAINT DF_TblIntegrationEventLog_ID DEFAULT NEWSEQUENTIALID(),
    BusinessID UNIQUEIDENTIFIER NOT NULL,
    IntegrationID UNIQUEIDENTIFIER NOT NULL,
    ExternalEventID NVARCHAR(200) NOT NULL,
    EventType NVARCHAR(128) NOT NULL,
    Recipient NVARCHAR(64) NOT NULL,
    MessagePreview NVARCHAR(300) NULL,
    Status NVARCHAR(32) NOT NULL,
    ProviderMessageID NVARCHAR(256) NULL,
    ErrorCode NVARCHAR(128) NULL,
    MetadataJson NVARCHAR(MAX) NULL,
    CreatedAtUtc DATETIME2 NOT NULL
      CONSTRAINT DF_TblIntegrationEventLog_Created DEFAULT SYSUTCDATETIME(),
    UpdatedAtUtc DATETIME2 NOT NULL
      CONSTRAINT DF_TblIntegrationEventLog_Updated DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_TblIntegrationEventLog PRIMARY KEY (IntegrationEventLogID),
    CONSTRAINT UQ_TblIntegrationEventLog_ExternalEvent UNIQUE (IntegrationID, ExternalEventID),
    CONSTRAINT CK_TblIntegrationEventLog_Status CHECK (
      Status IN (N'RECEIVED', N'SENT', N'FAILED')
    ),
    CONSTRAINT FK_TblIntegrationEventLog_Business FOREIGN KEY (BusinessID)
      REFERENCES dbo.TblBusiness (BusinessID) ON DELETE NO ACTION,
    CONSTRAINT FK_TblIntegrationEventLog_Integration FOREIGN KEY (IntegrationID)
      REFERENCES dbo.TblIntegration (IntegrationID) ON DELETE NO ACTION
  );
  CREATE INDEX IX_TblIntegrationEventLog_Business_Created
    ON dbo.TblIntegrationEventLog (BusinessID, CreatedAtUtc DESC);
END;
GO
