import { query } from "@/lib/db";

export type AiCostReportRow = {
  BusinessID: string | null;
  BusinessName: string;
  Provider: string;
  Purpose: string;
  Model: string;
  Requests: number;
  Successful: number;
  Unpriced: number;
  InputTokens: number;
  OutputTokens: number;
  ThinkingTokens: number;
  CachedTokens: number;
  EstimatedUsd: number;
};

/** Admin reporting only. Raw messages and API keys never enter this table. */
export async function getAdminAiCostReport(days = 30): Promise<AiCostReportRow[]> {
  const safeDays = Math.min(90, Math.max(1, Math.trunc(days)));
  const result = await query<AiCostReportRow>(`
    SELECT u.BusinessID,
      COALESCE(b.Name,N'غير مرتبط بنشاط') AS BusinessName,
      u.Provider, u.Purpose, u.Model,
      COUNT(*) AS Requests,
      SUM(CASE WHEN u.Status=N'SUCCESS' THEN 1 ELSE 0 END) AS Successful,
      SUM(CASE WHEN u.CostEstimateUsd IS NULL THEN 1 ELSE 0 END) AS Unpriced,
      SUM(CONVERT(BIGINT,COALESCE(u.PromptTokens,0))) AS InputTokens,
      SUM(CONVERT(BIGINT,COALESCE(u.OutputTokens,0))) AS OutputTokens,
      SUM(CONVERT(BIGINT,COALESCE(u.ThinkingTokens,0))) AS ThinkingTokens,
      SUM(CONVERT(BIGINT,COALESCE(u.CachedInputTokens,0))) AS CachedTokens,
      SUM(COALESCE(u.CostEstimateUsd,CONVERT(DECIMAL(19,9),0))) AS EstimatedUsd
    FROM dbo.TblAiProviderUsage u
    LEFT JOIN dbo.TblBusiness b ON b.BusinessID=u.BusinessID
    WHERE u.StartedAtUtc >= DATEADD(DAY,-${safeDays},SYSUTCDATETIME())
    GROUP BY u.BusinessID,b.Name,u.Provider,u.Purpose,u.Model
    ORDER BY EstimatedUsd DESC
  `);
  return result.recordset;
}
