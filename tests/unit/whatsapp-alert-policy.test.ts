import { describe, expect, it } from "vitest";
import { incidentReference, planIncidentAlerts } from "@/modules/reliability/whatsapp-alert-policy";
import type { IncidentView } from "@/modules/channels/incident-view";
const start = "2026-11-27T00:00:00.000Z";
const view: IncidentView = { lastSampleAt: start, stale: false, persistence: "OK", active: [
  { issue: "SOCKET_REVIEW", startedAt: start, durationMs: 0 },
  { issue: "PEER_CRYPTO", startedAt: start, durationMs: 59999 },
  { issue: "INBOUND_DELIVERY_ERROR", startedAt: start, durationMs: 60000 },
], recent: [{ issue: "PEER_CRYPTO_UNRESOLVED", startedAt: start, endedAt: start, durationMs: 0, outcome: "OBSERVATION_INTERRUPTED" }] };
describe("WhatsApp runtime alert planning", () => {
  it("opens terminal incidents immediately and sustained incidents at threshold", () => {
    const p = planIncidentAlerts("channel", view);
    expect(p.open.map(x => x.code)).toEqual(["SOCKET_REVIEW", "INBOUND_DELIVERY_ERROR"]);
    expect(p.close[0].code).toBe("OBSERVATION_INTERRUPTED");
    expect(p).toEqual(planIncidentAlerts("channel", view));
    expect(incidentReference("another", "SOCKET_REVIEW", start)).not.toBe(p.open[0].reference);
  });
  it("does not open or close alerts from unavailable or stale telemetry", () => {
    expect(planIncidentAlerts("channel", null)).toEqual({ open: [], close: [] });
    expect(planIncidentAlerts("channel", { ...view, stale: true })).toEqual({ open: [], close: [] });
  });
});
