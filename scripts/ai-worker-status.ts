/**
 * Operator CLI: AI worker queue health (read-only).
 * Never prints LeaseToken, message bodies, phones, or secrets.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { closePool, getPool } from "../src/lib/db";
import { getAiWorkerQueueStatus } from "../src/modules/ai/worker-status";

function loadDotEnvIfPresent(): void {
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) return;
  const text = readFileSync(envPath, "utf8");
  for (const line of text.split(/\r?\n/)) {
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

async function main(): Promise<void> {
  loadDotEnvIfPresent();
  await getPool();
  const businessIdArg = process.argv.find((a) => a.startsWith("--business="));
  const businessId = businessIdArg?.slice("--business=".length) || undefined;
  const status = await getAiWorkerQueueStatus(
    businessId ? { businessId } : undefined,
  );
  console.log(JSON.stringify(status, null, 2));
  await closePool();
}

main().catch((error) => {
  console.error("[ai-worker-status] failed", {
    errorCode: error instanceof Error ? error.name : "STATUS_ERROR",
  });
  process.exit(1);
});
