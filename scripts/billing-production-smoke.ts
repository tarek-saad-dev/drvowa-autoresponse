/**
 * Read-only production billing verification. Does not approve payments, change
 * subscriptions, send email, or trigger maintenance. Safe for every deploy.
 */
import { closePool, query } from "../src/lib/db";
import { getAdminFinancialReport } from "../src/modules/billing/admin-financial-report";
import { listConfirmedRefundsForGroupFinance } from "../src/modules/billing/group-finance-refunds";
import { configuredFinanceExportToken } from "../src/modules/billing/group-finance-export-auth";
import { productionRefundReadiness } from "../src/modules/billing/refund-readiness";

type Totals = {
  GrossMinor: number | string | null;
  RefundMinor: number | string | null;
  InvalidRefunds: number;
  RefundCount: number;
};

async function main() {
  // The deploy process must load the same financial EnvironmentFile as systemd.
  // Missing or invalid payment capture configuration is a failed smoke, while
  // the deliberately disabled refund flag is a successful disabled state.
  const readiness = productionRefundReadiness(process.env, Boolean(configuredFinanceExportToken()));
  const [report, totalsResult] = await Promise.all([
    getAdminFinancialReport({ months: 6 }),
    query<Totals>(`
      SELECT
        (SELECT COALESCE(SUM(CONVERT(BIGINT, ROUND(p.Amount * 100, 0))), 0)
          FROM dbo.TblManualPaymentRequest p
          WHERE p.Status = N'APPROVED' AND p.CurrencyCode = N'EGP') AS GrossMinor,
        (SELECT COALESCE(SUM(r.AmountMinor), 0) FROM dbo.TblBillingRefund r
          WHERE r.State = N'SUCCEEDED' AND r.CurrencyCode = N'EGP') AS RefundMinor,
        (SELECT COUNT(1) FROM dbo.TblBillingRefund r
          LEFT JOIN dbo.TblManualPaymentRequest p ON p.PaymentRequestID = r.PaymentRequestID
          LEFT JOIN dbo.TblBillingInvoice i ON i.InvoiceID = r.InvoiceID
          WHERE r.State = N'SUCCEEDED' AND (
            p.PaymentRequestID IS NULL OR p.Status <> N'APPROVED'
            OR i.InvoiceID IS NULL OR i.PaymentRequestID <> r.PaymentRequestID
            OR i.Status <> N'PAID' OR r.CurrencyCode <> N'EGP'
            OR p.CurrencyCode <> r.CurrencyCode OR i.CurrencyCode <> r.CurrencyCode
            OR r.AmountMinor <= 0 OR r.AmountMinor > i.TotalMinor
            OR r.CompletedAtUtc IS NULL OR r.TransferReference IS NULL
          )) AS InvalidRefunds,
        (SELECT COUNT(1) FROM dbo.TblBillingRefund WHERE State = N'SUCCEEDED') AS RefundCount
    `),
  ]);
  const totals = totalsResult.recordset[0];
  if (!totals) throw new Error("Missing billing control totals");
  const gross = Number(totals.GrossMinor);
  const refunds = Number(totals.RefundMinor);
  if (!Number.isSafeInteger(gross) || !Number.isSafeInteger(refunds) ||
      gross < 0 || refunds < 0 || refunds > gross) {
    throw new Error("Invalid gross/refund financial control totals");
  }
  if (Number(totals.InvalidRefunds) !== 0) {
    throw new Error("Confirmed refunds do not match their approved payment and paid invoice");
  }
  if (gross !== Math.round(report.overview.allTimeCollectedEgp * 100)) {
    throw new Error("Product financial dashboard disagrees with approved collections");
  }

  // Check the token-protected feed's backing query without exposing credentials.
  // Replaying the same cursor must never change the financial fact.
  const first = await listConfirmedRefundsForGroupFinance({ limit: "1" });
  const replay = await listConfirmedRefundsForGroupFinance({ limit: "1" });
  if (JSON.stringify(first) !== JSON.stringify(replay)) {
    throw new Error("Refund feed is not replayable");
  }
  if ((Number(totals.RefundCount) > 0) !== (first.events.length > 0)) {
    throw new Error("Refund feed missing confirmed refunds");
  }
  if (first.events.length && first.events[0].amountMinor <= 0) {
    throw new Error("Refund export has invalid minor units");
  }

  console.log("[billing-production-smoke] PASS", {
    approvedCollectionsMinor: gross,
    confirmedRefundsMinor: refunds,
    netCollectionsMinor: gross - refunds,
    confirmedRefundCount: Number(totals.RefundCount),
    refundFeedReplayable: true,
    refundCaptureEnabled: readiness.refundCaptureEnabled,
    refundActionsEnabled: readiness.refundActionsEnabled,
    readOnly: true,
  });
}

main()
  .then(() => closePool())
  .catch(async (error: unknown) => {
    console.error("[billing-production-smoke] FAILED", error instanceof Error ? error.message : "unknown");
    await closePool();
    process.exitCode = 1;
  });
