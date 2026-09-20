/**
 * Durable AI job lease fencing helpers.
 */

import { createHash, randomUUID } from "node:crypto";
import { hostname } from "node:os";

export const AI_JOB_LEASE_SECONDS_DEFAULT = 90;
export const AI_WORKER_HEARTBEAT_MS_DEFAULT = 25_000;
export const AI_WORKER_SHUTDOWN_DEADLINE_MS_DEFAULT = 60_000;

/** Heartbeat must be comfortably below lease (≤ lease/2). */
export const HEARTBEAT_LEASE_RATIO = 0.5;

export class AiJobLeaseLostError extends Error {
  readonly code = "LEASE_LOST" as const;

  constructor(message = "AI job lease ownership lost or expired") {
    super(message);
    this.name = "AiJobLeaseLostError";
  }
}

export function isAiJobLeaseLostError(error: unknown): error is AiJobLeaseLostError {
  return (
    error instanceof AiJobLeaseLostError
    || (
      typeof error === "object"
      && error !== null
      && "code" in error
      && (error as { code: unknown }).code === "LEASE_LOST"
    )
  );
}

/**
 * Stable process-scoped worker id, guaranteed <= 128 chars (LeaseOwner).
 * No secrets / credentials.
 */
export function createAiWorkerId(opts?: {
  host?: string;
  pid?: number;
  uuid?: string;
}): string {
  const rawHost = opts?.host ?? hostname();
  const hostHash = createHash("sha256")
    .update(rawHost, "utf8")
    .digest("hex")
    .slice(0, 16);
  const pid = opts?.pid ?? process.pid;
  const uuid = opts?.uuid ?? randomUUID();
  const id = `w-${hostHash}-${pid}-${uuid}`;
  if (id.length > 128) {
    return id.slice(0, 128);
  }
  return id;
}

function clampLeaseSeconds(raw: number): number {
  if (!Number.isFinite(raw) || raw < 30) return AI_JOB_LEASE_SECONDS_DEFAULT;
  return Math.min(Math.floor(raw), 600);
}

function clampHeartbeatMs(raw: number): number {
  if (!Number.isFinite(raw) || raw < 5_000) return AI_WORKER_HEARTBEAT_MS_DEFAULT;
  return Math.min(Math.floor(raw), 60_000);
}

/**
 * Resolve lease + heartbeat together so heartbeat can never be ≥ lease.
 * Safe invariant: heartbeatMs <= floor(leaseMs * HEARTBEAT_LEASE_RATIO).
 */
export function resolveWorkerTimingConfig(opts?: {
  leaseSecondsEnv?: string;
  heartbeatMsEnv?: string;
}): {
  leaseSeconds: number;
  heartbeatMs: number;
  clamped: boolean;
} {
  const leaseRaw = Number(
    opts?.leaseSecondsEnv
      ?? process.env.AI_WORKER_LEASE_SECONDS
      ?? AI_JOB_LEASE_SECONDS_DEFAULT,
  );
  const heartbeatRaw = Number(
    opts?.heartbeatMsEnv
      ?? process.env.AI_WORKER_HEARTBEAT_MS
      ?? AI_WORKER_HEARTBEAT_MS_DEFAULT,
  );

  const leaseSeconds = clampLeaseSeconds(leaseRaw);
  let heartbeatMs = clampHeartbeatMs(heartbeatRaw);
  const maxHeartbeat = Math.max(
    5_000,
    Math.floor(leaseSeconds * 1000 * HEARTBEAT_LEASE_RATIO),
  );
  let clamped = false;
  if (heartbeatMs > maxHeartbeat) {
    heartbeatMs = maxHeartbeat;
    clamped = true;
  }
  // Absolute guard: never allow heartbeat >= lease.
  if (heartbeatMs >= leaseSeconds * 1000) {
    heartbeatMs = Math.max(5_000, Math.floor(leaseSeconds * 1000 * HEARTBEAT_LEASE_RATIO));
    clamped = true;
  }
  return { leaseSeconds, heartbeatMs, clamped };
}

export function resolveLeaseSeconds(envValue?: string): number {
  return resolveWorkerTimingConfig({
    leaseSecondsEnv: envValue,
  }).leaseSeconds;
}

export function resolveHeartbeatMs(envValue?: string): number {
  // When only heartbeat is resolved in isolation, still cross-check against lease env.
  return resolveWorkerTimingConfig({
    heartbeatMsEnv: envValue,
  }).heartbeatMs;
}

export function resolveShutdownDeadlineMs(envValue?: string): number {
  const raw = Number(
    envValue ?? process.env.AI_WORKER_SHUTDOWN_DEADLINE_MS ?? AI_WORKER_SHUTDOWN_DEADLINE_MS_DEFAULT,
  );
  if (!Number.isFinite(raw) || raw < 5_000) return AI_WORKER_SHUTDOWN_DEADLINE_MS_DEFAULT;
  return Math.min(Math.floor(raw), 300_000);
}
