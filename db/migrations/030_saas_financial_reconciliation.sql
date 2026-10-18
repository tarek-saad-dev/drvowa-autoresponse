-- Read-only financial reconciliation evidence. No financial source tables are changed.
IF OBJECT_ID(N'dbo.TblSaasFinancialReconciliationRun', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.TblSaasFinancialReconciliationRun (
    RunID UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_SaasFinancialReconciliationRun PRIMARY KEY,
    SourceKey NVARCHAR(100) COLLATE Latin1_General_100_BIN2 NOT NULL,
    Status NVARCHAR(32) NOT NULL,
    StartedAtUtc DATETIME2(3) NOT NULL CONSTRAINT DF_SaasReconciliationRun_Started DEFAULT SYSUTCDATETIME(),
    UpdatedAtUtc DATETIME2(3) NOT NULL CONSTRAINT DF_SaasReconciliationRun_Updated DEFAULT SYSUTCDATETIME(),
    CompletedAtUtc DATETIME2(3) NULL,
    AcceptedFromUtc DATETIME2(6) NULL,
    AcceptedBeforeUtc DATETIME2(6) NULL,
    SourceActivatedAtUtc DATETIME2(6) NOT NULL,
    CaptureCutoffAtUtc DATETIME2(6) NOT NULL,
    PageLimit INT NOT NULL,
    PagesRead INT NOT NULL CONSTRAINT DF_SaasReconciliationRun_Pages DEFAULT (0),
    EventsRead INT NOT NULL CONSTRAINT DF_SaasReconciliationRun_Events DEFAULT (0),
    TraversalComplete BIT NOT NULL CONSTRAINT DF_SaasReconciliationRun_Traversal DEFAULT (0),
    NextCursor NVARCHAR(2048) NULL,
    ScanUpperHubEventID VARCHAR(20) NULL,
    HubScanStartedAtUtc DATETIME2(6) NULL,
    ErrorCode NVARCHAR(64) NULL,
    CONSTRAINT CK_SaasReconciliationRun_Status CHECK (Status IN
      (N'SCANNING', N'PAUSED', N'OBSERVED_MATCHES_PROVISIONAL', N'DISCREPANCIES_OBSERVED', N'SCAN_INCOMPLETE')),
    CONSTRAINT CK_SaasReconciliationRun_Window CHECK
      ((AcceptedFromUtc IS NULL AND AcceptedBeforeUtc IS NULL)
       OR (AcceptedFromUtc IS NOT NULL AND AcceptedBeforeUtc IS NOT NULL AND AcceptedFromUtc < AcceptedBeforeUtc)),
    CONSTRAINT CK_SaasReconciliationRun_Counts CHECK (PageLimit BETWEEN 1 AND 500
      AND PagesRead >= 0 AND EventsRead >= 0)
  );
  CREATE UNIQUE INDEX UX_SaasReconciliationRun_OpenSource
    ON dbo.TblSaasFinancialReconciliationRun (SourceKey)
    WHERE Status IN (N'SCANNING', N'PAUSED');
  CREATE INDEX IX_SaasReconciliationRun_SourceStart
    ON dbo.TblSaasFinancialReconciliationRun (SourceKey, StartedAtUtc DESC);
END;
GO

IF OBJECT_ID(N'dbo.TblSaasFinancialReconciliationEvent', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.TblSaasFinancialReconciliationEvent (
    SourceKey NVARCHAR(100) COLLATE Latin1_General_100_BIN2 NOT NULL,
    EventID NVARCHAR(150) COLLATE Latin1_General_100_BIN2 NOT NULL,
    HubEventID VARCHAR(20) NOT NULL,
    EventType NVARCHAR(32) NOT NULL,
    SourcePaymentID NVARCHAR(150) COLLATE Latin1_General_100_BIN2 NULL,
    SourceRefundID NVARCHAR(150) COLLATE Latin1_General_100_BIN2 NULL,
    OriginalSourcePaymentID NVARCHAR(150) COLLATE Latin1_General_100_BIN2 NULL,
    AmountMinor VARCHAR(20) NOT NULL,
    CurrencyCode NVARCHAR(3) NOT NULL,
    OccurredAtUtc DATETIME2(6) NOT NULL,
    AcceptedAtUtc DATETIME2(6) NOT NULL,
    FirstObservedAtUtc DATETIME2(3) NOT NULL CONSTRAINT DF_SaasReconciliationEvent_First DEFAULT SYSUTCDATETIME(),
    LastObservedAtUtc DATETIME2(3) NOT NULL CONSTRAINT DF_SaasReconciliationEvent_Last DEFAULT SYSUTCDATETIME(),
    ObservationCount INT NOT NULL CONSTRAINT DF_SaasReconciliationEvent_Count DEFAULT (1),
    CONSTRAINT PK_SaasFinancialReconciliationEvent PRIMARY KEY (SourceKey, EventID),
    CONSTRAINT UQ_SaasFinancialReconciliationEvent_HubID UNIQUE (SourceKey, HubEventID),
    CONSTRAINT CK_SaasReconciliationEvent_Count CHECK (ObservationCount > 0)
  );
END;
GO

CREATE OR ALTER TRIGGER dbo.TR_SaasFinancialReconciliationEvent_ImmutableFacts
ON dbo.TblSaasFinancialReconciliationEvent AFTER UPDATE
AS
BEGIN
  SET NOCOUNT ON;
  IF UPDATE(SourceKey) OR UPDATE(EventID) OR UPDATE(HubEventID) OR UPDATE(EventType)
    OR UPDATE(SourcePaymentID) OR UPDATE(SourceRefundID) OR UPDATE(OriginalSourcePaymentID)
    OR UPDATE(AmountMinor) OR UPDATE(CurrencyCode) OR UPDATE(OccurredAtUtc)
    OR UPDATE(AcceptedAtUtc) OR UPDATE(FirstObservedAtUtc)
    THROW 51030, 'SaaS reconciliation accepted-event facts are immutable', 1;
END;
GO

IF OBJECT_ID(N'dbo.TblSaasFinancialReconciliationObservation', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.TblSaasFinancialReconciliationObservation (
    RunID UNIQUEIDENTIFIER NOT NULL,
    SourceKey NVARCHAR(100) COLLATE Latin1_General_100_BIN2 NOT NULL,
    EventID NVARCHAR(150) COLLATE Latin1_General_100_BIN2 NOT NULL,
    ObservedAtUtc DATETIME2(3) NOT NULL CONSTRAINT DF_SaasReconciliationObservation_At DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_SaasFinancialReconciliationObservation PRIMARY KEY (RunID, EventID),
    CONSTRAINT FK_SaasReconciliationObservation_Run FOREIGN KEY (RunID)
      REFERENCES dbo.TblSaasFinancialReconciliationRun (RunID),
    CONSTRAINT FK_SaasReconciliationObservation_Event FOREIGN KEY (SourceKey, EventID)
      REFERENCES dbo.TblSaasFinancialReconciliationEvent (SourceKey, EventID)
  );
END;
GO

IF OBJECT_ID(N'dbo.TblSaasFinancialReconciliationCase', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.TblSaasFinancialReconciliationCase (
    CaseID UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_SaasFinancialReconciliationCase PRIMARY KEY,
    SourceKey NVARCHAR(100) COLLATE Latin1_General_100_BIN2 NOT NULL,
    SubjectKey NVARCHAR(150) COLLATE Latin1_General_100_BIN2 NOT NULL,
    Code NVARCHAR(64) NOT NULL,
    InvestigationState NVARCHAR(16) NOT NULL CONSTRAINT DF_SaasReconciliationCase_State DEFAULT N'OPEN',
    FirstObservedAtUtc DATETIME2(3) NOT NULL CONSTRAINT DF_SaasReconciliationCase_First DEFAULT SYSUTCDATETIME(),
    LastObservedAtUtc DATETIME2(3) NOT NULL CONSTRAINT DF_SaasReconciliationCase_Last DEFAULT SYSUTCDATETIME(),
    ObservationCount INT NOT NULL CONSTRAINT DF_SaasReconciliationCase_Count DEFAULT (1),
    CONSTRAINT UQ_SaasFinancialReconciliationCase UNIQUE (SourceKey, SubjectKey, Code),
    CONSTRAINT CK_SaasReconciliationCase_State CHECK (InvestigationState IN (N'OPEN', N'INVESTIGATING', N'RESOLVED'))
  );
END;
GO

IF OBJECT_ID(N'dbo.TblSaasFinancialReconciliationFinding', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.TblSaasFinancialReconciliationFinding (
    RunID UNIQUEIDENTIFIER NOT NULL,
    CaseID UNIQUEIDENTIFIER NOT NULL,
    ObservedAtUtc DATETIME2(3) NOT NULL CONSTRAINT DF_SaasReconciliationFinding_At DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_SaasFinancialReconciliationFinding PRIMARY KEY (RunID, CaseID),
    CONSTRAINT FK_SaasReconciliationFinding_Run FOREIGN KEY (RunID)
      REFERENCES dbo.TblSaasFinancialReconciliationRun (RunID),
    CONSTRAINT FK_SaasReconciliationFinding_Case FOREIGN KEY (CaseID)
      REFERENCES dbo.TblSaasFinancialReconciliationCase (CaseID)
  );
END;
GO
