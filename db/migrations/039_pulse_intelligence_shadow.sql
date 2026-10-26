-- Shadow-only AI review. Never inserts actionable TblPulseSignal automatically.
IF OBJECT_ID(N'dbo.TblPulseAiAssessment',N'U') IS NULL
BEGIN
 CREATE TABLE dbo.TblPulseAiAssessment (
   MessageID UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
   BusinessID UNIQUEIDENTIFIER NOT NULL,
   ConversationID UNIQUEIDENTIFIER NOT NULL,
   Model NVARCHAR(100) NOT NULL,
   Status NVARCHAR(24) NOT NULL,
   Intent NVARCHAR(40) NULL,
   Confidence TINYINT NULL,
   Evidence NVARCHAR(280) NULL,
   Disagreement BIT NULL,
   ReviewedAtUtc DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
   CONSTRAINT CK_PulseAiAssessment_Status CHECK(Status IN(N'COMPLETE',N'UNCERTAIN',N'FAILED')),
   CONSTRAINT CK_PulseAiAssessment_Confidence CHECK(Confidence BETWEEN 0 AND 100)
 );
END;
GO
IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'dbo.TblPulseAiAssessment') AND name=N'IX_PulseAiAssessment_Business')
 CREATE INDEX IX_PulseAiAssessment_Business ON dbo.TblPulseAiAssessment(BusinessID,ReviewedAtUtc DESC) INCLUDE(Status,Disagreement);
GO
