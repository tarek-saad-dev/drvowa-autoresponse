import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createFinancialWorker } from "../src/modules/billing/saas-financial-worker";

// Match the existing AI worker's local .env behavior; service environment wins.
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

async function main(): Promise<void> {
  const worker = createFinancialWorker();
  process.once("SIGINT", worker.requestShutdown);
  process.once("SIGTERM", worker.requestShutdown);
  await worker.loop();
}

main().catch((error) => {
  // Error messages can contain driver or transport details; emit only the class.
  console.error("[saas-financial-worker] fatal", {
    code: error instanceof Error ? error.name : "UNKNOWN",
  });
  process.exitCode = 1;
});
