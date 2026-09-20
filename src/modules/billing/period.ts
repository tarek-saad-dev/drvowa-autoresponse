/**
 * UTC calendar-month usage period helpers (quota window).
 * Distinct from TblSubscription.PeriodStartUtc / PeriodEndUtc.
 */

export type UsagePeriodWindow = {
  usagePeriodStartUtc: Date;
  usagePeriodEndUtc: Date;
};

/** Inclusive start / exclusive end of the UTC calendar month containing `at`. */
export function resolveUtcMonthPeriod(at: Date = new Date()): UsagePeriodWindow {
  const start = new Date(
    Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1, 0, 0, 0, 0),
  );
  const end = new Date(
    Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + 1, 1, 0, 0, 0, 0),
  );
  return { usagePeriodStartUtc: start, usagePeriodEndUtc: end };
}

export const USAGE_EVENT_AI_REPLY = "AI_REPLY_GENERATED";
export const USAGE_EVENT_WHATSAPP_OUTBOUND = "WHATSAPP_OUTBOUND_MESSAGE";

export function aiReplyReservationKey(jobId: string): string {
  return `ai-reply:${jobId}`;
}

export function waOutboundReservationKey(jobId: string): string {
  return `wa-outbound:${jobId}`;
}
