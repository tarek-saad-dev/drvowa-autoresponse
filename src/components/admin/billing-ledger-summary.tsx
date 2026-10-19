import { query } from "@/lib/db";

/** Gross approval facts remain immutable; refunds are separate cash movements. */
export async function BillingLedgerSummary() {
  const totals = await query<{ CurrencyCode: string; Gross: number; Refunded: number; Discounts: number }>(`
    SELECT p.CurrencyCode, SUM(p.Amount) AS Gross,
      COALESCE((SELECT SUM(CONVERT(DECIMAL(18,2), f.AmountMinor) / 100) FROM TblBillingRefund f
        WHERE f.CurrencyCode = p.CurrencyCode AND f.State = N'SUCCEEDED'), 0) AS Refunded,
      COALESCE((SELECT SUM(CONVERT(DECIMAL(18,2), i.DiscountMinor) / 100) FROM TblBillingInvoice i
        WHERE i.CurrencyCode = p.CurrencyCode AND i.Status IN (N'PAID', N'WAIVED')), 0) AS Discounts
    FROM TblManualPaymentRequest p WHERE p.Status = N'APPROVED' GROUP BY p.CurrencyCode`);
  const refunds = await query<{ RefundID: string; PaymentReference: string; State: string; AmountMinor: number; CurrencyCode: string; Reason: string }>(`
    SELECT TOP (50) f.RefundID, p.PaymentReference, f.State, f.AmountMinor, f.CurrencyCode, f.Reason
    FROM TblBillingRefund f JOIN TblManualPaymentRequest p ON p.PaymentRequestID = f.PaymentRequestID
    ORDER BY f.CreatedAtUtc DESC`);
  return <section className="my-6 space-y-4 rounded-xl border border-border bg-card p-5 text-foreground">
    <h2 className="text-xl font-bold">صافي التحصيل والاستردادات — كل الفترات</h2>
    <div className="overflow-x-auto"><table className="w-full text-start text-sm"><thead><tr><th>العملة</th><th>التحصيل</th><th>المسترد فعليًا</th><th>صافي التحصيل</th><th>الخصومات</th></tr></thead>
      <tbody>{totals.recordset.map(row => <tr key={row.CurrencyCode}><td>{row.CurrencyCode}</td><td>{Number(row.Gross).toFixed(2)}</td><td>{Number(row.Refunded).toFixed(2)}</td><td>{(Number(row.Gross) - Number(row.Refunded)).toFixed(2)}</td><td>{Number(row.Discounts).toFixed(2)}</td></tr>)}</tbody>
    </table></div>
    <p className="text-sm text-muted-foreground">الخصومات ليست مبالغ محصلة. طلبات الاسترداد المعلقة لا تُخصم من التحصيل حتى تأكيد التحويل.</p>
    <h3 className="font-bold">آخر طلبات الاسترداد</h3>
    {refunds.recordset.map(row => <p key={row.RefundID} className="text-sm">{row.PaymentReference} — {{ PENDING: "قيد التنفيذ", SUCCEEDED: "مكتمل", FAILED: "فشل" }[row.State] ?? row.State} — {Number(row.AmountMinor) / 100} {row.CurrencyCode} — {row.Reason}</p>)}
    {!refunds.recordset.length ? <p className="text-sm">لا توجد استردادات مسجلة.</p> : null}
  </section>;
}
