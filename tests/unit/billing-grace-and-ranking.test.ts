import { describe, expect, it } from "vitest";
import { gracePeriodEnded } from "@/modules/billing/subscription-period";
import { isDowngrade } from "@/modules/billing/scheduled-changes";

describe("billing effective dates and plan order", () => {
  it("ends grace at exactly five elapsed days, not at midnight", () => {
    const end = new Date("2026-10-01T17:23:00Z");
    expect(gracePeriodEnded(end, new Date("2026-10-06T17:22:59.999Z"))).toBe(false);
    expect(gracePeriodEnded(end, new Date("2026-10-06T17:23:00Z"))).toBe(true);
    expect(gracePeriodEnded(null)).toBe(false);
  });
  it("orders plans by capability rather than annual/monthly price", () => {
    expect(isDowngrade("BUSINESS", "PRO")).toBe(true);
    expect(isDowngrade("PRO", "STARTER")).toBe(true);
    expect(isDowngrade("STARTER", "STARTER")).toBe(false);
    expect(isDowngrade("FREE", "STARTER")).toBe(false);
    expect(() => isDowngrade("UNKNOWN", "FREE")).toThrow();
  });
});
