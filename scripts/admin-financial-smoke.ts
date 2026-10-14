/**
 * Safe read-only production/staging gate for the owner dashboard SQL.
 *
 * Runs after the production build, before service restart. Does not mutate
 * subscriptions or approve payments.
 */
import { closePool } from "../src/lib/db";
import { getAdminFinancialReport } from "../src/modules/billing/admin-financial-report";
import { listAdminSubscriptions } from "../src/modules/billing/admin-subscriptions";

async function main() {
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
