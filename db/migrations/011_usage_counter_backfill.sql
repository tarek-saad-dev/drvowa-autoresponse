-- Backfill TblUsagePeriodCounter from immutable TblUsageEvent history.
-- INSERT MISSING ROWS ONLY. Never overwrite / add into existing counter rows
-- (existing counters may include RESERVED/UNCERTAIN commitments).

;WITH monthly AS (
  SELECT
    e.BusinessID,
    e.EventType,
    DATETIMEFROMPARTS(
      YEAR(e.OccurredAtUtc),
      MONTH(e.OccurredAtUtc),
      1, 0, 0, 0, 0
    ) AS PeriodStartUtc,
    SUM(CAST(e.Quantity AS INT)) AS Quantity
  FROM dbo.TblUsageEvent AS e
  WHERE e.EventType IN (N'AI_REPLY_GENERATED', N'WHATSAPP_OUTBOUND_MESSAGE')
  GROUP BY
    e.BusinessID,
    e.EventType,
    YEAR(e.OccurredAtUtc),
    MONTH(e.OccurredAtUtc)
)
INSERT INTO dbo.TblUsagePeriodCounter (
  BusinessID,
  EventType,
  PeriodStartUtc,
  Quantity,
  UpdatedAtUtc
)
SELECT
  m.BusinessID,
  m.EventType,
  m.PeriodStartUtc,
  m.Quantity,
  SYSUTCDATETIME()
FROM monthly AS m
WHERE NOT EXISTS (
  SELECT 1
  FROM dbo.TblUsagePeriodCounter AS c
  WHERE c.BusinessID = m.BusinessID
    AND c.EventType = m.EventType
    AND c.PeriodStartUtc = m.PeriodStartUtc
);
GO
