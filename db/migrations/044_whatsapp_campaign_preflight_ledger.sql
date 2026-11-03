-- WhatsApp label campaign preflight / durable recipient deduplication.
-- No status in these tables represents permission to send. There is no worker
-- claiming these rows, nor any sending/scheduling transition in this release.
IF OBJECT_ID(N'dbo.TblWhatsAppCampaignPreflight', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.TblWhatsAppCampaignPreflight (
    PreflightID UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_TblWhatsAppCampaignPreflight PRIMARY KEY,
    BusinessID UNIQUEIDENTIFIER NOT NULL,
    CampaignDraftID UNIQUEIDENTIFIER NOT NULL,
    ChannelConnectionID UNIQUEIDENTIFIER NOT NULL,
    LabelID NVARCHAR(128) NOT NULL,
    CopyHash VARBINARY(32) NOT NULL,
    RequestedByUserID UNIQUEIDENTIFIER NOT NULL,
    Status NVARCHAR(24) NOT NULL CONSTRAINT DF_WhatsAppCampaignPreflight_Status DEFAULT(N'REVIEW_ONLY'),
    ObservedMemberships INT NOT NULL,
    UniqueValidPhones INT NOT NULL,
    InvalidPhones INT NOT NULL,
    DuplicatePhones INT NOT NULL,
    CreatedAtUtc DATETIME2(3) NOT NULL CONSTRAINT DF_WhatsAppCampaignPreflight_Created DEFAULT SYSUTCDATETIME(),
    CONSTRAINT CK_WhatsAppCampaignPreflight_Status CHECK (Status=N'REVIEW_ONLY'),
    CONSTRAINT CK_WhatsAppCampaignPreflight_Counts CHECK (
      ObservedMemberships>=0 AND UniqueValidPhones>=0
      AND InvalidPhones>=0 AND DuplicatePhones>=0
      AND ObservedMemberships=UniqueValidPhones+InvalidPhones+DuplicatePhones
    ),
    CONSTRAINT FK_WhatsAppCampaignPreflight_Business
      FOREIGN KEY (BusinessID) REFERENCES dbo.TblBusiness(BusinessID),
    CONSTRAINT FK_WhatsAppCampaignPreflight_Draft
      FOREIGN KEY (CampaignDraftID) REFERENCES dbo.TblWhatsAppLabelCampaignDraft(CampaignDraftID),
    CONSTRAINT FK_WhatsAppCampaignPreflight_User
      FOREIGN KEY (RequestedByUserID) REFERENCES dbo.TblUser(UserID)
  );
END;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes
  WHERE object_id=OBJECT_ID(N'dbo.TblWhatsAppCampaignPreflight')
    AND name=N'UX_WhatsAppCampaignPreflight_Draft_Copy')
  CREATE UNIQUE INDEX UX_WhatsAppCampaignPreflight_Draft_Copy
  ON dbo.TblWhatsAppCampaignPreflight(BusinessID,CampaignDraftID,CopyHash);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes
  WHERE object_id=OBJECT_ID(N'dbo.TblWhatsAppCampaignPreflight')
    AND name=N'IX_WhatsAppCampaignPreflight_Business_Created')
  CREATE INDEX IX_WhatsAppCampaignPreflight_Business_Created
  ON dbo.TblWhatsAppCampaignPreflight(BusinessID,CreatedAtUtc DESC);
GO

IF OBJECT_ID(N'dbo.TblWhatsAppCampaignPreflightRecipient', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.TblWhatsAppCampaignPreflightRecipient (
    BusinessID UNIQUEIDENTIFIER NOT NULL,
    PreflightID UNIQUEIDENTIFIER NOT NULL,
    ContactID UNIQUEIDENTIFIER NOT NULL,
    PhoneNormalized NVARCHAR(32) NOT NULL,
    Status NVARCHAR(24) NOT NULL CONSTRAINT DF_WhatsAppCampaignPreflightRecipient_Status DEFAULT(N'BLOCKED'),
    Reason NVARCHAR(40) NOT NULL CONSTRAINT DF_WhatsAppCampaignPreflightRecipient_Reason DEFAULT(N'UNVERIFIED_PERMISSION'),
    CreatedAtUtc DATETIME2(3) NOT NULL CONSTRAINT DF_WhatsAppCampaignPreflightRecipient_Created DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_TblWhatsAppCampaignPreflightRecipient PRIMARY KEY (BusinessID,PreflightID,PhoneNormalized),
    CONSTRAINT CK_WhatsAppCampaignPreflightRecipient_Status CHECK (Status=N'BLOCKED'),
    CONSTRAINT CK_WhatsAppCampaignPreflightRecipient_Reason CHECK (Reason=N'UNVERIFIED_PERMISSION'),
    CONSTRAINT FK_WhatsAppCampaignPreflightRecipient_Run
      FOREIGN KEY (PreflightID) REFERENCES dbo.TblWhatsAppCampaignPreflight(PreflightID)
  );
END;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes
  WHERE object_id=OBJECT_ID(N'dbo.TblWhatsAppCampaignPreflightRecipient')
    AND name=N'IX_WhatsAppCampaignPreflightRecipient_Contact')
  CREATE INDEX IX_WhatsAppCampaignPreflightRecipient_Contact
  ON dbo.TblWhatsAppCampaignPreflightRecipient(BusinessID,ContactID);
GO