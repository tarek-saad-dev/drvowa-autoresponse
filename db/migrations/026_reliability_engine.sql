-- Reliability Engine V1: tenant-scoped runtime capture evidence and durable incident lifecycle.
IF COL_LENGTH(N'dbo.TblConversationAiState', N'LastHumanReplyAtUtc') IS NULL
  ALTER TABLE dbo.TblConversationAiState ADD LastHumanReplyAtUtc DATETIME2 NULL;
GO
-- Historical handoffs only when the old state explicitly recorded a human message.
UPDATE dbo.TblConversationAiState
SET LastHumanReplyAtUtc = PausedAtUtc
WHERE LastHumanReplyAtUtc IS NULL AND PauseReason = N'HUMAN_TAKEOVER'
  AND LastHumanOutboundProviderMessageID IS NOT NULL AND PausedAtUtc IS NOT NULL;
GO
IF OBJECT_ID(N'dbo.TblRuntimeInboundReceipt', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.TblRuntimeInboundReceipt (
    BusinessID UNIQUEIDENTIFIER NOT NULL,
    ChannelConnectionID UNIQUEIDENTIFIER NOT NULL,
    ProviderMessageID NVARCHAR(256) NOT NULL,
    CapturedAtUtc DATETIME2 NOT NULL,
    LastReportedAtUtc DATETIME2 NOT NULL CONSTRAINT DF_RuntimeReceipt_Report DEFAULT SYSUTCDATETIME(),
    DeliveryStatus NVARCHAR(16) NOT NULL,
    CONSTRAINT PK_TblRuntimeInboundReceipt PRIMARY KEY(ChannelConnectionID, ProviderMessageID),
    CONSTRAINT FK_RuntimeReceipt_Business FOREIGN KEY(BusinessID) REFERENCES dbo.TblBusiness(BusinessID),
    CONSTRAINT FK_RuntimeReceipt_Channel FOREIGN KEY(ChannelConnectionID) REFERENCES dbo.TblChannelConnection(ChannelConnectionID),
    CONSTRAINT CK_RuntimeReceipt_Status CHECK(DeliveryStatus IN (N'PENDING', N'DELIVERED', N'FAILED', N'QUARANTINED'))
  );
END;
GO
IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.TblRuntimeInboundReceipt') AND name=N'IX_RuntimeReceipt_Business_Captured')
  CREATE INDEX IX_RuntimeReceipt_Business_Captured ON dbo.TblRuntimeInboundReceipt(BusinessID,CapturedAtUtc)
  INCLUDE(DeliveryStatus);
GO
IF OBJECT_ID(N'dbo.TblReliabilityIncident', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.TblReliabilityIncident(
    IncidentID UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_ReliabilityIncident_Id DEFAULT NEWSEQUENTIALID(),
    BusinessID UNIQUEIDENTIFIER NOT NULL,
    IncidentKind NVARCHAR(48) NOT NULL,
    ReferenceKey NVARCHAR(256) NOT NULL,
    ConversationID UNIQUEIDENTIFIER NULL,
    Status NVARCHAR(20) NOT NULL CONSTRAINT DF_ReliabilityIncident_Status DEFAULT N'OPEN',
    DetailCode NVARCHAR(64) NULL,
    DetectedAtUtc DATETIME2 NOT NULL CONSTRAINT DF_ReliabilityIncident_Detected DEFAULT SYSUTCDATETIME(),
    LastSeenAtUtc DATETIME2 NOT NULL CONSTRAINT DF_ReliabilityIncident_Seen DEFAULT SYSUTCDATETIME(),
    ResolvedAtUtc DATETIME2 NULL,
    CONSTRAINT PK_TblReliabilityIncident PRIMARY KEY(IncidentID),
    CONSTRAINT UQ_ReliabilityIncident_Tenant_Kind_Ref UNIQUE(BusinessID,IncidentKind,ReferenceKey),
    CONSTRAINT CK_ReliabilityIncident_Status CHECK(Status IN (N'OPEN', N'RESOLVED')),
    CONSTRAINT FK_ReliabilityIncident_Business FOREIGN KEY(BusinessID) REFERENCES dbo.TblBusiness(BusinessID)
  );
END;
GO
IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.TblReliabilityIncident') AND name=N'IX_ReliabilityIncident_Open')
  CREATE INDEX IX_ReliabilityIncident_Open ON dbo.TblReliabilityIncident(BusinessID,Status,DetectedAtUtc DESC)
  INCLUDE (IncidentKind,ReferenceKey,ConversationID,DetailCode);
GO
