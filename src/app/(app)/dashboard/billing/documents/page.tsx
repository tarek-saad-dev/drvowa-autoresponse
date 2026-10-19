import { redirect } from "next/navigation";
import { resolveActiveBusiness } from "@/lib/tenancy/active-business";
import { requireAuthenticatedUser } from "@/lib/tenancy/require-user";
import { listBillingDocuments } from "@/modules/billing/documents";

export default async function DocumentsPage() {
  const user = await requireAuthenticatedUser();
  const businessId = await resolveActiveBusiness(user.userId, user.activeBusinessId);
  if (!businessId) redirect("/onboarding");
  const documents = await listBillingDocuments(businessId);
  const labels: Record<string, string> = { OPEN: "غير مدفوعة", PAID: "مدفوعة", WAIVED: "معفاة بالكامل", VOID: "ملغاة" };
  return <main className="mx-auto max-w-4xl space-y-5">
    <h1 className="text-2xl font-bold">الفواتير والإيصالات</h1>
    <p className="text-muted-foreground">يمكنك طباعة الصفحة أو حفظها PDF من قائمة المتصفح. الفاتورة طلب سداد، والإيصال إثبات اعتماد الدفع.</p>
    {!documents.length ? <p>لا توجد مستندات صادرة حتى الآن.</p> : null}
    {documents.map(d => <article key={d.InvoiceID} className="break-inside-avoid space-y-3 rounded-xl border border-border bg-card p-6 text-foreground">
      <h2 className="text-xl font-bold">فاتورة INV-{d.InvoiceNumber}</h2>
      <p>{d.PlanDisplayName} — {d.BillingInterval === "ANNUAL" ? "سنوي" : "شهري"} — {labels[d.Status] ?? d.Status}</p>
      <p>تاريخ الإصدار: {new Date(d.IssuedAtUtc).toLocaleDateString("ar-EG", { timeZone: "Africa/Cairo" })}</p>
      <dl className="grid grid-cols-2 gap-2"><dt>قبل الخصم</dt><dd>{Number(d.SubtotalMinor) / 100} {d.CurrencyCode}</dd><dt>الخصم</dt><dd>{Number(d.DiscountMinor) / 100} {d.CurrencyCode}</dd><dt>الإجمالي</dt><dd className="font-bold">{Number(d.TotalMinor) / 100} {d.CurrencyCode}</dd></dl>
      {d.ReceiptNumber ? <div className="border-t border-border pt-3"><h3 className="font-bold">إيصال RCT-{d.ReceiptNumber}</h3><p>تم اعتماد دفع {Number(d.TotalMinor) / 100} {d.CurrencyCode} مقابل الفاتورة INV-{d.InvoiceNumber}.</p></div> : null}
      {d.RefundState ? <p className="border-t border-border pt-3">الاسترداد: {{ PENDING: "قيد التنفيذ", SUCCEEDED: "تم رد المبلغ", FAILED: "فشل التحويل" }[d.RefundState] ?? d.RefundState} — {Number(d.RefundAmountMinor) / 100} {d.CurrencyCode}. يظل الإيصال الأصلي محفوظًا في السجل.</p> : null}
    </article>)}
  </main>;
}
