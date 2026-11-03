-- Minimal customer "stop promotional messages" suppression, without
-- requiring an onboarding / consent dashboard. Never marks anyone opted in.
IF OBJECT_ID(N'dbo.TblWhatsAppCampaignOptOut', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.TblWhatsAppCampaignOptOut (
    BusinessID UNIQUEIDENTIFIER NOT NULL,
    ChannelConnectionID UNIQUEIDENTIFIER NOT NULL,
    PhoneNormalized NVARCHAR(32) NOT NULL,
    ProviderMessageID NVARCHAR(256) NOT NULL,
    StoppedAtUtc DATETIME2(3) NOT NULL CONSTRAINT DF_WhatsAppCampaignOptOut_Stopped DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_TblWhatsAppCampaignOptOut PRIMARY KEY
      (BusinessID,ChannelConnectionID,PhoneNormalized),
    CONSTRAINT FK_WhatsAppCampaignOptOut_Business
      FOREIGN KEY (BusinessID) REFERENCES dbo.TblBusiness(BusinessID),
    CONSTRAINT FK_WhatsAppCampaignOptOut_Channel
      FOREIGN KEY (ChannelConnectionID) REFERENCES dbo.TblChannelConnection(ChannelConnectionID)
  );
END;
GO
IF COL_LENGTH(N'dbo.TblWhatsAppCampaignPreflight', N'StoppedPhones') IS NULL
BEGIN
  ALTER TABLE dbo.TblWhatsAppCampaignPreflight
    ADD StoppedPhones INT NOT NULL
      CONSTRAINT DF_WhatsAppCampaignPreflight_Stopped DEFAULT(0);
END;
GO
IF NOT EXISTS (
  SELECT 1 FROM sys.check_constraints
  WHERE parent_object_id=OBJECT_ID(N'dbo.TblWhatsAppCampaignPreflight')
    AND name=N'CK_WhatsAppCampaignPreflight_Stopped'
)
  ALTER TABLE dbo.TblWhatsAppCampaignPreflight
    ADD CONSTRAINT CK_WhatsAppCampaignPreflight_Stopped
    CHECK (StoppedPhones>=0 AND StoppedPhones<=UniqueValidPhones);
GO
IF NOT EXISTS (
  SELECT 1 FROM sys.check_constraints
  WHERE parent_object_id=OBJECT_ID(N'dbo.TblWhatsAppCampaignPreflightRecipient')
    AND name=N'CK_WhatsAppCampaignPreflightRecipient_ReasonV2'
)
BEGIN
  IF EXISTS (
    SELECT 1 FROM sys.check_constraints
    WHERE parent_object_id=OBJECT_ID(N'dbo.TblWhatsAppCampaignPreflightRecipient')
      AND name=N'CK_WhatsAppCampaignPreflightRecipient_Reason'
  )
    ALTER TABLE dbo.TblWhatsAppCampaignPreflightRecipient
      DROP CONSTRAINT CK_WhatsAppCampaignPreflightRecipient_Reason;

  ALTER TABLE dbo.TblWhatsAppCampaignPreflightRecipient
    ADD CONSTRAINT CK_WhatsAppCampaignPreflightRecipient_ReasonV2
    CHECK (Reason IN (N'UNVERIFIED_PERMISSION',N'CUSTOMER_OPTOUT'));
END;
GO