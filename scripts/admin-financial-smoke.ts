/**
 * Safe read-only production/staging gate for the owner dashboard SQL.
 *
 * Runs after the production build, before service restart. Does not mutate
 * subscriptions or approve payments.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { closePool } from "../src/lib/db";

function loadProductionDbEnvironment(): void {
  // Mirror db-migrate's safe env-loader: standalone tsx scripts do not receive
  // Next's automatic .env.production.local loading.
  for (const name of [".env.production.local", ".env"]) {
    const file = resolve(process.cwd(), name);
    if (!existsSync(file)) continue;
    const lines = readFileSync(file, "utf8").split(/\r?\n/);
    for (const line of lines) {
      const entry = line.trim();
      if (!entry || entry.startsWith("#")) continue;
      const eq = entry.indexOf("=");
      if (eq <= 0) continue;
      const key = entry.slice(0, eq).trim();
      let value = entry.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = value;
    }
  }
}

import { getAdminFinancialReport } from "../src/modules/billing/admin-financial-report";
import { listAdminSubscriptions } from "../src/modules/billing/admin-subscriptions";

async function main() {
  loadProductionDbEnvironment();
  const report = await getAdminFinancialReport({ months: 6 });
  const subscriptions = await listAdminSubscriptions({ page: 1 });
  const month = new Date().toISOString().slice(0, 7);
  const monthBucket = report.trend.find((item) => item.month === month);

  if (!monthBucket) throw new Error("Current month missing from financial trend");
  if (Math.round(monthBucket.amountEgp * 100) !== Math.round(report.overview.collectedEgp * 100)) {
    throw new Error("Current month approved collections differ from trend bucket");
  }
  if (!Number.isFinite(report.overview.estimatedMonthlyRunRateEgp) ||
      report.overview.estimatedMonthlyRunRateEgp < 0) {
    throw new Error("Invalid plan monthly estimate");
  }
  if (subscriptions.total < subscriptions.items.length) {
    throw new Error("Invalid subscription pagination result");
  }

  console.log("[admin-financial-smoke] PASS", {
    months: report.trend.length,
    planRows: report.plans.length,
    subscriptionRows: subscriptions.items.length,
    readOnly: true,
  });
}

main()
  .then(() => closePool())
  .catch(async (error: unknown) => {
    console.error("[admin-financial-smoke] FAILED", error instanceof Error ? error.message : "unknown");
    await closePool();
    process.exitCode = 1;
  });
