-- Independent AI worker process liveness (not per-job lease heartbeats).
-- A single primary row is enough for the current single-worker deployment model.
IF OBJECT_ID(N'dbo.TblAiWorkerLiveness', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.TblAiWorkerLiveness (
    LivenessKey NVARCHAR(32) NOT NULL
      CONSTRAINT PK_TblAiWorkerLiveness PRIMARY KEY,
    WorkerId NVARCHAR(128) NOT NULL,
    LastHeartbeatAtUtc DATETIME2 NOT NULL
      CONSTRAINT DF_AiWorkerLiveness_Heartbeat DEFAULT SYSUTCDATETIME(),
    UpdatedAtUtc DATETIME2 NOT NULL
      CONSTRAINT DF_AiWorkerLiveness_Updated DEFAULT SYSUTCDATETIME()
  );
END;
GO
