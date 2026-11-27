-- V7 is the default for new channel records. Never migrate assigned sessions.
DECLARE @defaultName sysname;
SELECT @defaultName = dc.name
FROM sys.default_constraints dc
JOIN sys.columns c ON c.object_id = dc.parent_object_id
 AND c.column_id = dc.parent_column_id
WHERE dc.parent_object_id = OBJECT_ID(N'dbo.TblChannelConnection')
 AND c.name = N'RuntimeEngine';

IF @defaultName IS NOT NULL
BEGIN
  DECLARE @drop nvarchar(max) = N'ALTER TABLE dbo.TblChannelConnection DROP CONSTRAINT ' + QUOTENAME(@defaultName);
  EXEC sys.sp_executesql @drop;
END;

ALTER TABLE dbo.TblChannelConnection ADD CONSTRAINT DF_TblChannelConnection_RuntimeEngine
 DEFAULT (N'BAILEYS_V7') FOR RuntimeEngine;
GO

-- A shell without an account key has no runtime owner to migrate.
UPDATE dbo.TblChannelConnection
SET RuntimeEngine = N'BAILEYS_V7', UpdatedAtUtc = SYSUTCDATETIME()
WHERE Channel = N'WHATSAPP' AND Provider = N'BAILEYS'
  AND ExternalAccountKey IS NULL
  AND IsActive = 0
  AND Status IN (N'PENDING', N'DISCONNECTED')
  AND RuntimeEngine = N'BAILEYS_V6';
GO
