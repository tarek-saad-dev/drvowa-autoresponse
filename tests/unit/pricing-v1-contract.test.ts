import { describe, expect, it } from "vitest";
import {
  PRICING_V1_PLANS, PRICING_V1_ADDONS, PRICING_V1_COMING_SOON,
  getPricingV1Plan, isPricingV1AddonAllowed, getPricingV1AiReplyBalance,
  isPricingV1TrialExpired, pricingV1AnnualSavings,
} from "@/modules/pricing/pricing-v1-catalog";

describe("draft pricing v1 contract (not live)", () => {
  it("uses existing database plan codes and one WhatsApp number per plan", () => {
    expect(PRICING_V1_PLANS.map(p => p.code)).toEqual(["FREE", "STARTER", "PRO", "BUSINESS"]);
    expect(PRICING_V1_PLANS.every(p => p.whatsappNumbers === 1)).toBe(true);
    expect(PRICING_V1_COMING_SOON).toContain("multiple_whatsapp_numbers");
  });
  it("has agreed monthly, annual and reply limits", () => {
    expect(PRICING_V1_PLANS.map(p => [p.monthlyEgp, p.annualEgp, p.aiReplies]))
      .toEqual([[0, 0, 30], [299, 2990, 750], [599, 5990, 2500], [1199, 11990, 6000]]);
    for (const p of PRICING_V1_PLANS.filter(p => p.code !== "FREE")) {
      expect(pricingV1AnnualSavings(p.monthlyEgp, p.annualEgp)).toBeGreaterThan(0);
    }
  });
  it("does not permit addons on free or unknown plans", () => {
    expect(isPricingV1AddonAllowed("replies_250", "FREE")).toBe(false);
    expect(isPricingV1AddonAllowed("seat_1", "STARTER")).toBe(false);
    expect(isPricingV1AddonAllowed("seat_1", "PRO")).toBe(true);
    expect(isPricingV1AddonAllowed("replies_1000", "BUSINESS")).toBe(true);
    expect(isPricingV1AddonAllowed("does_not_exist", "PRO")).toBe(false);
    expect(PRICING_V1_ADDONS.some(a => String(a.code) === "multiple_whatsapp_numbers")).toBe(false);
  });
  it("free replies do not reset and balance cannot become negative", () => {
    expect(getPricingV1Plan("FREE")?.quotaPeriod).toBe("lifetime");
    expect(getPricingV1AiReplyBalance("FREE", 29)).toBe(1);
    expect(getPricingV1AiReplyBalance("FREE", 31)).toBe(0);
    expect(getPricingV1AiReplyBalance("PRO", 2400, 250)).toBe(350);
    expect(() => getPricingV1AiReplyBalance("PRO", -1)).toThrow();
  });
  it("free trial expires exactly seven 24-hour periods after activation", () => {
    const start = new Date("2026-10-01T12:00:00Z");
    expect(isPricingV1TrialExpired(start, new Date("2026-10-08T11:59:59Z"))).toBe(false);
    expect(isPricingV1TrialExpired(start, new Date("2026-10-08T12:00:00Z"))).toBe(true);
  });
});
