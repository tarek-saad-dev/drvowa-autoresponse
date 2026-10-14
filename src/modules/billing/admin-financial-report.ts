
import { query, sql } from "@/lib/db";

/**
 * Platform-only, read-only financial reporting.
 *
 * Collected revenue is recognized here ONLY when a manual payment request was
 * APPROVED (not when initiated or submitted). These are approved collections,
 * not invoices, net revenue, tax or a settlement confirmation from InstaPay.
 *
 * "Plan run rate" uses today's plan catalog prices, NOT historical contractual
 * prices or payment receipts. Keep it separately labelled as an estimate.
 */
export type FinancialOverview = {
  collectedEgp: number;
  previousMonthEgp: number;
  allTimeCollectedEgp: number;
  approvedCount: number;
  pendingCount: number;
  pendingAmountEgp: number;
  activePaid: number;
  activeFree: number;
  trialing: number;
  pastDue: number;
  expiringSoon: number;
  estimatedMonthlyRunRateEgp: number;
  businesses: number;
};

export type MonthlyCollection = {
  month: string;
  amountEgp: number;
  approvals: number;
};

export type PlanBreakdown = {
  code: string;
  name: string;
  count: number;
};

export type UpcomingRenewal = {
  subscriptionId: string;
  businessName: string;
  planName: string;
  periodEndUtc: Date;
  monthlyPriceEgp: number | null;
};

export type RecentCollection = {
  paymentRequestId: string;
  businessName: string;
  planName: string;
  amountEgp: number;
  reviewedAtUtc: Date;
  reference: string;
};

export type AdminFinancialReport = {
  overview: FinancialOverview;
  months: 6 | 12;
  trend: MonthlyCollection[];
  plans: PlanBreakdown[];
  renewals: UpcomingRenewal[];
  recent: RecentCollection[];
  generatedAtUtc: Date;
};

type PaymentTotals = {
  CollectedEgp: number | null;
  PreviousMonthEgp: number | null;
  AllTimeCollectedEgp: number | null;
  ApprovedCount: number;
  PendingCount: number;
  PendingAmountEgp: number | null;
};
type SubscriptionTotals = {
  ActivePaid: number;
  ActiveFree: number;
  Trialing: number;
  PastDue: number;
  ExpiringSoon: number;
  EstimatedMrr: number | null;
};
type TrendRow = { MonthStart: Date; AmountEgp: number; Approvals: number };
type PlanRow = { Code: string; DisplayName: string; Cnt: number };
type RenewalRow = {
  SubscriptionID: string;
  BusinessName: string;
  PlanName: string;
  PeriodEndUtc: Date;
  MonthlyPrice: number | null;
};
type CollectionRow = {
  PaymentRequestID: string;
  BusinessName: string;
  PlanName: string;
  Amount: number;
  ReviewedAtUtc: Date;
  PaymentReference: string;
};

const CURRENT_SUBSCRIPTIONS = `
  WITH RankedSubscriptions AS (
    SELECT s.*, ROW_NUMBER() OVER (
      PARTITION BY s.BusinessID
      ORDER BY s.CreatedAtUtc DESC, s.SubscriptionID DESC
    ) AS rn
    FROM TblSubscription s
  )
`;

/** All amounts displayed in EGP; never silently combine different currencies. */
export async function getAdminFinancialReport(params: {
  months?: 6 | 12;
} = {}): Promise<AdminFinancialReport> {
  const months: 6 | 12 = params.months === 12 ? 12 : 6;
  const now = new Date();
  const currentStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const previousStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const nextStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const trendStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - months + 1, 1));

  const [
    payments, subscriptions, businesses, monthly, breakdown, renewals, recent,
  ] = await Promise.all([
    query<PaymentTotals>(`
      SELECT
        COALESCE(SUM(CASE WHEN Status = N'APPROVED' AND CurrencyCode = N'EGP'
          AND ReviewedAtUtc >= @monthStart AND ReviewedAtUtc < @nextStart
          THEN Amount ELSE 0 END), 0) AS CollectedEgp,
        COALESCE(SUM(CASE WHEN Status = N'APPROVED' AND CurrencyCode = N'EGP'
          AND ReviewedAtUtc >= @previousStart AND ReviewedAtUtc < @monthStart
          THEN Amount ELSE 0 END), 0) AS PreviousMonthEgp,
        COALESCE(SUM(CASE WHEN Status = N'APPROVED' AND CurrencyCode = N'EGP'
          THEN Amount ELSE 0 END), 0) AS AllTimeCollectedEgp,
        COUNT(CASE WHEN Status = N'APPROVED' AND CurrencyCode = N'EGP'
          AND ReviewedAtUtc >= @monthStart AND ReviewedAtUtc < @nextStart THEN 1 END) AS ApprovedCount,
        COUNT(CASE WHEN Status = N'PENDING' THEN 1 END) AS PendingCount,
        COALESCE(SUM(CASE WHEN Status = N'PENDING' AND CurrencyCode = N'EGP'
          THEN Amount ELSE 0 END), 0) AS PendingAmountEgp
      FROM TblManualPaymentRequest
    `, [
      { name: "monthStart", type: sql.DateTime2, value: currentStart },
      { name: "previousStart", type: sql.DateTime2, value: previousStart },
      { name: "nextStart", type: sql.DateTime2, value: nextStart },
    ]),
    query<SubscriptionTotals>(CURRENT_SUBSCRIPTIONS + `
      SELECT
        COUNT(CASE WHEN s.Status = N'ACTIVE' AND p.Code <> N'FREE'
          AND (s.PeriodEndUtc IS NULL OR s.PeriodEndUtc > SYSUTCDATETIME()) THEN 1 END) AS ActivePaid,
        COUNT(CASE WHEN s.Status = N'ACTIVE' AND p.Code = N'FREE' THEN 1 END) AS ActiveFree,
        COUNT(CASE WHEN s.Status = N'TRIALING'
          AND (s.PeriodEndUtc IS NULL OR s.PeriodEndUtc > SYSUTCDATETIME()) THEN 1 END) AS Trialing,
        COUNT(CASE WHEN s.Status = N'PAST_DUE' THEN 1 END) AS PastDue,
        COUNT(CASE WHEN s.Status = N'ACTIVE' AND p.Code <> N'FREE'
          AND s.PeriodEndUtc > SYSUTCDATETIME()
          AND s.PeriodEndUtc <= DATEADD(DAY, 7, SYSUTCDATETIME()) THEN 1 END) AS ExpiringSoon,
        COALESCE(SUM(CASE WHEN s.Status = N'ACTIVE' AND p.Code <> N'FREE'
          AND (s.PeriodEndUtc IS NULL OR s.PeriodEndUtc > SYSUTCDATETIME())
          AND p.BillingInterval = N'MONTHLY' AND p.CurrencyCode = N'EGP'
          THEN COALESCE(p.MonthlyPriceAmount, 0) ELSE 0 END), 0) AS EstimatedMrr
      FROM RankedSubscriptions s
      INNER JOIN TblPlan p ON p.PlanID = s.PlanID
      WHERE s.rn = 1
    `),
    query<{ Cnt: number }>("SELECT COUNT(1) AS Cnt FROM TblBusiness"),
    query<TrendRow>(`
      SELECT DATEFROMPARTS(YEAR(ReviewedAtUtc), MONTH(ReviewedAtUtc), 1) AS MonthStart,
        SUM(Amount) AS AmountEgp, COUNT(1) AS Approvals
      FROM TblManualPaymentRequest
      WHERE Status = N'APPROVED' AND CurrencyCode = N'EGP'
        AND ReviewedAtUtc >= @trendStart AND ReviewedAtUtc < @nextStart
      GROUP BY YEAR(ReviewedAtUtc), MONTH(ReviewedAtUtc)
      ORDER BY MonthStart ASC
    `, [
      { name: "trendStart", type: sql.DateTime2, value: trendStart },
      { name: "nextStart", type: sql.DateTime2, value: nextStart },
    ]),
    query<PlanRow>(CURRENT_SUBSCRIPTIONS + `
      SELECT p.Code, p.DisplayName, COUNT(1) AS Cnt
      FROM RankedSubscriptions s
      INNER JOIN TblPlan p ON p.PlanID = s.PlanID
      WHERE s.rn = 1 AND s.Status IN (N'ACTIVE', N'TRIALING', N'PAST_DUE')
        AND (s.PeriodEndUtc IS NULL OR s.PeriodEndUtc > SYSUTCDATETIME())
      GROUP BY p.Code, p.DisplayName
      ORDER BY Cnt DESC, p.DisplayName ASC
    `),
    query<RenewalRow>(CURRENT_SUBSCRIPTIONS + `
      SELECT TOP (7) s.SubscriptionID, b.Name AS BusinessName,
        p.DisplayName AS PlanName, s.PeriodEndUtc,
        CASE WHEN p.CurrencyCode = N'EGP' THEN p.MonthlyPriceAmount ELSE NULL END AS MonthlyPrice
      FROM RankedSubscriptions s
      INNER JOIN TblBusiness b ON b.BusinessID = s.BusinessID
      INNER JOIN TblPlan p ON p.PlanID = s.PlanID
      WHERE s.rn = 1 AND s.Status = N'ACTIVE' AND p.Code <> N'FREE'
        AND s.PeriodEndUtc > SYSUTCDATETIME()
        AND s.PeriodEndUtc <= DATEADD(DAY, 14, SYSUTCDATETIME())
      ORDER BY s.PeriodEndUtc ASC
    `),
    query<CollectionRow>(`
      SELECT TOP (7) p.PaymentRequestID, b.Name AS BusinessName,
        p.RequestedPlanDisplayName AS PlanName, p.Amount,
        p.ReviewedAtUtc, p.PaymentReference
      FROM TblManualPaymentRequest p
      INNER JOIN TblBusiness b ON b.BusinessID = p.BusinessID
      WHERE p.Status = N'APPROVED' AND p.CurrencyCode = N'EGP'
        AND p.ReviewedAtUtc IS NOT NULL
      ORDER BY p.ReviewedAtUtc DESC, p.PaymentRequestID DESC
    `),
  ]);

  const p = payments.recordset[0];
  const s = subscriptions.recordset[0];
  const points = new Map(
    monthly.recordset.map((row) => [
      new Date(row.MonthStart).toISOString().slice(0, 7),
      { amountEgp: Number(row.AmountEgp), approvals: Number(row.Approvals) },
    ]),
  );

  // Explicit zero buckets: chart does not skip months with no collections.
  const trend = Array.from({ length: months }, (_, i) => {
    const date = new Date(Date.UTC(
      trendStart.getUTCFullYear(), trendStart.getUTCMonth() + i, 1,
    ));
    const month = date.toISOString().slice(0, 7);
    return { month, ...(points.get(month) ?? { amountEgp: 0, approvals: 0 }) };
  });

  return {
    months,
    generatedAtUtc: now,
    overview: {
      collectedEgp: Number(p?.CollectedEgp ?? 0),
      previousMonthEgp: Number(p?.PreviousMonthEgp ?? 0),
      allTimeCollectedEgp: Number(p?.AllTimeCollectedEgp ?? 0),
      approvedCount: Number(p?.ApprovedCount ?? 0),
      pendingCount: Number(p?.PendingCount ?? 0),
      pendingAmountEgp: Number(p?.PendingAmountEgp ?? 0),
      activePaid: Number(s?.ActivePaid ?? 0),
      activeFree: Number(s?.ActiveFree ?? 0),
      trialing: Number(s?.Trialing ?? 0),
      pastDue: Number(s?.PastDue ?? 0),
      expiringSoon: Number(s?.ExpiringSoon ?? 0),
      estimatedMonthlyRunRateEgp: Number(s?.EstimatedMrr ?? 0),
      businesses: Number(businesses.recordset[0]?.Cnt ?? 0),
    },
    trend,
    plans: breakdown.recordset.map((row) => ({
      code: row.Code, name: row.DisplayName, count: Number(row.Cnt),
    })),
    renewals: renewals.recordset.map((row) => ({
      subscriptionId: String(row.SubscriptionID),
      businessName: row.BusinessName,
      planName: row.PlanName,
      periodEndUtc: new Date(row.PeriodEndUtc),
      monthlyPriceEgp: row.MonthlyPrice == null ? null : Number(row.MonthlyPrice),
    })),
    recent: recent.recordset.map((row) => ({
      paymentRequestId: String(row.PaymentRequestID),
      businessName: row.BusinessName,
      planName: row.PlanName,
      amountEgp: Number(row.Amount),
      reviewedAtUtc: new Date(row.ReviewedAtUtc),
      reference: row.PaymentReference,
    })),
  };
}
