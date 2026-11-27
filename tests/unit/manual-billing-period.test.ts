import { describe, expect, it } from "vitest";

import { generatePaymentReference } from "@/modules/billing/payment-reference";
import {
  addOneCalendarMonth,
  computePaidSubscriptionPeriod,
  isSubscriptionPeriodExpired,
} from "@/modules/billing/subscription-period";

describe("subscription-period", () => {
  it("adds one calendar month and clamps overflow", () => {
    const from = new Date(Date.UTC(2026, 0, 31, 12, 0, 0));
    const next = addOneCalendarMonth(from);
    expect(next.toISOString()).toBe("2026-02-28T12:00:00.000Z");
  });

  it("extends from remaining PeriodEndUtc on same-plan renewal", () => {
    const now = new Date("2026-10-10T12:00:00.000Z");
    const currentEnd = new Date("2026-10-20T12:00:00.000Z");
    const period = computePaidSubscriptionPeriod({
      samePlanRenewal: true,
      currentPeriodEndUtc: currentEnd,
      now,
    });
    expect(period.periodStartUtc.toISOString()).toBe(currentEnd.toISOString());
    expect(period.periodEndUtc.toISOString()).toBe(
      new Date(currentEnd.getTime() + 30 * 86400000).toISOString(),
    );
  });

  it("starts from now on upgrade / expired renewal", () => {
    const now = new Date("2026-10-10T12:00:00.000Z");
    const period = computePaidSubscriptionPeriod({
      samePlanRenewal: false,
      currentPeriodEndUtc: new Date("2026-10-20T12:00:00.000Z"),
      now,
    });
    expect(period.periodStartUtc.toISOString()).toBe(now.toISOString());
    expect(period.periodEndUtc.toISOString()).toBe(
      new Date(now.getTime() + 30 * 86400000).toISOString(),
    );
  });

  it("detects expiry", () => {
    expect(
      isSubscriptionPeriodExpired({
        periodEndUtc: new Date("2020-01-01T00:00:00.000Z"),
        now: new Date("2026-01-01T00:00:00.000Z"),
      }),
    ).toBe(true);
    expect(
      isSubscriptionPeriodExpired({
        periodEndUtc: null,
        now: new Date(),
      }),
    ).toBe(false);
  });
});

describe("payment-reference", () => {
  it("generates unique DRV- references", () => {
    const a = generatePaymentReference();
    const b = generatePaymentReference();
    expect(a).toMatch(/^DRV-[A-Z2-9]{6}$/);
    expect(b).toMatch(/^DRV-[A-Z2-9]{6}$/);
    expect(a).not.toBe(b);
  });
});

it("supports an annual cycle and clamps leap day", () => {
  const result = computePaidSubscriptionPeriod({ samePlanRenewal: false,
    currentPeriodEndUtc: null, now: new Date("2024-02-29T12:00:00Z"), billingInterval: "ANNUAL" });
  expect(result.periodEndUtc.toISOString()).toBe("2025-02-28T12:00:00.000Z");
});


describe("fixed monthly billing and renewal grace", () => {
  const end = new Date("2026-12-31T12:00:00Z");
  for (const date of ["2026-12-15T12:00:00Z", "2026-12-31T12:00:00Z", "2027-01-02T12:00:00Z", "2027-01-05T11:59:59.999Z"]) {
    it("anchors renewal at expiry for " + date, () => {
      const result = computePaidSubscriptionPeriod({ samePlanRenewal: true, currentPeriodEndUtc: end, now: new Date(date) });
      expect(result.periodStartUtc.toISOString()).toBe(end.toISOString());
      expect(result.periodEndUtc.toISOString()).toBe("2027-01-30T12:00:00.000Z");
    });
  }
  it("starts a new cycle at the exact grace deadline", () => {
    const now = new Date("2027-01-05T12:00:00Z");
    const result = computePaidSubscriptionPeriod({ samePlanRenewal: true, currentPeriodEndUtc: end, now });
    expect(result.periodStartUtc).toEqual(now);
    expect(result.periodEndUtc.toISOString()).toBe("2027-02-04T12:00:00.000Z");
  });
  it("uses 30 days even across February", () => {
    const result = computePaidSubscriptionPeriod({ samePlanRenewal: false, currentPeriodEndUtc: null, now: new Date("2027-02-01T00:00:00Z") });
    expect(result.periodEndUtc.toISOString()).toBe("2027-03-03T00:00:00.000Z");
  });
});
