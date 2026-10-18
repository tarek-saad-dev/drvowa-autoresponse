import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runFinancialReconciliation } from "../src/modules/billing/saas-financial-reconciliation-runner";

// Service environment wins over local .env. No secret or request body is logged.
const envPath = resolve(process.cwd(), ".env");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
runFinancialReconciliation().then(result => {
  if (result.status === "SCAN_INCOMPLETE") process.exitCode = 1;
}).catch(error => {
  console.error("[saas-financial-reconcile] fatal", {
    code: error instanceof Error ? error.name : "UNKNOWN",
  });
  process.exitCode = 1;
});
