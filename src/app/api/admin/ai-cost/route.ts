import { handleApiError, jsonOk } from "@/lib/api/http";
import { query } from "@/lib/db";
import { requirePlatformAdmin } from "@/modules/platform-admin/service";

/** Platform admin only; no prompt text, customer numbers or API keys. */
export async function GET() {
  try {
    await requirePlatformAdmin();
    const result = await query<{
      BusinessID: string | null;
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
    }>(`
      SELECT BusinessID, Provider, Purpose, Model,
        COUNT(*) AS Requests,
        SUM(CASE WHEN Status=N'SUCCESS' THEN 1 ELSE 0 END) AS Successful,
        SUM(CASE WHEN CostEstimateUsd IS NULL THEN 1 ELSE 0 END) AS Unpriced,
        SUM(CONVERT(BIGINT, COALESCE(PromptTokens,0))) AS InputTokens,
        SUM(CONVERT(BIGINT, COALESCE(OutputTokens,0))) AS OutputTokens,
        SUM(CONVERT(BIGINT, COALESCE(ThinkingTokens,0))) AS ThinkingTokens,
        SUM(CONVERT(BIGINT, COALESCE(CachedInputTokens,0))) AS CachedTokens,
        SUM(COALESCE(CostEstimateUsd, CONVERT(DECIMAL(19,9),0))) AS EstimatedUsd
      FROM dbo.TblAiProviderUsage
      WHERE StartedAtUtc >= DATEADD(day,-30,SYSUTCDATETIME())
      GROUP BY BusinessID, Provider, Purpose, Model
      ORDER BY EstimatedUsd DESC
    `);
    return jsonOk({
      periodDays: 30,
      currency: "USD",
      warning: "Estimated STANDARD Gemini text rates, not invoiced charges. Null-priced attempts excluded; unpriced count is reported. Voice cost is unavailable.",
      rows: result.recordset,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
