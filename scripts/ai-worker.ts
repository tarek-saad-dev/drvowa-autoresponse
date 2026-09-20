/**
 * DRVOWA AI reply worker — durable job processor.
 * Production: run as drvowa-ai-worker.service via `npm run ai:worker`.
 *
 * Never processes Gemini inside the inbound HTTP request path.
 * Graceful SIGTERM/SIGINT: stop claiming, drain in-flight (heartbeats continue),
 * close pool on clean drain; force-exit on deadline without mutating jobs.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { getPool } from "../src/lib/db";
import { createAiWorkerRunner } from "../src/modules/ai/worker-runner";
import {
  resolveHeartbeatMs,
  resolveLeaseSeconds,
  resolveShutdownDeadlineMs,
} from "../src/modules/ai/lease";

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
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function getConcurrency(): number {
  const raw = Number(process.env.AI_WORKER_CONCURRENCY || 2);
  if (!Number.isInteger(raw) || raw < 1) return 2;
  return Math.min(raw, 8);
}

function getPollMs(): number {
  const raw = Number(process.env.AI_WORKER_POLL_MS || 250);
  if (!Number.isFinite(raw) || raw < 100) return 250;
  return Math.min(raw, 5_000);
}

async function main(): Promise<void> {
  loadDotEnvIfPresent();
  await getPool();

  const runner = createAiWorkerRunner({
    concurrency: getConcurrency(),
    pollMs: getPollMs(),
    leaseSeconds: resolveLeaseSeconds(),
    heartbeatMs: resolveHeartbeatMs(),
    shutdownDeadlineMs: resolveShutdownDeadlineMs(),
  });

  process.once("SIGINT", () => runner.requestShutdown());
  process.once("SIGTERM", () => runner.requestShutdown());

  const result = await runner.loop();
  if (result.reason === "deadline_exceeded") {
    process.exitCode = 1;
    // Force exit so OS stops heartbeats; jobs recover via lease expiry.
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("[ai-worker] fatal", {
    errorCode: error instanceof Error ? error.name : "FATAL",
  });
  process.exit(1);
});
