/**
 * Operator diagnostic: receptionist operational health for one business name.
 * Never prints message bodies, tokens, or full account keys.
 *
 * Usage: npx tsx scripts/diagnose-receptionist-health.ts "شركة الاخوه للعقارات"
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { closePool, getPool, query, sql } from "../src/lib/db";
import { getReceptionistOperationalHealth } from "../src/modules/ai/operational-health";
import { getWhatsAppAiSetting } from "../src/modules/ai";
import { listAgents } from "../src/modules/agents/service";
import { listItems } from "../src/modules/knowledge/service";
import { deriveReceptionistStatus } from "../src/lib/dashboard/receptionist-status";

function loadDotEnvIfPresent(): void {
  for (const name of [".env.local", ".env"]) {
    const envPath = resolve(process.cwd(), name);
    if (!existsSync(envPath)) continue;
    for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"'))
        || (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = value;
    }
  }
}

async function main(): Promise<void> {
  loadDotEnvIfPresent();
  const nameQuery = process.argv[2]?.trim();
  if (!nameQuery) {
    console.error("Usage: tsx scripts/diagnose-receptionist-health.ts \"Business Name\"");
    process.exit(2);
  }

  await getPool();
  const businesses = await query<{ BusinessID: string; Name: string }>(
    `SELECT TOP (5) BusinessID, Name
     FROM dbo.TblBusiness
     WHERE Name LIKE @name
     ORDER BY UpdatedAtUtc DESC`,
    [{ name: "name", type: sql.NVarChar(200), value: `%${nameQuery}%` }],
  );

  if (!businesses.recordset.length) {
    console.log(JSON.stringify({ found: false, query: nameQuery }, null, 2));
    await closePool();
    return;
  }

  const reports = [];
  for (const row of businesses.recordset) {
    const businessId = row.BusinessID;
    const [agents, knowledge, aiSetting] = await Promise.all([
      listAgents({ businessId }),
      listItems({ businessId }),
      getWhatsAppAiSetting({ businessId }),
    ]);
    const health = await getReceptionistOperationalHealth({
      businessId,
      businessName: row.Name,
      autoReplyEnabled: Boolean(aiSetting?.autoReplyEnabled),
      hasActiveAgent: agents.some((a) => a.isActive),
      hasActiveKnowledge: knowledge.some((k) => k.isActive),
    });
    const status = deriveReceptionistStatus({
      businessName: row.Name,
      health,
    });
    reports.push({
      businessName: row.Name,
      businessIdSuffix: String(businessId).slice(-8),
      overall: health.overall,
      attentionCode: health.attentionCode,
      whatsappLiveState: health.whatsappLiveState,
      inboundHealth: health.inboundHealth,
      workerAvailable: health.worker.available,
      workerAgeMs: health.worker.ageMs,
      autoReplyEnabled: health.autoReplyEnabled,
      hasActiveAgent: health.hasActiveAgent,
      hasActiveKnowledge: health.hasActiveKnowledge,
      ui: {
        kind: status.kind,
        headline: status.headline,
        detail: status.detail,
      },
    });
  }

  console.log(JSON.stringify({ found: true, reports }, null, 2));
  await closePool();
}

main().catch(async (error) => {
  console.error("diagnose_failed", error instanceof Error ? error.name : "ERROR");
  try { await closePool(); } catch { /* ignore */ }
  process.exit(1);
});
