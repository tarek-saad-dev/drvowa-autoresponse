-- Configurable human takeover resume policy per WhatsApp AI channel.
-- Each ALTER/UPDATE is in a separate batch because SQL Server compiles column
-- references before executing an ALTER ADD in the same batch.

IF COL_LENGTH(N'dbo.TblChannelAiSetting', N'HumanTakeoverResumePolicy') IS NULL
BEGIN
  ALTER TABLE dbo.TblChannelAiSetting
    ADD HumanTakeoverResumePolicy NVARCHAR(32) NULL;
END;
GO

UPDATE dbo.TblChannelAiSetting
SET HumanTakeoverResumePolicy = N'AFTER_120_MIN'
WHERE HumanTakeoverResumePolicy IS NULL;
GO

IF EXISTS (
  SELECT 1
  FROM sys.columns
  WHERE object_id = OBJECT_ID(N'dbo.TblChannelAiSetting')
    AND name = N'HumanTakeoverResumePolicy'
    AND is_nullable = 1
)
BEGIN
  ALTER TABLE dbo.TblChannelAiSetting
    ALTER COLUMN HumanTakeoverResumePolicy NVARCHAR(32) NOT NULL;
END;
GO

IF NOT EXISTS (
  SELECT 1
  FROM sys.default_constraints dc
  INNER JOIN sys.columns c
    ON c.object_id = dc.parent_object_id
   AND c.column_id = dc.parent_column_id
  WHERE dc.parent_object_id = OBJECT_ID(N'dbo.TblChannelAiSetting')
    AND c.name = N'HumanTakeoverResumePolicy'
)
BEGIN
  ALTER TABLE dbo.TblChannelAiSetting
    ADD CONSTRAINT DF_TblChannelAiSetting_HumanTakeoverResumePolicy
    DEFAULT (N'AFTER_120_MIN') FOR HumanTakeoverResumePolicy;
END;
GO

IF NOT EXISTS (
  SELECT 1
  FROM sys.check_constraints
  WHERE name = N'CK_TblChannelAiSetting_HumanTakeoverResumePolicy'
)
BEGIN
  ALTER TABLE dbo.TblChannelAiSetting
    ADD CONSTRAINT CK_TblChannelAiSetting_HumanTakeoverResumePolicy
    CHECK (
      HumanTakeoverResumePolicy IN (
        N'AFTER_30_MIN',
        N'AFTER_60_MIN',
        N'AFTER_120_MIN',
        N'AFTER_240_MIN',
        N'END_OF_DAY',
        N'MANUAL'
      )
    );
END;
GO
