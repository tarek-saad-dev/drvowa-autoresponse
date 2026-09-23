/**
 * In-memory sliding-window rate limiter for V1 single-process deployments.
 * Multi-instance production should replace with a shared store (Redis/etc.).
 *
 * Thresholds (documented):
 * - auth.login: 10 / 15 min per IP+email
 * - auth.signup: 5 / 60 min per IP
 * - auth.password_reset: 5 / 60 min per IP+email
 * - inbox.manual_send: 30 / 5 min per business
 * - whatsapp.connect: 20 / 15 min per business
 * - knowledge.ingest_analyze: 20 / 60 min per business
 */

export class RateLimitError extends Error {
  readonly statusCode = 429;
  readonly retryAfterSec: number;

  constructor(retryAfterSec: number, message = "Too many requests") {
    super(message);
    this.name = "RateLimitError";
    this.retryAfterSec = Math.max(1, Math.ceil(retryAfterSec));
  }
}

type Bucket = {
  timestamps: number[];
};

const buckets = new Map<string, Bucket>();

const PRUNE_EVERY = 200;
let opsSincePrune = 0;

function prune(now: number): void {
  for (const [key, bucket] of buckets) {
    // Drop empty / stale buckets older than 2h
    const newest = bucket.timestamps[bucket.timestamps.length - 1] ?? 0;
    if (bucket.timestamps.length === 0 || now - newest > 2 * 60 * 60 * 1000) {
      buckets.delete(key);
    }
  }
}

export type RateLimitPolicy = {
  limit: number;
  windowMs: number;
};

export const RATE_LIMITS = {
  login: { limit: 10, windowMs: 15 * 60 * 1000 },
  signup: { limit: 5, windowMs: 60 * 60 * 1000 },
  passwordReset: { limit: 5, windowMs: 60 * 60 * 1000 },
  manualSend: { limit: 30, windowMs: 5 * 60 * 1000 },
  whatsappConnect: { limit: 20, windowMs: 15 * 60 * 1000 },
  knowledgeIngestAnalyze: { limit: 20, windowMs: 60 * 60 * 1000 },
} as const satisfies Record<string, RateLimitPolicy>;

/**
 * Asserts the key is within policy. Throws RateLimitError when exceeded.
 * Returns remaining allowance after this successful check.
 */
export function assertRateLimit(
  key: string,
  policy: RateLimitPolicy,
  now = Date.now(),
): { remaining: number } {
  opsSincePrune += 1;
  if (opsSincePrune >= PRUNE_EVERY) {
    opsSincePrune = 0;
    prune(now);
  }

  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { timestamps: [] };
    buckets.set(key, bucket);
  }

  const windowStart = now - policy.windowMs;
  bucket.timestamps = bucket.timestamps.filter((t) => t > windowStart);

  if (bucket.timestamps.length >= policy.limit) {
    const oldest = bucket.timestamps[0] ?? now;
    const retryAfterSec = (oldest + policy.windowMs - now) / 1000;
    throw new RateLimitError(retryAfterSec);
  }

  bucket.timestamps.push(now);
  return { remaining: policy.limit - bucket.timestamps.length };
}

/** Test helper — clears all buckets. */
export function resetRateLimitBucketsForTests(): void {
  buckets.clear();
  opsSincePrune = 0;
}

export function clientIpFromRequest(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first.slice(0, 64);
  }
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp.slice(0, 64);
  return "unknown";
}
