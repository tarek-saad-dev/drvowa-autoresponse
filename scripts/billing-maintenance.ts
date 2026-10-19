import { runBillingMaintenance } from "../src/modules/billing/renewal-worker";
import { closePool } from "../src/lib/db";
runBillingMaintenance().catch(error => {
  console.error("[billing-maintenance] failed", { name: error instanceof Error ? error.name : "UNKNOWN" });
  process.exitCode = 1;
}).finally(closePool);
