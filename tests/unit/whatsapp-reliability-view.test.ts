import { describe, expect, it } from "vitest";
import { buildReliabilityView, reliabilityCopy } from "@/modules/channels/reliability-view";
const ready = { ready: true, state: "READY" };
const time = "2026-11-27T00:00:00.000Z";
const both = { status: "BOTH_OBSERVED", lastLivePlaintextAt: time, lastOutboundDeliveryAckAt: time };
describe("customer reliability status", () => {
  it("does not invent observations for old runtimes or socket readiness", () => {
    expect(buildReliabilityView(ready)).toBeNull();
    expect(buildReliabilityView({ ...ready, deliveryEvidence: { status: "UNVERIFIED" } })).toEqual({ evidence: "unverified", issue: null });
    expect(buildReliabilityView({ ...ready, deliveryEvidence: { status: "BOTH_OBSERVED" } })?.evidence).toBe("unknown");
  });
  it("reports live evidence separately, with crypto issues taking precedence in copy", () => {
    expect(buildReliabilityView({ ...ready, deliveryEvidence: both })).toEqual({ evidence: "both", issue: null });
    const view = buildReliabilityView({ ...ready, deliveryEvidence: both, peerCryptoHealth: { status: "DEGRADED", peer: "secret" } });
    expect(view).toEqual({ evidence: "both", issue: "crypto" });
    expect(reliabilityCopy(view)).toContain("فك تشفير");
    expect(JSON.stringify(view)).not.toContain("secret");
    expect(buildReliabilityView({ ...ready, peerCryptoHealth: { status: "TRAFFIC_RESUMED_WITH_UNRESOLVED_MESSAGES" } })?.issue).toBe("unresolved");
  });
  it("never shows stale delivery evidence while disconnected", () => {
    expect(buildReliabilityView({ ready: false, state: "ERROR", deliveryEvidence: both, socketRecovery: { action: "RETRY_EXHAUSTED" } })).toEqual({ evidence: "unknown", issue: "review" });
    expect(buildReliabilityView({ ready: false, state: "DISCONNECTED", socketRecovery: { action: "RETRY_SCHEDULED" } })?.issue).toBe("reconnecting");
  });
});
