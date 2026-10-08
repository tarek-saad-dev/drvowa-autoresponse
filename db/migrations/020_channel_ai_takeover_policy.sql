-- Configurable human takeover resume policy per WhatsApp AI channel.

IF COL_LENGTH(N'dbo.TblChannelAiSetting', N'HumanTakeoverResumePolicy') IS NULL
BEGIN
  ALTER TABLE dbo.TblChannelAiSetting
    ADD HumanTakeoverResumePolicy NVARCHAR(32) NULL;

  UPDATE dbo.TblChannelAiSetting
  SET HumanTakeoverResumePolicy = N'AFTER_120_MIN'
  WHERE HumanTakeoverResumePolicy IS NULL;

  ALTER TABLE dbo.TblChannelAiSetting
    ALTER COLUMN HumanTakeoverResumePolicy NVARCHAR(32) NOT NULL;

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
