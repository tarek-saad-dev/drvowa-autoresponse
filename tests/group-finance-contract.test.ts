import { describe, expect, it } from "vitest";

import type { AdminFinancialReport } from "../src/modules/billing/admin-financial-report";
import {
  DRVO_AUTORESPONSE_PRODUCT_ID,
  toProductFinancialSnapshot,
} from "../src/modules/billing/group-finance-contract";

function report(): AdminFinancialReport {
  return {
    generatedAtUtc: new Date("2026-10-14T02:00:00.000Z"),
    months: 6,
    overview: {
      collectedEgp: 100.25,
      previousMonthEgp: 50,
      allTimeCollectedEgp: 400.25,
      approvedCount: 1,
      pendingCount: 2,
      pendingAmountEgp: 90.1,
      activePaid: 3,
      activeFree: 2,
      trialing: 1,
      pastDue: 0,
      expiringSoon: 1,
      estimatedMonthlyRunRateEgp: 250,
      businesses: 6,
    },
    trend: [{ month: "2026-10", amountEgp: 100.25, approvals: 1 }],
    plans: [{ code: "PRO", name: "Pro", count: 3 }],
    renewals: [],
    recent: [],
  };
}

describe("AutoResponse finance export contract", () => {
  it("keeps product identity and approval-date / currency semantics", () => {
    const result = toProductFinancialSnapshot(report());
    expect(result.productId).toBe(DRVO_AUTORESPONSE_PRODUCT_ID);
    expect(result.schemaVersion).toBe(1);
    expect(result.periodBasis).toBe("APPROVAL_UTC");
    expect(result.currency).toBe("EGP");
    expect(result.generatedAtUtc).toBe("2026-10-14T02:00:00.000Z");
  });

  it("uses minor units and never adds pending amounts to collections", () => {
    const result = toProductFinancialSnapshot(report());
    expect(result.figures.approvedCollectionsThisMonthMinor).toBe(10025);
    expect(result.figures.approvedCollectionsLifetimeMinor).toBe(40025);
    expect(result.figures.pendingPaymentRequestsMinor).toBe(9010);
    expect(result.figures.estimatedMonthlyPlanRunRateMinor).toBe(25000);
    expect(result.monthlyApprovedCollections).toEqual([
      { period: "2026-10", amountMinor: 10025, approvedPayments: 1 },
    ]);
  });

  it("rejects invalid or unsafe monetary values", () => {
    const data = report();
    data.overview.collectedEgp = Number.NaN;
    expect(() => toProductFinancialSnapshot(data)).toThrow(RangeError);
    data.overview.collectedEgp = 1e17;
    expect(() => toProductFinancialSnapshot(data)).toThrow(RangeError);
  });
});
