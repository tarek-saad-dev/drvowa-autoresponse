/** V1 conversation loop-guard policy (circuit breaker). */
export const LOOP_GUARD_WINDOW_MS = 60_000;
export const LOOP_GUARD_MAX_SENT = 3;
export const LOOP_GUARD_PAUSE_MS = 10 * 60 * 1000;
export const LOOP_GUARD_PAUSE_REASON = "BOT_LOOP_GUARD";

export const LOOP_GUARD_WINDOW_SECONDS = Math.floor(LOOP_GUARD_WINDOW_MS / 1000);
export const LOOP_GUARD_PAUSE_SECONDS = Math.floor(LOOP_GUARD_PAUSE_MS / 1000);

export const HUMAN_TAKEOVER_RESUME_POLICIES = [
  "AFTER_30_MIN",
  "AFTER_60_MIN",
  "AFTER_120_MIN",
  "AFTER_240_MIN",
  "END_OF_DAY",
  "MANUAL",
] as const;

export type HumanTakeoverResumePolicy =
  (typeof HUMAN_TAKEOVER_RESUME_POLICIES)[number];

export const DEFAULT_HUMAN_TAKEOVER_RESUME_POLICY: HumanTakeoverResumePolicy =
  "AFTER_120_MIN";

/** Backward-compatible alias for the default policy duration. */
export const HUMAN_TAKEOVER_PAUSE_MS = 2 * 60 * 60 * 1000;

const POLICY_MINUTES: Partial<Record<HumanTakeoverResumePolicy, number>> = {
  AFTER_30_MIN: 30,
  AFTER_60_MIN: 60,
  AFTER_120_MIN: 120,
  AFTER_240_MIN: 240,
};

function localDateKey(date: Date, timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);
    const values = Object.fromEntries(
      parts.map((part) => [part.type, part.value]),
    );
    return `${values.year}-${values.month}-${values.day}`;
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

export function shouldAutoResumeHumanTakeover(params: {
  policy: HumanTakeoverResumePolicy;
  pausedAtUtc: Date;
  messageReceivedAtUtc: Date;
  businessTimezone: string;
}): boolean {
  if (params.policy === "MANUAL") return false;

  if (params.policy === "END_OF_DAY") {
    return (
      localDateKey(params.messageReceivedAtUtc, params.businessTimezone)
      !== localDateKey(params.pausedAtUtc, params.businessTimezone)
    );
  }

  const minutes = POLICY_MINUTES[params.policy];
  if (!minutes) return false;

  return (
    params.messageReceivedAtUtc.getTime()
    >= params.pausedAtUtc.getTime() + minutes * 60 * 1000
  );
}
