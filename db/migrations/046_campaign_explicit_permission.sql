-- Explicit evidence-backed marketing opt-in. This migration does not assume
-- existing contacts, conversation history or WhatsApp labels mean consent.
IF OBJECT_ID(N'dbo.TblWhatsAppCampaignPermission', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.TblWhatsAppCampaignPermission (
    BusinessID UNIQUEIDENTIFIER NOT NULL,
    ChannelConnectionID UNIQUEIDENTIFIER NOT NULL,
    PhoneNormalized NVARCHAR(32) NOT NULL,
    Source NVARCHAR(40) NOT NULL,
    ProviderMessageID NVARCHAR(256) NOT NULL,
    EvidenceText NVARCHAR(500) NOT NULL,
    ConsentedAtUtc DATETIME2(3) NOT NULL CONSTRAINT DF_WACampaignPermission_At DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_WACampaignPermission PRIMARY KEY
      (BusinessID, ChannelConnectionID, PhoneNormalized),
    CONSTRAINT CK_WACampaignPermission_Source CHECK (Source=N'EXPLICIT_INBOUND'),
    CONSTRAINT FK_WACampaignPermission_Business FOREIGN KEY (BusinessID) REFERENCES dbo.TblBusiness(BusinessID),
    CONSTRAINT FK_WACampaignPermission_Channel FOREIGN KEY (ChannelConnectionID) REFERENCES dbo.TblChannelConnection(ChannelConnectionID)
  );
END;
GO