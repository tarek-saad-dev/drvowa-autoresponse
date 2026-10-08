/** V1 conversation loop-guard policy (circuit breaker). */
export const LOOP_GUARD_WINDOW_MS = 60_000;
export const LOOP_GUARD_MAX_SENT = 3;
export const LOOP_GUARD_PAUSE_MS = 10 * 60 * 1000;
export const LOOP_GUARD_PAUSE_REASON = "BOT_LOOP_GUARD";

export const LOOP_GUARD_WINDOW_SECONDS = Math.floor(LOOP_GUARD_WINDOW_MS / 1000);
export const LOOP_GUARD_PAUSE_SECONDS = Math.floor(LOOP_GUARD_PAUSE_MS / 1000);

/** Human manual takeover is temporary: AI may resume after 2 hours. */
export const HUMAN_TAKEOVER_PAUSE_MS = 2 * 60 * 60 * 1000;
