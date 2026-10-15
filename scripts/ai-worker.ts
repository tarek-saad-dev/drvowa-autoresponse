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
import { deliverNextEscalationNotification } from "../src/modules/escalations/notifier";
import { createAiWorkerRunner } from "../src/modules/ai/worker-runner";
import { resumeDueHumanConversations } from "../src/modules/ai/bulk-resume-service";
import { runReliabilityAudit } from "../src/modules/reliability/service";
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
  // Deploy gate: reaching here proves the full worker module graph loads
  // under plain Node/tsx (Next-only modules like "server-only" break it).
  if (process.argv.includes("--check")) {
    console.log("[ai-worker] check_ok");
    return;
  }

  loadDotEnvIfPresent();
  await getPool();

  const runner = createAiWorkerRunner({
    concurrency: getConcurrency(),
    pollMs: getPollMs(),
    leaseSeconds: resolveLeaseSeconds(),
    heartbeatMs: resolveHeartbeatMs(),
    shutdownDeadlineMs: resolveShutdownDeadlineMs(),
  });

  // Dedicated durable notification queue: no AI generation and no inbound replay.
  let stoppingNotifications = false;
  let notificationBusy = false;
  const notificationTick = async () => {
    if (stoppingNotifications || notificationBusy) return;
    notificationBusy = true;
    try {
      await deliverNextEscalationNotification();
    } catch (error) {
      console.error("[escalation-worker] tick_failed", {
        code: error instanceof Error ? error.name : "UNKNOWN",
      });
    } finally { notificationBusy = false; }
  };
  const notificationTimer = setInterval(() => void notificationTick(), 5_000);
  void notificationTick();
  
  // 30 minutes since the last human reply, never from midnight or initial handoff.
  // Each sweep is idempotent and refuses open escalations / safety pauses.
  let stoppingDailyResume = false;
  let dailyResumeBusy = false;
  const dailyResumeTick = async () => {
    if (stoppingDailyResume || dailyResumeBusy) return;
    dailyResumeBusy = true;
    try {
      const resumed = await resumeDueHumanConversations();
      if (resumed > 0) console.info("[ai-worker] human_timeout_resumed", { resumed });
    } catch (error) {
      console.error("[ai-worker] daily_handoff_failed", {
        code: error instanceof Error ? error.name : "UNKNOWN",
      });
    } finally { dailyResumeBusy = false; }
  };
  const dailyResumeTimer = setInterval(() => void dailyResumeTick(), 60_000);
  void dailyResumeTick();
  // Read-only reconciliation; never blindly resend ambiguous WhatsApp results.
  let stoppingAudit = false;
  let auditBusy = false;
  const auditTick = async () => {
    if (stoppingAudit || auditBusy) return;
    auditBusy = true;
    try {
      const result = await runReliabilityAudit();
      if (result.receiptIncidents || result.aiIncidents) console.info("[reliability] incidents_detected", result);
    } catch (error) {
      console.error("[reliability] audit_failed", { code: error instanceof Error ? error.name : "UNKNOWN" });
    } finally { auditBusy = false; }
  };
  const auditTimer = setInterval(() => void auditTick(), 60_000);
  void auditTick();
  const shutdown = () => {
    stoppingNotifications = true;
    clearInterval(notificationTimer);
    stoppingDailyResume = true;
    clearInterval(dailyResumeTimer);
    stoppingAudit = true;
    clearInterval(auditTimer);
    runner.requestShutdown();
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);

  const result = await runner.loop();
  stoppingNotifications = true;
  clearInterval(notificationTimer);
  stoppingDailyResume = true;
  clearInterval(dailyResumeTimer);
  stoppingAudit = true;
  clearInterval(auditTimer);
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
