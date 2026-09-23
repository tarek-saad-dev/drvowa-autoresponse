-- Additive fence for knowledge ingest analysis concurrency.
-- Safe if 015 already created AnalysisVersion; no-op otherwise.

IF OBJECT_ID(N'dbo.TblKnowledgeIngestSession', N'U') IS NOT NULL
  AND COL_LENGTH(N'dbo.TblKnowledgeIngestSession', N'AnalysisVersion') IS NULL
BEGIN
  ALTER TABLE dbo.TblKnowledgeIngestSession
    ADD AnalysisVersion BIGINT NOT NULL
      CONSTRAINT DF_TblKnowledgeIngestSession_AnalysisVersion DEFAULT (0);
END;
GO
