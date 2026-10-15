-- Audit only confirmed, atomic inactivity resumptions. Stored separately from
-- TblConversationAiState so daily SLA reports keep their history.
IF OBJECT_ID(N'dbo.TblReliabilityHandoffReturn', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.TblReliabilityHandoffReturn (
    HandoffReturnID UNIQUEIDENTIFIER NOT NULL CONSTRAINT DF_HandoffReturn_Id DEFAULT NEWSEQUENTIALID(),
    BusinessID UNIQUEIDENTIFIER NOT NULL,
    ConversationID UNIQUEIDENTIFIER NOT NULL,
    LastHumanReplyAtUtc DATETIME2 NOT NULL,
    ResumedAtUtc DATETIME2 NOT NULL,
    ResumeReason NVARCHAR(32) NOT NULL CONSTRAINT DF_HandoffReturn_Reason DEFAULT N'AUTO_30_MIN',
    CONSTRAINT PK_TblReliabilityHandoffReturn PRIMARY KEY(HandoffReturnID),
    CONSTRAINT UQ_HandoffReturn_Conversation_Reply UNIQUE (BusinessID, ConversationID, LastHumanReplyAtUtc),
    CONSTRAINT FK_HandoffReturn_Business FOREIGN KEY(BusinessID) REFERENCES dbo.TblBusiness(BusinessID),
    CONSTRAINT FK_HandoffReturn_Conversation FOREIGN KEY(ConversationID) REFERENCES dbo.TblConversation(ConversationID)
  );
END;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.TblReliabilityHandoffReturn') AND name=N'IX_HandoffReturn_Business_Resumed')
  CREATE INDEX IX_HandoffReturn_Business_Resumed ON dbo.TblReliabilityHandoffReturn(BusinessID,ResumedAtUtc DESC)
    INCLUDE(LastHumanReplyAtUtc,ResumeReason);
GO
