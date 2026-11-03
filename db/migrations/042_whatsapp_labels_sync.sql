-- WhatsApp Business labels: event-driven mirror only; NO marketing permission is inferred.
-- Labels are tenant+channel scoped. Existing labels may need a source backfill.
IF OBJECT_ID(N'dbo.TblWhatsAppLabel', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.TblWhatsAppLabel (
    WhatsAppLabelID UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_WhatsAppLabel_ID DEFAULT NEWSEQUENTIALID(),
    BusinessID UNIQUEIDENTIFIER NOT NULL,
    ChannelConnectionID UNIQUEIDENTIFIER NOT NULL,
    ProviderLabelID NVARCHAR(128) NOT NULL,
    LabelName NVARCHAR(200) NULL,
    Color INT NULL,
    IsDeleted BIT NOT NULL CONSTRAINT DF_WhatsAppLabel_Deleted DEFAULT(0),
    CreatedAtUtc DATETIME2 NOT NULL CONSTRAINT DF_WhatsAppLabel_Created DEFAULT SYSUTCDATETIME(),
    UpdatedAtUtc DATETIME2 NOT NULL CONSTRAINT DF_WhatsAppLabel_Updated DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_TblWhatsAppLabel PRIMARY KEY (WhatsAppLabelID)
  );
END;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.TblWhatsAppLabel') AND name=N'UX_WhatsAppLabel_Channel_Provider')
  CREATE UNIQUE INDEX UX_WhatsAppLabel_Channel_Provider
  ON dbo.TblWhatsAppLabel (BusinessID, ChannelConnectionID, ProviderLabelID);
GO
IF OBJECT_ID(N'dbo.TblWhatsAppContactLabel', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.TblWhatsAppContactLabel (
    BusinessID UNIQUEIDENTIFIER NOT NULL,
    ChannelConnectionID UNIQUEIDENTIFIER NOT NULL,
    ProviderLabelID NVARCHAR(128) NOT NULL,
    ContactID UNIQUEIDENTIFIER NOT NULL,
    IsActive BIT NOT NULL CONSTRAINT DF_WhatsAppContactLabel_Active DEFAULT(1),
    UpdatedAtUtc DATETIME2 NOT NULL CONSTRAINT DF_WhatsAppContactLabel_Updated DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_TblWhatsAppContactLabel PRIMARY KEY (BusinessID, ChannelConnectionID, ProviderLabelID, ContactID)
  );
END;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.TblWhatsAppContactLabel') AND name=N'IX_WhatsAppContactLabel_Audience')
  CREATE INDEX IX_WhatsAppContactLabel_Audience
  ON dbo.TblWhatsAppContactLabel (BusinessID, ChannelConnectionID, ProviderLabelID, IsActive);
GO