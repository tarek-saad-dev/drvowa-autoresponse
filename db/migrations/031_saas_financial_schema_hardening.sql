-- Additive hardening for potentially applied migrations 029 and 030.
-- Preserve their history: the migration runner applies this file in one transaction.
-- Operational retention is indefinite until a separately reviewed archival policy exists.
IF OBJECT_ID(N'dbo.TblSaasFinancialOutbox', N'U') IS NULL
  OR OBJECT_ID(N'dbo.TblSaasFinancialReconciliationRun', N'U') IS NULL
  OR OBJECT_ID(N'dbo.TblSaasFinancialReconciliationEvent', N'U') IS NULL
  OR OBJECT_ID(N'dbo.TblSaasFinancialReconciliationObservation', N'U') IS NULL
  OR OBJECT_ID(N'dbo.TblSaasFinancialReconciliationCase', N'U') IS NULL
  OR OBJECT_ID(N'dbo.TblSaasFinancialReconciliationFinding', N'U') IS NULL
  THROW 51031, 'Financial migrations 029 and 030 must exist before 031', 1;

IF NOT EXISTS (
  SELECT 1 FROM sys.key_constraints
  WHERE parent_object_id = OBJECT_ID(N'dbo.TblSaasFinancialOutbox')
    AND name = N'UQ_TblSaasFinancialOutbox_SourcePaymentEvent'
)
  THROW 51031, 'Expected outbox source uniqueness constraint is missing', 1;

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID(N'dbo.TblSaasFinancialOutbox')
    AND name = N'SourceKey' AND system_type_id = 231
    AND max_length = 200 AND is_nullable = 0
)
  THROW 51031, 'Unexpected outbox SourceKey shape', 1;

IF (
  SELECT COUNT(*) FROM sys.columns c
  JOIN sys.tables t ON t.object_id = c.object_id
  WHERE t.schema_id = SCHEMA_ID(N'dbo')
    AND t.name IN (N'TblSaasFinancialReconciliationRun',
      N'TblSaasFinancialReconciliationEvent',
      N'TblSaasFinancialReconciliationObservation',
      N'TblSaasFinancialReconciliationCase')
    AND c.name = N'SourceKey' AND c.collation_name = N'Latin1_General_100_BIN2'
    AND c.system_type_id = 231 AND c.max_length = 200 AND c.is_nullable = 0
) <> 4
  THROW 51031, 'Unexpected reconciliation SourceKey collation or shape', 1;

-- The old unique key inherits the database collation. Remove only that key while
-- changing the column, then restore the same unique key under binary collation.
-- Any unexpected dependent object makes ALTER COLUMN fail and rolls back 031.
IF EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID(N'dbo.TblSaasFinancialOutbox')
    AND name = N'SourceKey'
    AND collation_name <> N'Latin1_General_100_BIN2'
)
BEGIN
  ALTER TABLE dbo.TblSaasFinancialOutbox
    DROP CONSTRAINT UQ_TblSaasFinancialOutbox_SourcePaymentEvent;
  ALTER TABLE dbo.TblSaasFinancialOutbox
    ALTER COLUMN SourceKey NVARCHAR(100) COLLATE Latin1_General_100_BIN2 NOT NULL;
  ALTER TABLE dbo.TblSaasFinancialOutbox
    ADD CONSTRAINT UQ_TblSaasFinancialOutbox_SourcePaymentEvent
      UNIQUE (SourceKey, SourcePaymentID, EventType);
END;

-- A run and an accepted event must both match the observation's binary SourceKey.
IF EXISTS (
  SELECT 1 FROM dbo.TblSaasFinancialReconciliationObservation o
  JOIN dbo.TblSaasFinancialReconciliationRun r ON r.RunID = o.RunID
  WHERE o.SourceKey <> r.SourceKey
)
  THROW 51031, 'Existing reconciliation observation crosses sources', 1;

ALTER TABLE dbo.TblSaasFinancialReconciliationRun
  ADD CONSTRAINT UQ_SaasFinancialReconciliationRun_ID_Source UNIQUE (RunID, SourceKey);
ALTER TABLE dbo.TblSaasFinancialReconciliationObservation WITH CHECK
  ADD CONSTRAINT FK_SaasReconciliationObservation_RunSource
    FOREIGN KEY (RunID, SourceKey)
    REFERENCES dbo.TblSaasFinancialReconciliationRun (RunID, SourceKey);

-- Findings also join a run to a source-scoped case. Carry the source through
-- both composite foreign keys so this second evidence link cannot cross sources.
IF EXISTS (
  SELECT 1 FROM dbo.TblSaasFinancialReconciliationFinding f
  JOIN dbo.TblSaasFinancialReconciliationRun r ON r.RunID = f.RunID
  JOIN dbo.TblSaasFinancialReconciliationCase c ON c.CaseID = f.CaseID
  WHERE r.SourceKey <> c.SourceKey
)
  THROW 51031, 'Existing reconciliation finding crosses sources', 1;

ALTER TABLE dbo.TblSaasFinancialReconciliationFinding
  ADD SourceKey NVARCHAR(100) COLLATE Latin1_General_100_BIN2 NULL;
GO

-- Compile this UPDATE after the new column exists; the migration transaction
-- spans GO batches in db-migrate.ts.
UPDATE f SET SourceKey = r.SourceKey
FROM dbo.TblSaasFinancialReconciliationFinding f
JOIN dbo.TblSaasFinancialReconciliationRun r ON r.RunID = f.RunID;
ALTER TABLE dbo.TblSaasFinancialReconciliationFinding
  ALTER COLUMN SourceKey NVARCHAR(100) COLLATE Latin1_General_100_BIN2 NOT NULL;
ALTER TABLE dbo.TblSaasFinancialReconciliationCase
  ADD CONSTRAINT UQ_SaasFinancialReconciliationCase_ID_Source UNIQUE (CaseID, SourceKey);
ALTER TABLE dbo.TblSaasFinancialReconciliationFinding WITH CHECK
  ADD CONSTRAINT FK_SaasReconciliationFinding_RunSource
    FOREIGN KEY (RunID, SourceKey)
    REFERENCES dbo.TblSaasFinancialReconciliationRun (RunID, SourceKey);
ALTER TABLE dbo.TblSaasFinancialReconciliationFinding WITH CHECK
  ADD CONSTRAINT FK_SaasReconciliationFinding_CaseSource
    FOREIGN KEY (CaseID, SourceKey)
    REFERENCES dbo.TblSaasFinancialReconciliationCase (CaseID, SourceKey);
GO

-- AFTER DELETE has no effect on the worker's UPDATE-based claim, retry, and ack.
-- It rejects row removal, including multi-row DELETE. Restrict table ALTER
-- permission separately: TRUNCATE does not fire DML triggers in SQL Server.
CREATE OR ALTER TRIGGER dbo.TR_TblSaasFinancialOutbox_NoDelete
ON dbo.TblSaasFinancialOutbox AFTER DELETE
AS
BEGIN
  SET NOCOUNT ON;
  IF EXISTS (SELECT 1 FROM deleted)
    THROW 51031, 'SaaS financial outbox evidence cannot be deleted', 1;
END;
GO

CREATE OR ALTER TRIGGER dbo.TR_SaasFinancialReconciliationRun_NoDelete
ON dbo.TblSaasFinancialReconciliationRun AFTER DELETE
AS
BEGIN
  SET NOCOUNT ON;
  IF EXISTS (SELECT 1 FROM deleted)
    THROW 51031, 'SaaS financial reconciliation runs cannot be deleted', 1;
END;
GO

CREATE OR ALTER TRIGGER dbo.TR_SaasFinancialReconciliationEvent_NoDelete
ON dbo.TblSaasFinancialReconciliationEvent AFTER DELETE
AS
BEGIN
  SET NOCOUNT ON;
  IF EXISTS (SELECT 1 FROM deleted)
    THROW 51031, 'SaaS financial reconciliation events cannot be deleted', 1;
END;
GO

CREATE OR ALTER TRIGGER dbo.TR_SaasFinancialReconciliationObservation_NoDelete
ON dbo.TblSaasFinancialReconciliationObservation AFTER DELETE
AS
BEGIN
  SET NOCOUNT ON;
  IF EXISTS (SELECT 1 FROM deleted)
    THROW 51031, 'SaaS financial reconciliation observations cannot be deleted', 1;
END;
GO

CREATE OR ALTER TRIGGER dbo.TR_SaasFinancialReconciliationCase_NoDelete
ON dbo.TblSaasFinancialReconciliationCase AFTER DELETE
AS
BEGIN
  SET NOCOUNT ON;
  IF EXISTS (SELECT 1 FROM deleted)
    THROW 51031, 'SaaS financial reconciliation cases cannot be deleted', 1;
END;
GO

CREATE OR ALTER TRIGGER dbo.TR_SaasFinancialReconciliationFinding_NoDelete
ON dbo.TblSaasFinancialReconciliationFinding AFTER DELETE
AS
BEGIN
  SET NOCOUNT ON;
  IF EXISTS (SELECT 1 FROM deleted)
    THROW 51031, 'SaaS financial reconciliation findings cannot be deleted', 1;
END;
GO
