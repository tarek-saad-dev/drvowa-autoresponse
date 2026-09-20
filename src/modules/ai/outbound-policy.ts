/**
 * Stable outbound idempotency + bounded unknown-send recovery policy.
 * Budget is OutboundUnknownCount (actual ambiguous outcomes), NOT claim AttemptCount.
 */

import { normalizeUuid } from "@/lib/ids/uuid";

/** Max ambiguous outbound outcomes before SAFETY_PAUSED. */
export const MAX_SEND_RESOLUTION_ATTEMPTS = 3;

/** After unknown #1 → +2s; after unknown #2 → +5s. */
export const OUTBOUND_UNKNOWN_RETRY_DELAY_SEC: Readonly<Record<number, number>> = {
  1: 2,
  2: 5,
};

export function aiOutboundIdempotencyKey(jobId: string): string {
  return `ai:${normalizeUuid(jobId)}`;
}

/**
 * Seconds to wait before reclaiming after an ambiguous outbound.
 * @param outboundUnknownCount - durable count AFTER the latest ambiguous outcome
 * Returns null when the attempt should fail closed (count >= max).
 */
export function outboundUnknownRetryDelaySeconds(
  outboundUnknownCount: number,
): number | null {
  if (outboundUnknownCount >= MAX_SEND_RESOLUTION_ATTEMPTS) return null;
  return OUTBOUND_UNKNOWN_RETRY_DELAY_SEC[outboundUnknownCount] ?? 5;
}
