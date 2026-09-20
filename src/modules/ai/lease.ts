/**
 * Durable AI job lease fencing helpers.
 */

import { createHash, randomUUID } from "node:crypto";
import { hostname } from "node:os";

export const AI_JOB_LEASE_SECONDS_DEFAULT = 90;
export const AI_WORKER_HEARTBEAT_MS_DEFAULT = 25_000;
export const AI_WORKER_SHUTDOWN_DEADLINE_MS_DEFAULT = 60_000;

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

export function resolveLeaseSeconds(envValue?: string): number {
  const raw = Number(envValue ?? process.env.AI_WORKER_LEASE_SECONDS ?? AI_JOB_LEASE_SECONDS_DEFAULT);
  if (!Number.isFinite(raw) || raw < 30) return AI_JOB_LEASE_SECONDS_DEFAULT;
  return Math.min(Math.floor(raw), 600);
}

export function resolveHeartbeatMs(envValue?: string): number {
  const raw = Number(envValue ?? process.env.AI_WORKER_HEARTBEAT_MS ?? AI_WORKER_HEARTBEAT_MS_DEFAULT);
  if (!Number.isFinite(raw) || raw < 5_000) return AI_WORKER_HEARTBEAT_MS_DEFAULT;
  return Math.min(Math.floor(raw), 60_000);
}

export function resolveShutdownDeadlineMs(envValue?: string): number {
  const raw = Number(
    envValue ?? process.env.AI_WORKER_SHUTDOWN_DEADLINE_MS ?? AI_WORKER_SHUTDOWN_DEADLINE_MS_DEFAULT,
  );
  if (!Number.isFinite(raw) || raw < 5_000) return AI_WORKER_SHUTDOWN_DEADLINE_MS_DEFAULT;
  return Math.min(Math.floor(raw), 300_000);
}
