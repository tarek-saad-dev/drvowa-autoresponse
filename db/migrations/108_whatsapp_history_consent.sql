-- Existing rows remain NULL; new channel rows default to fresh.
IF COL_LENGTH(N'dbo.TblChannelConnection', N'WhatsAppHistoryImportEnabled') IS NULL
BEGIN
  ALTER TABLE dbo.TblChannelConnection ADD WhatsAppHistoryImportEnabled bit NULL
    CONSTRAINT DF_TblChannelConnection_WhatsAppHistoryImportEnabled DEFAULT (0);
END;
GO
