import { describe, expect, it } from "vitest";

import { resolveUtcMonthPeriod } from "@/modules/billing/period";
import {
  PLAN_ERROR_CODES,
  PlanEntitlementError,
  isPlanEntitlementError,
} from "@/modules/billing/errors";

describe("billing period helpers", () => {
  it("resolves UTC month bounds", () => {
    const p = resolveUtcMonthPeriod(new Date(Date.UTC(2026, 8, 21, 12)));
    expect(p.usagePeriodStartUtc.toISOString()).toBe("2026-09-01T00:00:00.000Z");
    expect(p.usagePeriodEndUtc.toISOString()).toBe("2026-10-01T00:00:00.000Z");
  });
});

describe("plan entitlement errors", () => {
  it("exposes stable codes", () => {
    const err = new PlanEntitlementError(PLAN_ERROR_CODES.AI_QUOTA_EXCEEDED);
    expect(isPlanEntitlementError(err)).toBe(true);
    expect(err.statusCode).toBe(403);
    expect(err.code).toBe("PLAN_AI_QUOTA_EXCEEDED");
  });
});
