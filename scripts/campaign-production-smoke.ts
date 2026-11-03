/**
 * Production release gate for campaign data model.
 * Read-only. Never constructs a campaign, reveals phone numbers or sends.
 */
import { closePool, query } from "../src/lib/db";

async function main() {
  const rows = await query<{
    Permissions:number; OptOuts:number; Plans:number; Runs:number;
    Pending:number; InFlight:number; Unknown:number;
  }>(
    `SELECT
       (SELECT COUNT(*) FROM dbo.TblWhatsAppCampaignPermission) AS Permissions,
       (SELECT COUNT(*) FROM dbo.TblWhatsAppCampaignOptOut) AS OptOuts,
       (SELECT COUNT(*) FROM dbo.TblWhatsAppCampaignPreflight) AS Plans,
       (SELECT COUNT(*) FROM dbo.TblWhatsAppCampaignRun) AS Runs,
       (SELECT COUNT(*) FROM dbo.TblWhatsAppCampaignRunItem
          WHERE Status=N'PENDING') AS Pending,
       (SELECT COUNT(*) FROM dbo.TblWhatsAppCampaignRunItem
          WHERE Status=N'IN_FLIGHT') AS InFlight,
       (SELECT COUNT(*) FROM dbo.TblWhatsAppCampaignRunItem
          WHERE Status=N'UNKNOWN') AS Unknown`,
  );
  const result = rows.recordset[0];
  if (!result) throw new Error("CAMPAIGN_SCHEMA_NOT_READY");
  const active = process.env.DRVO_LABEL_CAMPAIGNS_SEND_ENABLED === "true";
  console.info("[campaign-smoke] PASS", {
    schemaReady: true, dryReadOnly: true, sendFeatureEnabled: active,
    explicitPermissionCount: Number(result.Permissions),
    stoppedCount: Number(result.OptOuts),
    preflights: Number(result.Plans),
    runs: Number(result.Runs),
    pending: Number(result.Pending), inFlight: Number(result.InFlight),
    unknown: Number(result.Unknown),
  });
}

main().catch(error => {
  console.error("[campaign-smoke] FAIL", {
    code: error instanceof Error ? error.name : "UNKNOWN",
  });
  process.exitCode=1;
}).finally(async()=>{await closePool();});
