// Admin-only, bounded projection of worker-local incident telemetry.
const issues = ["SOCKET_REVIEW", "SOCKET_RECONNECTING", "PEER_CRYPTO", "PEER_CRYPTO_UNRESOLVED", "INBOUND_WORKER_STOPPED", "INBOUND_DELIVERY_ERROR"] as const;
type Issue = typeof issues[number];
type Incident = { issue: Issue; startedAt: string; durationMs: number };
export type IncidentView = { lastSampleAt: string; stale: boolean; active: Incident[]; persistence: "OK" | "READ_ERROR" | "WRITE_ERROR" | "UNKNOWN"; recent: (Incident & { endedAt: string; outcome: "OBSERVATION_INTERRUPTED" | "CONDITION_NO_LONGER_OBSERVED" })[] };
function obj(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}
function date(value: unknown): string | null {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
}
function incident(value: unknown): Incident | null {
  const v = obj(value), startedAt = date(v.startedAt);
  if (!issues.includes(v.issue as Issue) || !startedAt || typeof v.durationMs !== "number" || !Number.isFinite(v.durationMs) || v.durationMs < 0) return null;
  return { issue: v.issue as Issue, startedAt, durationMs: v.durationMs };
}
export function buildIncidentView(value: unknown, now = Date.now()): IncidentView | null {
  const v = obj(value), lastSampleAt = date(v.lastSampleAt);
  if (!lastSampleAt) return null;
  const age = now - Date.parse(lastSampleAt);
  const stale = age < -5000 || age > 45000;
  const active = (Array.isArray(v.active) ? v.active.slice(0, 6) : []).flatMap(x => { const i = incident(x); return i ? [i] : []; });
  const recent = (Array.isArray(v.recent) ? v.recent.slice(-20) : []).flatMap(x => {
    const i = incident(x), endedAt = date(obj(x).endedAt);
    const outcome = obj(x).outcome === "OBSERVATION_INTERRUPTED" ? "OBSERVATION_INTERRUPTED" as const : "CONDITION_NO_LONGER_OBSERVED" as const;
    return i && endedAt && Date.parse(endedAt) >= Date.parse(i.startedAt) ? [{ ...i, endedAt, outcome }] : [];
  });
  const persistence = v.persistence === "OK" || v.persistence === "READ_ERROR" || v.persistence === "WRITE_ERROR" ? v.persistence : "UNKNOWN";
  return { lastSampleAt, stale, persistence, active, recent };
}
