-- Optional mirror: also drop the escalation alert into the bot number's own chat
-- ("Message yourself") so staff watching the business phone see it immediately.

IF COL_LENGTH(N'dbo.TblHumanEscalationSetting', N'NotifyBotSelfEnabled') IS NULL
BEGIN
  ALTER TABLE dbo.TblHumanEscalationSetting ADD
    NotifyBotSelfEnabled BIT NOT NULL
      CONSTRAINT DF_HumanEscalationSetting_NotifyBotSelf DEFAULT (1);
END;
GO
