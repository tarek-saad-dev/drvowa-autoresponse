/** Shared predicate for the open escalation count and Inbox follow-up filter.
 * Keep this in one place so a dashboard case can never disappear when opened.
 * SQL aliases are internal constants, never user-provided input.
 */
export const OPEN_ESCALATION_SQL = "e.ResolvedAtUtc IS NULL AND e.Status IN (N'OPEN', N'ACKNOWLEDGED')";
