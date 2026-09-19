/**
 * Stable outbound idempotency + bounded unknown-send recovery policy.
 */

import { normalizeUuid } from "@/lib/ids/uuid";

/** Max runtime send attempts (including the first) before SAFETY_PAUSED. */
export const MAX_SEND_RESOLUTION_ATTEMPTS = 3;

/** After attempt 1 unknown → +2s; after attempt 2 unknown → +5s. */
export const OUTBOUND_UNKNOWN_RETRY_DELAY_SEC: Readonly<Record<number, number>> = {
  1: 2,
  2: 5,
};

export function aiOutboundIdempotencyKey(jobId: string): string {
  return `ai:${normalizeUuid(jobId)}`;
}

/**
 * Seconds to wait before reclaiming an ambiguous outbound job.
 * Returns null when the attempt should fail closed.
 */
export function outboundUnknownRetryDelaySeconds(
  attemptCount: number,
): number | null {
  if (attemptCount >= MAX_SEND_RESOLUTION_ATTEMPTS) return null;
  return OUTBOUND_UNKNOWN_RETRY_DELAY_SEC[attemptCount] ?? 5;
}
