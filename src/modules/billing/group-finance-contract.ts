import type { AdminFinancialReport } from "./admin-financial-report";

/**
 * Versioned reporting DTO for an eventual authenticated DRVO Tech ingestion.
 * No network endpoint and no cross-product database writes are created here.
 * DRVO Tech must not treat these approved collections as recognized revenue.
 */
export const DRVO_AUTORESPONSE_PRODUCT_ID = "DRVO_AUTORESPONSE" as const;

export type ProductFinancialSnapshotV1 = {
  schemaVersion: 1;
  productId: typeof DRVO_AUTORESPONSE_PRODUCT_ID;
  generatedAtUtc: string;
  periodBasis: "APPROVAL_UTC";
  currency: "EGP";
  figures: {
    approvedCollectionsThisMonthMinor: number;
    approvedCollectionsLifetimeMinor: number;
    estimatedMonthlyPlanRunRateMinor: number;
    pendingPaymentRequestsMinor: number;
  };
  subscriptions: {
    activePaid: number;
    activeFree: number;
    trialing: number;
    pastDue: number;
    expiringWithinSevenDays: number;
  };
  monthlyApprovedCollections: Array<{
    period: string;
    amountMinor: number;
    approvedPayments: number;
  }>;
};

function toMinorUnits(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError("Financial amount must be finite and non-negative");
  }
  const scaled = Math.round(value * 100);
  if (!Number.isSafeInteger(scaled)) {
    throw new RangeError("Financial amount is too large for minor units");
  }
  return scaled;
}

/**
 * Output representation only. Future sync must include authenticated product
 * identity, idempotent ingestion, reconciliation and payment-level event keys.
 * Snapshot values alone cannot safely replace an actual payment ledger.
 */
export function toProductFinancialSnapshot(
  report: AdminFinancialReport,
): ProductFinancialSnapshotV1 {
  const o = report.overview;
  return {
    schemaVersion: 1,
    productId: DRVO_AUTORESPONSE_PRODUCT_ID,
    generatedAtUtc: report.generatedAtUtc.toISOString(),
    periodBasis: "APPROVAL_UTC",
    currency: "EGP",
    figures: {
      approvedCollectionsThisMonthMinor: toMinorUnits(o.collectedEgp),
      approvedCollectionsLifetimeMinor: toMinorUnits(o.allTimeCollectedEgp),
      estimatedMonthlyPlanRunRateMinor: toMinorUnits(o.estimatedMonthlyRunRateEgp),
      pendingPaymentRequestsMinor: toMinorUnits(o.pendingAmountEgp),
    },
    subscriptions: {
      activePaid: o.activePaid,
      activeFree: o.activeFree,
      trialing: o.trialing,
      pastDue: o.pastDue,
      expiringWithinSevenDays: o.expiringSoon,
    },
    monthlyApprovedCollections: report.trend.map((item) => ({
      period: item.month,
      amountMinor: toMinorUnits(item.amountEgp),
      approvedPayments: item.approvals,
    })),
  };
}
