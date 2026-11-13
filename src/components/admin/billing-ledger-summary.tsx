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
  return (
    <section className="my-6 space-y-4 rounded-2xl border border-border bg-card p-4 text-foreground shadow-sm sm:p-5">
      <h2 className="font-display text-xl font-bold">صافي التحصيل والاستردادات — كل الفترات</h2>
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="min-w-[590px] w-full text-start text-sm">
          <thead className="bg-surface text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="px-4 py-3 text-start">العملة</th>
              <th scope="col" className="px-4 py-3 text-start">التحصيل</th>
              <th scope="col" className="px-4 py-3 text-start">المسترد فعليًا</th>
              <th scope="col" className="px-4 py-3 text-start">صافي التحصيل</th>
              <th scope="col" className="px-4 py-3 text-start">الخصومات</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {totals.recordset.map((row) => (
              <tr key={row.CurrencyCode} className="hover:bg-surface/50">
                <td className="px-4 py-3 font-bold">{row.CurrencyCode}</td>
                <td className="px-4 py-3 tabular-nums" dir="ltr">{Number(row.Gross).toFixed(2)}</td>
                <td className="px-4 py-3 tabular-nums text-destructive" dir="ltr">{Number(row.Refunded).toFixed(2)}</td>
                <td className="px-4 py-3 font-bold tabular-nums text-foreground" dir="ltr">{(Number(row.Gross) - Number(row.Refunded)).toFixed(2)}</td>
                <td className="px-4 py-3 tabular-nums" dir="ltr">{Number(row.Discounts).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs leading-6 text-muted-foreground">
        الخصومات ليست مبالغ محصلة. طلبات الاسترداد المعلقة لا تُخصم من التحصيل حتى تأكيد التحويل.
      </p>
      <h3 className="font-display font-bold">آخر طلبات الاسترداد</h3>
      <div className="divide-y divide-border rounded-xl border border-border">
        {refunds.recordset.map((row) => (
          <div key={row.RefundID} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
            <div className="min-w-0">
              <p dir="ltr" className="break-all font-mono text-xs font-bold">{row.PaymentReference}</p>
              <p className="mt-1 break-words text-xs text-muted-foreground">{row.Reason}</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <span className={"rounded-full px-2.5 py-1 text-xs font-bold " +
                (row.State === "SUCCEEDED" ? "bg-success-soft text-success" :
                  row.State === "FAILED" ? "bg-destructive-soft text-destructive" : "bg-warning-soft text-warning")}>
                {{ PENDING: "قيد التنفيذ", SUCCEEDED: "مكتمل", FAILED: "فشل" }[row.State] ?? row.State}
              </span>
              <strong className="tabular-nums" dir="ltr">{Number(row.AmountMinor) / 100} {row.CurrencyCode}</strong>
            </div>
          </div>
        ))}
        {!refunds.recordset.length ? <p className="p-4 text-sm text-muted-foreground">لا توجد استردادات مسجلة.</p> : null}
      </div>
    </section>
  );
}
