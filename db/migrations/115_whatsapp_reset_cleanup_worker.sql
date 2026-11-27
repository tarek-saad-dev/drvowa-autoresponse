IF COL_LENGTH(N'dbo.TblWhatsAppWorkspaceReset',N'CleanupAttemptAtUtc') IS NULL
 ALTER TABLE dbo.TblWhatsAppWorkspaceReset ADD CleanupAttemptAtUtc datetime2 NULL;
GO
