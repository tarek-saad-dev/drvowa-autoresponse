-- Existing saved preferences are not consent to automated deletion.
IF COL_LENGTH(N'dbo.TblWhatsAppRetentionPreference',N'AutomaticEnabledAtUtc') IS NULL
 ALTER TABLE dbo.TblWhatsAppRetentionPreference ADD AutomaticEnabledAtUtc datetime2 NULL;
GO
IF COL_LENGTH(N'dbo.TblWhatsAppRetentionPreference',N'CleanupAttemptAtUtc') IS NULL
 ALTER TABLE dbo.TblWhatsAppRetentionPreference ADD CleanupAttemptAtUtc datetime2 NULL;
GO
