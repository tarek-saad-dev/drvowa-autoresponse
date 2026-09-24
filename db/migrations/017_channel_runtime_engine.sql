-- Selective Baileys runtime engine (V6 default, V7 opt-in per connection)
-- Backward compatible: existing rows default to BAILEYS_V6.

IF COL_LENGTH(N'dbo.TblChannelConnection', N'RuntimeEngine') IS NULL
BEGIN
  ALTER TABLE dbo.TblChannelConnection
    ADD RuntimeEngine NVARCHAR(32) NOT NULL
      CONSTRAINT DF_TblChannelConnection_RuntimeEngine DEFAULT (N'BAILEYS_V6');
END;
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.check_constraints
  WHERE name = N'CK_TblChannelConnection_RuntimeEngine'
    AND parent_object_id = OBJECT_ID(N'dbo.TblChannelConnection')
)
BEGIN
  ALTER TABLE dbo.TblChannelConnection
    ADD CONSTRAINT CK_TblChannelConnection_RuntimeEngine
    CHECK (RuntimeEngine IN (N'BAILEYS_V6', N'BAILEYS_V7'));
END;
GO

-- Cut Salon proven v7 account only
UPDATE dbo.TblChannelConnection
SET RuntimeEngine = N'BAILEYS_V7',
    UpdatedAtUtc = SYSUTCDATETIME()
WHERE Channel = N'WHATSAPP'
  AND Provider = N'BAILEYS'
  AND ExternalAccountKey = N'wa_f09d54055f079b2624800b46';
GO
