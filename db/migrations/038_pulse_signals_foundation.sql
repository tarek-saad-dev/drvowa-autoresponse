-- Pulse V1: read-only classification evidence, no customer messaging or financial effects.
IF OBJECT_ID(N'dbo.TblPulseMessageScan', N'U') IS NULL
BEGIN
 CREATE TABLE dbo.TblPulseMessageScan (
   MessageID UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_PulseMessageScan PRIMARY KEY,
   BusinessID UNIQUEIDENTIFIER NOT NULL,
   ConversationID UNIQUEIDENTIFIER NOT NULL,
   MessageAtUtc DATETIME2 NOT NULL,
   SignalCount INT NOT NULL,
   ScanVersion INT NOT NULL CONSTRAINT DF_PulseMessageScan_Version DEFAULT(1),
   ScannedAtUtc DATETIME2 NOT NULL CONSTRAINT DF_PulseMessageScan_Scanned DEFAULT SYSUTCDATETIME(),
   CONSTRAINT FK_PulseMessageScan_Message FOREIGN KEY (MessageID) REFERENCES dbo.TblMessage(MessageID)
 );
END;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.TblPulseMessageScan') AND name=N'IX_PulseScan_Business_Date')
 CREATE INDEX IX_PulseScan_Business_Date ON dbo.TblPulseMessageScan(BusinessID,MessageAtUtc DESC) INCLUDE(SignalCount);
GO
IF OBJECT_ID(N'dbo.TblPulseSignal', N'U') IS NULL
BEGIN
 CREATE TABLE dbo.TblPulseSignal (
   SignalID UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_PulseSignal_ID DEFAULT NEWSEQUENTIALID(),
   BusinessID UNIQUEIDENTIFIER NOT NULL,
   ConversationID UNIQUEIDENTIFIER NOT NULL,
   MessageID UNIQUEIDENTIFIER NOT NULL,
   Intent NVARCHAR(40) NOT NULL,
   Priority NVARCHAR(20) NOT NULL,
   ActionType NVARCHAR(32) NULL,
   Confidence TINYINT NOT NULL,
   Evidence NVARCHAR(280) NOT NULL,
   MessageAtUtc DATETIME2 NOT NULL,
   ReviewStatus NVARCHAR(20) NOT NULL CONSTRAINT DF_PulseSignal_Review DEFAULT(N'OPEN'),
   ReviewedAtUtc DATETIME2 NULL,
   CreatedAtUtc DATETIME2 NOT NULL CONSTRAINT DF_PulseSignal_Created DEFAULT SYSUTCDATETIME(),
   CONSTRAINT PK_TblPulseSignal PRIMARY KEY(SignalID),
   CONSTRAINT UQ_PulseSignal_MessageIntent UNIQUE(MessageID,Intent),
   CONSTRAINT CK_PulseSignal_Priority CHECK(Priority IN(N'URGENT',N'NORMAL')),
   CONSTRAINT CK_PulseSignal_Review CHECK(ReviewStatus IN(N'OPEN',N'REVIEWED')),
   CONSTRAINT CK_PulseSignal_Confidence CHECK(Confidence BETWEEN 0 AND 100),
   CONSTRAINT FK_PulseSignal_Message FOREIGN KEY(MessageID) REFERENCES dbo.TblMessage(MessageID)
 );
END;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.TblPulseSignal') AND name=N'IX_PulseSignal_Business_Date')
 CREATE INDEX IX_PulseSignal_Business_Date ON dbo.TblPulseSignal(BusinessID,MessageAtUtc DESC) INCLUDE(Intent,ActionType,Confidence,ConversationID);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.TblPulseSignal') AND name=N'IX_PulseSignal_Review')
 CREATE INDEX IX_PulseSignal_Review ON dbo.TblPulseSignal(BusinessID,ReviewStatus,MessageAtUtc DESC) INCLUDE(ConversationID,Intent,Priority,ActionType);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.TblMessage') AND name=N'IX_TblMessage_PulseScan')
 CREATE INDEX IX_TblMessage_PulseScan ON dbo.TblMessage(ReceivedAtUtc DESC,MessageID)
 INCLUDE(BusinessID,ConversationID,ContentType,IsHistorical)
 WHERE Direction=N'INBOUND';
GO
