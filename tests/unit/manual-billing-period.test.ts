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
      addOneCalendarMonth(currentEnd).toISOString(),
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
      addOneCalendarMonth(now).toISOString(),
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
