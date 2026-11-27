import { describe, expect, it } from "vitest";
import { buildIncidentView } from "@/modules/channels/incident-view";
const ts = "2026-11-27T00:00:00.000Z";
const row = { issue: "PEER_CRYPTO", startedAt: ts, durationMs: 30000 };
describe("admin incident projection", () => {
  it("preserves only allowed fields and bounded known issues", () => {
    const result = buildIncidentView({ lastSampleAt: ts, active: [{ ...row, jid: "private" }, { ...row, issue: "unknown" }], recent: [{ ...row, endedAt: ts, raw: "secret" }] }, Date.parse(ts));
    expect(result?.active).toEqual([row]);
    expect(result?.recent).toEqual([{ ...row, endedAt: ts }]);
    expect(JSON.stringify(result)).not.toContain("secret");
    expect(JSON.stringify(result)).not.toContain("private");
  });
  it("distinguishes absent and stale monitoring from a fresh sample", () => {
    expect(buildIncidentView(null)).toBeNull();
    expect(buildIncidentView({ lastSampleAt: ts }, Date.parse(ts))?.stale).toBe(false);
    expect(buildIncidentView({ lastSampleAt: ts }, Date.parse(ts) + 46000)?.stale).toBe(true);
  });
});
