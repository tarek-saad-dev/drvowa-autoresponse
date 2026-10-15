import { query, sql } from "@/lib/db";

/**
 * Hand back HUMAN_PAUSED conversations to the bot for FUTURE incoming messages.
 * Do not replay the human-owned history: the resumed watermark makes all
 * pre-existing pending AI jobs stale. Safety pauses and unresolved escalations
 * must continue to require explicit human review.
 *
 * The SQL update is one tenant-scoped, idempotent statement. Row-level locks
 * serialize it against concurrent manual takeovers.
 */
export async function resumeAllHumanConversations(params: {
  businessId: string;
  beforeUtc?: Date;
}): Promise<number> {
  const inputs = [
    { name: "businessId", type: sql.UniqueIdentifier, value: params.businessId },
    { name: "beforeUtc", type: sql.DateTime2, value: params.beforeUtc ?? null },
  ];
  const result = await query(
    `UPDATE s
     SET Mode = N'AUTO',
         PausedAtUtc = NULL,
         PauseReason = NULL,
         ResumedAtUtc = SYSUTCDATETIME(),
         UpdatedAtUtc = SYSUTCDATETIME()
     FROM dbo.TblConversationAiState s
     INNER JOIN dbo.TblConversation c
       ON c.BusinessID = s.BusinessID
      AND c.ConversationID = s.ConversationID
     WHERE s.BusinessID = @businessId
       AND s.Mode = N'HUMAN_PAUSED'
       AND (@beforeUtc IS NULL OR s.PausedAtUtc < @beforeUtc)
       AND NOT EXISTS (
         SELECT 1 FROM dbo.TblHumanEscalation e
         WHERE e.BusinessID = s.BusinessID
           AND e.ConversationID = s.ConversationID
           AND e.ResolvedAtUtc IS NULL
           AND e.Status IN (N'OPEN', N'ACKNOWLEDGED')
       )`,
    inputs,
  );
  return result.rowsAffected.reduce((sum, count) => sum + count, 0);
}

/** Stable YYYY-MM-DD in the business's own timezone (UTC fallback). */
function businessDayKey(at: Date, timezone: string): string {
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric", month: "2-digit", day: "2-digit",
    });
  } catch {
    return at.toISOString().slice(0, 10);
  }
  const parts = Object.fromEntries(
    formatter.formatToParts(at).map(part => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/**
 * Find the UTC instant at which the current local calendar day began.
 * Binary search accommodates DST changes (including shifts at midnight).
 */
export function startOfBusinessDayUtc(now: Date, timezone: string): Date {
  const key = businessDayKey(now, timezone);
  let low = now.getTime() - 48 * 60 * 60 * 1000;
  let high = now.getTime();
  while (low < high) {
    const mid = low + Math.floor((high - low) / 2);
    if (businessDayKey(new Date(mid), timezone) < key) low = mid + 1;
    else high = mid;
  }
  return new Date(low);
}

/**
 * Called by the always-on AI worker about once a minute.
 * Recover after downtime: sessions paused before TODAY's local midnight
 * resume on the next tick, with no historical bulk catch-up replies.
 */
export async function resumePreviousDayConversations(now = new Date()): Promise<{
  businesses: number;
  resumed: number;
}> {
  const result = await query<{ BusinessID: string; Timezone: string | null }>(
    `SELECT DISTINCT s.BusinessID, b.Timezone
     FROM dbo.TblConversationAiState s
     INNER JOIN dbo.TblBusiness b ON b.BusinessID = s.BusinessID
     WHERE s.Mode = N'HUMAN_PAUSED' AND s.PausedAtUtc IS NOT NULL`,
  );
  let resumed = 0;
  for (const business of result.recordset) {
    const cutoff = startOfBusinessDayUtc(now, business.Timezone?.trim() || "UTC");
    resumed += await resumeAllHumanConversations({
      businessId: business.BusinessID,
      beforeUtc: cutoff,
    });
  }
  return { businesses: result.recordset.length, resumed };
}

/**
 * Reliability handback: only human-answered conversations become eligible.
 * An unresolved escalation or SAFETY_PAUSED never transitions here.
 * Predicate + UPDATE are atomic; repeating the sweep cannot duplicate a return.
 */
export async function resumeDueHumanConversations(now = new Date()): Promise<number> {
  const res = await query(
    `UPDATE s
     SET Mode = N'AUTO', PausedAtUtc = NULL, PauseReason = NULL,
         LastHumanReplyAtUtc = NULL, ResumedAtUtc = @now, UpdatedAtUtc = @now
     FROM dbo.TblConversationAiState s WITH (UPDLOCK)
     WHERE s.Mode = N'HUMAN_PAUSED'
       AND s.PauseReason = N'HUMAN_TAKEOVER'
       AND s.LastHumanReplyAtUtc IS NOT NULL
       AND s.LastHumanReplyAtUtc <= DATEADD(minute, -30, @now)
       AND NOT EXISTS (
         SELECT 1 FROM dbo.TblHumanEscalation e
         WHERE e.BusinessID = s.BusinessID AND e.ConversationID = s.ConversationID
           AND e.ResolvedAtUtc IS NULL
       )`,
    [{ name: "now", type: sql.DateTime2, value: now }],
  );
  return res.rowsAffected.reduce((sum, n) => sum + n, 0);
}
