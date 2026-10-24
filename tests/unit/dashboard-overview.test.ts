import { describe, expect, it } from "vitest";
import { describeOverviewConnection } from "@/lib/dashboard/connection-state";
import { fillOverviewTrend } from "@/lib/dashboard/overview-trend";

describe("dashboard live WhatsApp states", () => {
  it("only enables sending for a verified READY connection", () => {
    for (const state of ["NOT_CONNECTED", "STARTING", "QR_REQUIRED", "CONNECTING",
      "DISCONNECTED", "LOGGED_OUT", "ERROR", "RUNTIME_DISABLED"] as const) {
      expect(describeOverviewConnection(state, "healthy").canSend).toBe(false);
    }
    expect(describeOverviewConnection(null, null).canSend).toBe(false);
    expect(describeOverviewConnection("READY", "healthy").canSend).toBe(true);
  });

  it("handles QR required and logged out as linking actions", () => {
    for (const state of ["QR_REQUIRED", "LOGGED_OUT"] as const) {
      const view = describeOverviewConnection(state, null);
      expect(view.actionLabel).toBe("اربط واتساب");
      expect(view.title).toContain("إعادة ربط");
    }
  });

  it("surfaces inbound degraded independently of the socket", () => {
    const view = describeOverviewConnection("READY", "degraded");
    expect(view.tone).toBe("warning");
    expect(view.canSend).toBe(true);
    expect(view.detail).toContain("وصول الرسائل");
  });

  it("never claims healthy inbound when reception has not been verified", () => {
    expect(describeOverviewConnection("READY", null).tone).toBe("neutral");
    expect(describeOverviewConnection("READY", "unknown").tone).toBe("neutral");
  });
});

describe("seven-day overview trend", () => {
  it("fills missing UTC dates with zero and preserves daily counts", () => {
    const days = fillOverviewTrend(
      [{ date: "2026-10-23", conversations: 4 }, { date: "2026-10-24", conversations: 7 }],
      new Date("2026-10-24T22:10:00Z"),
    );
    expect(days).toHaveLength(7);
    expect(days[0]).toEqual({ date: "2026-10-18", conversations: 0 });
    expect(days[5]).toEqual({ date: "2026-10-23", conversations: 4 });
    expect(days[6]).toEqual({ date: "2026-10-24", conversations: 7 });
  });

  it("works across a month boundary", () => {
    const days = fillOverviewTrend([], new Date("2026-11-02T01:00:00Z"));
    expect(days.map((d) => d.date)).toEqual([
      "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30",
      "2026-10-31", "2026-11-01", "2026-11-02",
    ]);
  });
});
