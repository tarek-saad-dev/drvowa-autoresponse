-- Phase 1 WhatsApp compatibility observation (diagnostics only — no auto engine switch)

IF COL_LENGTH(N'dbo.TblChannelConnection', N'CompatibilityStatus') IS NULL
BEGIN
  ALTER TABLE dbo.TblChannelConnection
    ADD CompatibilityStatus NVARCHAR(32) NULL;
END;
GO

IF COL_LENGTH(N'dbo.TblChannelConnection', N'CompatibilityReason') IS NULL
BEGIN
  ALTER TABLE dbo.TblChannelConnection
    ADD CompatibilityReason NVARCHAR(128) NULL;
END;
GO

IF COL_LENGTH(N'dbo.TblChannelConnection', N'CompatibilityUpdatedAt') IS NULL
BEGIN
  ALTER TABLE dbo.TblChannelConnection
    ADD CompatibilityUpdatedAt DATETIME2 NULL;
END;
GO

IF COL_LENGTH(N'dbo.TblChannelConnection', N'RecommendedRuntimeEngine') IS NULL
BEGIN
  ALTER TABLE dbo.TblChannelConnection
    ADD RecommendedRuntimeEngine NVARCHAR(32) NULL;
END;
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.check_constraints
  WHERE name = N'CK_TblChannelConnection_CompatibilityStatus'
    AND parent_object_id = OBJECT_ID(N'dbo.TblChannelConnection')
)
BEGIN
  ALTER TABLE dbo.TblChannelConnection
    ADD CONSTRAINT CK_TblChannelConnection_CompatibilityStatus
    CHECK (
      CompatibilityStatus IS NULL
      OR CompatibilityStatus IN (
        N'UNKNOWN', N'HEALTHY', N'SUSPECT', N'DEGRADED_CRYPTO'
      )
    );
END;
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.check_constraints
  WHERE name = N'CK_TblChannelConnection_RecommendedRuntimeEngine'
    AND parent_object_id = OBJECT_ID(N'dbo.TblChannelConnection')
)
BEGIN
  ALTER TABLE dbo.TblChannelConnection
    ADD CONSTRAINT CK_TblChannelConnection_RecommendedRuntimeEngine
    CHECK (
      RecommendedRuntimeEngine IS NULL
      OR RecommendedRuntimeEngine IN (N'BAILEYS_V6', N'BAILEYS_V7')
    );
END;
GO
