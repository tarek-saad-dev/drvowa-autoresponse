import { query, sql } from "@/lib/db";
import { evaluateFreeTrial } from "./free-trial-policy";

export type FreeTrialUsage = { remaining: number; used: number; expiresAtUtc: Date; expired: boolean };

/** Read-only; only enrolled FREE tenants. Legacy tenants return null. */
export async function getV1FreeTrialUsage(businessId: string): Promise<FreeTrialUsage | null> {
  if (process.env.DRVO_PRICING_V1_FREE_TRIAL !== "true") return null;
  const result = await query<{ FirstActivatedAtUtc: Date; Used: number }>(
    `SELECT t.FirstActivatedAtUtc,
       (SELECT COALESCE(SUM(CAST(r.Quantity AS BIGINT)), 0)
        FROM dbo.TblUsageReservation r
        WHERE r.BusinessID=t.BusinessID AND r.EventType=N'AI_REPLY_GENERATED'
          AND r.State IN (N'RESERVED', N'CONSUMED', N'UNCERTAIN')) AS Used
      FROM dbo.TblPricingFreeTrial t WHERE t.BusinessID=@businessId`,
    [{ name: "businessId", type: sql.UniqueIdentifier, value: businessId }],
  );
  const row = result.recordset[0];
  if (!row) return null;
  const start = new Date(row.FirstActivatedAtUtc);
  const used = Number(row.Used);
  const state = evaluateFreeTrial(start, new Date(), used);
  return { remaining: state.remaining, used, expired: state.expired, expiresAtUtc: new Date(start.getTime() + 7 * 86400000) };
}
