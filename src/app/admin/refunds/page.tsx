import { query } from "@/lib/db";
import { requirePlatformAdmin } from "@/modules/platform-admin/service";
import { RefundsPanel } from "@/components/admin/refunds-panel";
import { readSaasFinancialConfig } from "@/modules/billing/saas-financial-config";
import { configuredFinanceExportToken } from "@/modules/billing/group-finance-export-auth";
import { isRefundProcessingAllowed, refundReadinessOptions } from "@/modules/billing/refund-readiness";

type Row = {
  PaymentRequestID: string; PaymentReference: string; BusinessName: string;
  RequestedPlanDisplayName: string; Amount: number; CurrencyCode: string;
  ReviewedAtUtc: Date | null; RefundState: string | null; InvoiceStatus: string | null;
  RefundAmountMinor: number | null; RefundReference: string | null; RefundReason: string | null;
};
export default async function AdminRefundsPage() {
  await requirePlatformAdmin();
  const rows = await query<Row>(`
    SELECT TOP (300) p.PaymentRequestID, p.PaymentReference, b.Name AS BusinessName,
      p.RequestedPlanDisplayName, p.Amount, p.CurrencyCode, p.ReviewedAtUtc, i.Status AS InvoiceStatus,
      r.State AS RefundState, r.AmountMinor AS RefundAmountMinor,
      r.TransferReference AS RefundReference, r.Reason AS RefundReason
    FROM TblManualPaymentRequest p
    INNER JOIN TblBusiness b ON b.BusinessID = p.BusinessID
    LEFT JOIN TblBillingInvoice i ON i.PaymentRequestID = p.PaymentRequestID
    LEFT JOIN TblBillingRefund r ON r.PaymentRequestID = p.PaymentRequestID
    WHERE p.Status = N'APPROVED'
    ORDER BY CASE WHEN r.State = N'PENDING' THEN 0 ELSE 1 END,
      p.ReviewedAtUtc DESC, p.PaymentRequestID DESC
  `);
  let config = null;
  try { config = readSaasFinancialConfig(); } catch { /* Fail closed. */ }
  const enabled = isRefundProcessingAllowed(refundReadinessOptions(
    process.env, config, Boolean(configuredFinanceExportToken()),
  ));
  return <div className="space-y-5">
    <div>
      <p className="text-xs font-bold text-primary">إدارة المدفوعات</p>
      <h1 className="mt-2 text-3xl font-black">طلبات الاسترداد (Refunds)</h1>
      <p className="mt-2 text-sm text-muted-foreground">ابحث باسم النشاط أو مرجع الدفع، وابدأ الاسترداد ثم سجّل تأكيد التحويل الحقيقي.</p>
    </div>
    {!enabled ? <div role="alert" className="rounded-xl border border-warning/40 bg-warning-soft p-4 text-sm font-bold text-warning">إجراءات الاسترداد معطّلة لحين اكتمال إعداد الربط المالي. يمكنك مراجعة الطلبات، لكن لن يتم تسجيل استرداد قبل تفعيل شروط الأمان.</div> : null}
    <RefundsPanel enabled={enabled} items={rows.recordset.map(r => ({
      paymentRequestId: String(r.PaymentRequestID), paymentReference: r.PaymentReference,
      businessName: r.BusinessName, planName: r.RequestedPlanDisplayName,
      amount: Number(r.Amount), currency: r.CurrencyCode,
      reviewedAt: r.ReviewedAtUtc ? new Date(r.ReviewedAtUtc).toISOString() : null,
      state: r.RefundState, invoiceStatus: r.InvoiceStatus, refundedAmountMinor: r.RefundAmountMinor == null ? null : Number(r.RefundAmountMinor),
      transferReference: r.RefundReference, reason: r.RefundReason,
    }))} />
  </div>;
}
