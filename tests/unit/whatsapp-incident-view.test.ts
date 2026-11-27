import { describe, expect, it } from "vitest";
import { buildIncidentView } from "@/modules/channels/incident-view";
const ts = "2026-11-27T00:00:00.000Z";
const row = { issue: "PEER_CRYPTO", startedAt: ts, durationMs: 30000 };
describe("admin incident projection", () => {
  it("preserves only allowed fields and bounded known issues", () => {
    const result = buildIncidentView({ lastSampleAt: ts, active: [{ ...row, jid: "private" }, { ...row, issue: "unknown" }], recent: [{ ...row, endedAt: ts, raw: "secret" }] }, Date.parse(ts));
    expect(result?.active).toEqual([row]);
    expect(result?.recent).toEqual([{ ...row, endedAt: ts, outcome: "CONDITION_NO_LONGER_OBSERVED" }]);
    const interrupted = buildIncidentView({ lastSampleAt: ts, persistence: "WRITE_ERROR", recent: [{ ...row, endedAt: ts, outcome: "OBSERVATION_INTERRUPTED" }] }, Date.parse(ts));
    expect(interrupted?.recent[0].outcome).toBe("OBSERVATION_INTERRUPTED");
    expect(interrupted?.persistence).toBe("WRITE_ERROR");
    expect(JSON.stringify(result)).not.toContain("secret");
    expect(JSON.stringify(result)).not.toContain("private");
  });
  it("distinguishes absent and stale monitoring from a fresh sample", () => {
    expect(buildIncidentView(null)).toBeNull();
    expect(buildIncidentView({ lastSampleAt: ts }, Date.parse(ts))?.stale).toBe(false);
    expect(buildIncidentView({ lastSampleAt: ts }, Date.parse(ts) + 46000)?.stale).toBe(true);
  });
});
