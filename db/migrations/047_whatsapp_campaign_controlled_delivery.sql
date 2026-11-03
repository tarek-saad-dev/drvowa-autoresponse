-- Audited, owner-authorized campaign delivery. Only explicit inbound
-- business-named marketing permissions may make a recipient eligible.
-- No historical contact/label membership counts as an opt-in.
IF OBJECT_ID(N'dbo.TblWhatsAppCampaignRun', N'U') IS NULL
BEGIN
 CREATE TABLE dbo.TblWhatsAppCampaignRun (
   RunID UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_TblWhatsAppCampaignRun PRIMARY KEY,
   BusinessID UNIQUEIDENTIFIER NOT NULL,
   CampaignDraftID UNIQUEIDENTIFIER NOT NULL,
   PreflightID UNIQUEIDENTIFIER NOT NULL,
   ChannelConnectionID UNIQUEIDENTIFIER NOT NULL,
   ProviderLabelID NVARCHAR(128) NOT NULL,
   MessageText NVARCHAR(3000) NOT NULL,
   CopyHash VARBINARY(32) NOT NULL,
   RequestedByUserID UNIQUEIDENTIFIER NOT NULL,
   Status NVARCHAR(20) NOT NULL CONSTRAINT DF_TblWhatsAppCampaignRun_Status DEFAULT(N'QUEUED'),
   EligibleCount INT NOT NULL,
   CreatedAtUtc DATETIME2(3) NOT NULL CONSTRAINT DF_TblWhatsAppCampaignRun_Created DEFAULT SYSUTCDATETIME(),
   UpdatedAtUtc DATETIME2(3) NOT NULL CONSTRAINT DF_TblWhatsAppCampaignRun_Updated DEFAULT SYSUTCDATETIME(),
   LastAttemptAtUtc DATETIME2(3) NULL,
   CONSTRAINT UQ_TblWhatsAppCampaignRun_Preflight UNIQUE(BusinessID,PreflightID),
   CONSTRAINT CK_TblWhatsAppCampaignRun_Status
     CHECK (Status IN (N'QUEUED',N'RUNNING',N'PAUSED',N'COMPLETED',N'CANCELLED')),
   CONSTRAINT CK_TblWhatsAppCampaignRun_Eligible CHECK (EligibleCount BETWEEN 1 AND 300),
   CONSTRAINT FK_TblWhatsAppCampaignRun_Business FOREIGN KEY(BusinessID) REFERENCES dbo.TblBusiness(BusinessID),
   CONSTRAINT FK_TblWhatsAppCampaignRun_Draft FOREIGN KEY(CampaignDraftID) REFERENCES dbo.TblWhatsAppLabelCampaignDraft(CampaignDraftID),
   CONSTRAINT FK_TblWhatsAppCampaignRun_Preflight FOREIGN KEY(PreflightID) REFERENCES dbo.TblWhatsAppCampaignPreflight(PreflightID),
   CONSTRAINT FK_TblWhatsAppCampaignRun_User FOREIGN KEY(RequestedByUserID) REFERENCES dbo.TblUser(UserID)
 );
END;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.TblWhatsAppCampaignRun')
  AND name=N'IX_TblWhatsAppCampaignRun_Channel_Status')
 CREATE INDEX IX_TblWhatsAppCampaignRun_Channel_Status
 ON dbo.TblWhatsAppCampaignRun(ChannelConnectionID,Status,CreatedAtUtc)
 INCLUDE(BusinessID,PreflightID);
GO
IF OBJECT_ID(N'dbo.TblWhatsAppCampaignRunItem', N'U') IS NULL
BEGIN
 CREATE TABLE dbo.TblWhatsAppCampaignRunItem (
   RunID UNIQUEIDENTIFIER NOT NULL,
   BusinessID UNIQUEIDENTIFIER NOT NULL,
   PhoneNormalized NVARCHAR(32) NOT NULL,
   ContactID UNIQUEIDENTIFIER NOT NULL,
   Status NVARCHAR(20) NOT NULL CONSTRAINT DF_TblWhatsAppCampaignRunItem_Status DEFAULT(N'PENDING'),
   ClaimToken UNIQUEIDENTIFIER NULL,
   ClaimedAtUtc DATETIME2(3) NULL,
   CompletedAtUtc DATETIME2(3) NULL,
   ProviderMessageID NVARCHAR(256) NULL,
   ErrorCode NVARCHAR(64) NULL,
   CONSTRAINT PK_TblWhatsAppCampaignRunItem PRIMARY KEY(RunID,PhoneNormalized),
   CONSTRAINT FK_TblWhatsAppCampaignRunItem_Run FOREIGN KEY(RunID) REFERENCES dbo.TblWhatsAppCampaignRun(RunID),
   CONSTRAINT CK_TblWhatsAppCampaignRunItem_Status
     CHECK (Status IN (N'PENDING',N'IN_FLIGHT',N'SENT',N'FAILED',N'UNKNOWN',N'SKIPPED'))
 );
END;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.TblWhatsAppCampaignRunItem')
  AND name=N'IX_TblWhatsAppCampaignRunItem_Business_Status')
 CREATE INDEX IX_TblWhatsAppCampaignRunItem_Business_Status
 ON dbo.TblWhatsAppCampaignRunItem(BusinessID,Status,ClaimedAtUtc)
 INCLUDE (RunID,CompletedAtUtc);
GO
-- Account-wide spacing is serialized independently of individual jobs.
IF OBJECT_ID(N'dbo.TblWhatsAppCampaignThrottle', N'U') IS NULL
BEGIN
 CREATE TABLE dbo.TblWhatsAppCampaignThrottle (
   ChannelConnectionID UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_TblWhatsAppCampaignThrottle PRIMARY KEY,
   BusinessID UNIQUEIDENTIFIER NOT NULL,
   NextAttemptAtUtc DATETIME2(3) NOT NULL CONSTRAINT DF_TblWhatsAppCampaignThrottle_Next DEFAULT SYSUTCDATETIME(),
   CONSTRAINT FK_TblWhatsAppCampaignThrottle_Channel
     FOREIGN KEY(ChannelConnectionID) REFERENCES dbo.TblChannelConnection(ChannelConnectionID)
 );
END;
GO