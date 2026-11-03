-- Phase 3: review-only WhatsApp label campaign drafts.
-- IMPORTANT: approving the COPY never authorizes WhatsApp delivery.
-- No queue, send job, consent assertion or automatic broadcast is created here.
IF OBJECT_ID(N'dbo.TblWhatsAppLabelCampaignDraft', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.TblWhatsAppLabelCampaignDraft (
    CampaignDraftID UNIQUEIDENTIFIER NOT NULL
      CONSTRAINT PK_TblWhatsAppLabelCampaignDraft PRIMARY KEY,
    BusinessID UNIQUEIDENTIFIER NOT NULL,
    ChannelConnectionID UNIQUEIDENTIFIER NOT NULL,
    ProviderLabelID NVARCHAR(128) NOT NULL,
    LabelNameSnapshot NVARCHAR(200) NOT NULL,
    MessageText NVARCHAR(3000) NOT NULL,
    RequestedByUserID UNIQUEIDENTIFIER NOT NULL,
    ObservedContactsAtDraft INT NOT NULL,
    Status NVARCHAR(20) NOT NULL
      CONSTRAINT DF_WhatsAppLabelCampaignDraft_Status DEFAULT N'DRAFT',
    CreatedAtUtc DATETIME2(3) NOT NULL
      CONSTRAINT DF_WhatsAppLabelCampaignDraft_Created DEFAULT SYSUTCDATETIME(),
    UpdatedAtUtc DATETIME2(3) NOT NULL
      CONSTRAINT DF_WhatsAppLabelCampaignDraft_Updated DEFAULT SYSUTCDATETIME(),
    CopyApprovedAtUtc DATETIME2(3) NULL,
    CONSTRAINT CK_WhatsAppLabelCampaignDraft_Status
      CHECK (Status IN (N'DRAFT', N'COPY_APPROVED', N'CANCELLED')),
    CONSTRAINT CK_WhatsAppLabelCampaignDraft_Count CHECK (ObservedContactsAtDraft >= 0),
    CONSTRAINT FK_WhatsAppLabelCampaignDraft_Business
      FOREIGN KEY (BusinessID) REFERENCES dbo.TblBusiness(BusinessID),
    CONSTRAINT FK_WhatsAppLabelCampaignDraft_User
      FOREIGN KEY (RequestedByUserID) REFERENCES dbo.TblUser(UserID)
  );
END;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes
  WHERE object_id=OBJECT_ID(N'dbo.TblWhatsAppLabelCampaignDraft')
    AND name=N'IX_WhatsAppLabelCampaignDraft_Business_Created')
  CREATE INDEX IX_WhatsAppLabelCampaignDraft_Business_Created
  ON dbo.TblWhatsAppLabelCampaignDraft (BusinessID, CreatedAtUtc DESC)
  INCLUDE (Status, ChannelConnectionID, ProviderLabelID);
GO