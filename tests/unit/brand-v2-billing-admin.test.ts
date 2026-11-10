import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const billing = read("src/app/(app)/dashboard/billing/page.tsx");
const plans = read("src/components/dashboard/billing-plans-client.tsx");
const actions = read("src/components/dashboard/billing-customer-actions.tsx");
const invoice = read("src/app/(app)/dashboard/billing/documents/page.tsx");
const preview = read("src/app/(app)/dashboard/billing/pricing-preview/page.tsx");
const adminLayout = read("src/app/admin/layout.tsx");
const nav = read("src/components/admin/admin-navigation.tsx");
const financials = read("src/components/admin/admin-financial-dashboard.tsx");
const ledger = read("src/components/admin/billing-ledger-summary.tsx");
const payments = read("src/components/admin/admin-payments-panel.tsx");
const paymentPage = read("src/app/admin/payments/page.tsx");
const refunds = read("src/components/admin/refunds-panel.tsx");
const refundPage = read("src/app/admin/refunds/page.tsx");
const adminActions = read("src/components/admin/billing-admin-actions.tsx");
const discounts = read("src/components/admin/admin-discount-codes.tsx");
const subscriptions = read("src/app/admin/subscriptions/page.tsx");

describe("Brand V2 billing and platform admin design contracts", () => {
  it("uses canonical AutoRespond brand and drops the legacy cyan financial glow", () => {
    expect(adminLayout).toContain("إدارة DRVO AutoRespond");
    expect(financials).toContain("لوحة قيادة DRVO AutoRespond");
    expect(adminLayout).not.toContain("AutoResponse");
    expect(financials).not.toContain("AutoResponse");
    expect(financials).not.toContain("bg-cyan-400");
    expect(financials).toContain("bg-primary/10");
    expect(financials).toContain("font-display text-2xl font-bold");
  });

  it("preserves InstaPay identity separately from DRVO brand UI", () => {
    expect(plans).toContain('aria-label="الدفع عبر InstaPay"');
    expect(plans).toContain("#69338d");
    expect(plans).toContain("تحويل يدوي • مراجعة بشرية");
    expect(plans).toContain("مرجع طلب DRVO");
    expect(plans).toContain("تأكد من اسمه قبل اعتماد التحويل");
  });

  it("never claims a payment is approved while the manual transfer is under review", () => {
    expect(plans).toContain("initialPendingReview");
    expect(plans).toContain("بانتظار اعتماد التحويل");
    expect(plans).toContain("إرسال تأكيد التحويل للمراجعة");
    expect(plans).toContain("disabled={submitting || !payerName.trim()}");
    expect(plans).toContain("loading={submitting}");
    expect(billing).toContain("مش معنى كده إن الدفع اتعتمد أو الباقة اتفعّلت");
    expect(billing).toContain("initialPendingReview={pendingReview}");
  });

  it("keeps actual backend plan, promotional quote and customer usage values", () => {
    expect(billing).toContain("isPricingV1PaymentEnabled()");
    expect(billing).toContain("quotePricingV1(");
    expect(billing).toContain("overview.aiUsed");
    expect(billing).toContain("overview.whatsappOutboundUsed");
    expect(plans).toContain("validQuote");
    expect(plans).toContain("billingInterval");
    expect(plans).toContain("discountCode");
    expect(plans).toContain("disabled={!validQuote || quoting || creating}");
    expect(preview).toContain("غير مفعّلة للدفع");
  });

  it("does not silently collapse trial, grace, scheduled cancellation or quota warning states", () => {
    expect(billing).toContain("freeTrial.expired");
    expect(billing).toContain("nearExhaustion");
    expect(billing).toContain("grace ?");
    expect(billing).toContain("needsAttention ?");
    expect(billing).toContain("scheduled && !scheduledIncomplete");
    expect(billing).toContain("BillingCustomerActions");
  });

  it("maintains distinct customer-requested, processing, succeeded and failed refund statuses", () => {
    for (const term of ["REQUESTED", "PROCESSING", "SUCCEEDED", "FAILED", "REJECTED"]) {
      expect(actions).toContain(term);
    }
    expect(actions).toContain('action: "request_refund"');
    expect(actions).toContain("canManage");
    expect(actions).toContain("اشتراكك لن يُلغى بمجرد إرسال هذا الطلب");
    expect(refunds).toContain("تم تحويله فعليًا");
    expect(refunds).toContain("window.confirm");
    expect(refunds).toContain("!reference.trim()");
    expect(refundPage).toContain("isRefundProcessingAllowed");
  });

  it("keeps ledger arithmetic and refund cash movements based only on confirmed transfers", () => {
    expect(ledger).toContain("f.State = N'SUCCEEDED'");
    expect(ledger).toContain("(Number(row.Gross) - Number(row.Refunded)).toFixed(2)");
    expect(ledger).toContain("طلبات الاسترداد المعلقة لا تُخصم");
    expect(ledger).toContain('row.State === "SUCCEEDED"');
    expect(ledger).toContain('row.State === "FAILED"');
    expect(ledger).toContain("text-destructive");
    expect(ledger).toContain('scope="col"');
  });

  it("retains admin permissions, payment approval confirmation and dangerous-action safeguards", () => {
    expect(adminLayout).toContain("requirePlatformAdmin()");
    expect(payments).toContain("window.confirm");
    expect(payments).toContain('act("approve")');
    expect(payments).toContain('act("reject")');
    expect(payments).toContain('role="dialog" aria-modal="true"');
    expect(adminActions).toContain("مرجع تحويل الاسترداد");
    expect(adminActions).toContain("بعد التحويل الفعلي");
    expect(adminActions).toContain("window.confirm");
    expect(paymentPage).toContain("status=PENDING");
  });

  it("keeps discount caps, influencer link and usage constraints without enabling new payment paths", () => {
    expect(discounts).toContain("maxRedemptions");
    expect(discounts).toContain("form.kind");
    expect(discounts).toContain('max={form.kind==="PERCENT"?90:100000}');
    expect(discounts).toContain("https://drvoautorespond.com/promo/");
    expect(discounts).toContain('action:"toggle"');
    expect(discounts).toContain("grid grid-cols-1 gap-3 sm:grid-cols-2");
    expect(discounts).toContain("focus-visible:ring-ring/25");
  });

  it("preserves invoice and receipt distinction plus tenant-scoped document retrieval", () => {
    expect(invoice).toContain("resolveActiveBusiness");
    expect(invoice).toContain("listBillingDocuments");
    expect(invoice).toContain("فاتورة INV-");
    expect(invoice).toContain("إيصال RCT-");
    expect(invoice).toContain("RefundState");
    expect(invoice).toContain("break-inside-avoid");
  });

  it("supports responsive and keyboard operation for finance and subscription review", () => {
    expect(nav).toContain('aria-current={current ? "page" : undefined}');
    expect(nav).toContain("min-h-11");
    expect(nav).toContain("focus-visible:outline-ring");
    expect(payments).toContain('tabIndex={0}');
    expect(payments).toContain('event.key === "Enter"');
    expect(payments).toContain('event.key === " "');
    expect(payments).toContain("max-h-[90dvh]");
    expect(refunds).toContain("max-h-[90dvh]");
    expect(subscriptions).toContain("focus-visible:border-ring");
    expect(subscriptions).toContain('aria-current={value === status ? "page" : undefined}');
  });
});
