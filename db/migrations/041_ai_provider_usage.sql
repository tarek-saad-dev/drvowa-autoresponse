-- AI provider usage: one immutable, privacy-minimized row per external inference attempt.
-- This table measures model/provider cost separately from billed plan entitlements.
IF OBJECT_ID(N'dbo.TblAiProviderUsage', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.TblAiProviderUsage (
    UsageID UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_TblAiProviderUsage PRIMARY KEY,
    BusinessID UNIQUEIDENTIFIER NULL,
    Provider NVARCHAR(32) NOT NULL,
    Purpose NVARCHAR(40) NOT NULL,
    Model NVARCHAR(100) NOT NULL,
    Status NVARCHAR(24) NOT NULL,
    ProviderHttpStatus INT NULL,
    PromptTokens INT NULL,
    OutputTokens INT NULL,
    ThinkingTokens INT NULL,
    CachedInputTokens INT NULL,
    TotalTokens INT NULL,
    CostEstimateUsd DECIMAL(19,9) NULL,
    PriceVersion NVARCHAR(40) NULL,
    LatencyMs INT NOT NULL,
    StartedAtUtc DATETIME2(3) NOT NULL,
    CreatedAtUtc DATETIME2(3) NOT NULL CONSTRAINT DF_TblAiProviderUsage_Created DEFAULT SYSUTCDATETIME(),
    CONSTRAINT CK_TblAiProviderUsage_Status CHECK (Status IN (N'SUCCESS',N'PROVIDER_ERROR')),
    CONSTRAINT FK_TblAiProviderUsage_Business FOREIGN KEY (BusinessID) REFERENCES dbo.TblBusiness(BusinessID)
  );
END;
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'IX_TblAiProviderUsage_Time' AND object_id=OBJECT_ID(N'dbo.TblAiProviderUsage'))
  CREATE INDEX IX_TblAiProviderUsage_Time ON dbo.TblAiProviderUsage(StartedAtUtc DESC)
  INCLUDE (BusinessID, Purpose, Provider, Status, CostEstimateUsd);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'IX_TblAiProviderUsage_Business_Time' AND object_id=OBJECT_ID(N'dbo.TblAiProviderUsage'))
  CREATE INDEX IX_TblAiProviderUsage_Business_Time ON dbo.TblAiProviderUsage(BusinessID, StartedAtUtc DESC);
