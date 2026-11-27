import type { IncidentView } from "@/modules/channels/incident-view";
export const ALERT_KIND = "WHATSAPP_RUNTIME_INCIDENT";
export const ALERT_MIN_DURATION_MS = 60_000;
export function incidentReference(channelId: string, issue: string, startedAt: string): string {
  return `wa:${channelId}:${issue}:${startedAt}`;
}
export function planIncidentAlerts(channelId: string, view: IncidentView | null) {
  if (!view || view.stale) return { open: [], close: [] };
  return {
    open: view.active.filter(i => i.issue === "SOCKET_REVIEW" || i.durationMs >= ALERT_MIN_DURATION_MS)
      .map(i => ({ reference: incidentReference(channelId, i.issue, i.startedAt), code: i.issue })),
    close: view.recent.map(i => ({
      reference: incidentReference(channelId, i.issue, i.startedAt),
      code: i.outcome === "OBSERVATION_INTERRUPTED" ? "OBSERVATION_INTERRUPTED" : "CONDITION_NO_LONGER_OBSERVED",
    })),
  };
}
