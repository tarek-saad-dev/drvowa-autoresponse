/**
 * DRVOWA AI reply worker — durable job processor.
 * Production: run as drvowa-ai-worker.service via `npm run ai:worker`.
 *
 * Never processes Gemini inside the inbound HTTP request path.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { closePool, getPool } from "../src/lib/db";
import {
  claimNextJob,
  processAiReplyJob,
} from "../src/modules/ai";

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

  const concurrency = getConcurrency();
  const pollMs = getPollMs();
  let stopping = false;
  let inFlight = 0;

  console.info("[ai-worker] started", { concurrency, pollMs });

  const shutdown = async () => {
    stopping = true;
    console.info("[ai-worker] shutting_down");
  };
  process.once("SIGINT", () => {
    void shutdown().finally(() => process.exit(0));
  });
  process.once("SIGTERM", () => {
    void shutdown().finally(() => process.exit(0));
  });

  while (!stopping) {
    try {
      while (inFlight < concurrency && !stopping) {
        const job = await claimNextJob();
        if (!job) break;
        inFlight += 1;
        void processAiReplyJob({ job })
          .catch((error) => {
            console.warn("[ai-worker] failed", {
              jobId: job.aiReplyJobId,
              errorCode:
                error && typeof error === "object" && "code" in error
                  ? String((error as { code: unknown }).code)
                  : "WORKER_ERROR",
            });
          })
          .finally(() => {
            inFlight -= 1;
          });
      }
    } catch (error) {
      console.warn("[ai-worker] loop_error", {
        errorCode: error instanceof Error ? error.name : "LOOP_ERROR",
      });
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }

  while (inFlight > 0) {
    await new Promise((r) => setTimeout(r, 100));
  }
  await closePool().catch(() => undefined);
}

main().catch(async (error: unknown) => {
  console.error(
    "[ai-worker] fatal",
    error instanceof Error ? error.message : "unknown",
  );
  try {
    await closePool();
  } catch {
    // ignore
  }
  process.exitCode = 1;
});
