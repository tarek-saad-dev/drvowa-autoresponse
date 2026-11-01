import { query, sql } from "@/lib/db";

export type ReplyAddonBalance = {
  availableReplies: number;
  nearestExpiryUtc: Date | null;
  activeLots: number;
};

/** Read-only derived balance; expired lots excluded, no user supplied amounts. */
export async function getReplyAddonBalance(businessId: string): Promise<ReplyAddonBalance> {
  if (process.env.NODE_ENV === "production" ||
      process.env.DRVO_PRICING_V1_ADDON_DRAFTS !== "true") {
    return { availableReplies: 0, nearestExpiryUtc: null, activeLots: 0 };
  }
  const result = await query<{
    AvailableReplies: number; NearestExpiryUtc: Date | null; ActiveLots: number;
  }>(
    `SELECT COALESCE(SUM(CAST(RemainingQuantity AS BIGINT)),0) AS AvailableReplies,
      MIN(ExpiresAtUtc) AS NearestExpiryUtc,
      COUNT_BIG(*) AS ActiveLots
     FROM dbo.TblPricingAddonEntitlement
     WHERE BusinessID=@businessId AND Unit=N'ai_reply'
       AND RemainingQuantity>0 AND ExpiresAtUtc>SYSUTCDATETIME()`,
    [{name:"businessId",type:sql.UniqueIdentifier,value:businessId}],
  );
  const row=result.recordset[0];
  return { availableReplies:Number(row?.AvailableReplies??0),
    nearestExpiryUtc:row?.NearestExpiryUtc??null,
    activeLots:Number(row?.ActiveLots??0) };
}
