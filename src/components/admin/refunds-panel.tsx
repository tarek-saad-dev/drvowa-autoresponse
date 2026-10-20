"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

type Item = { paymentRequestId: string; paymentReference: string; businessName: string;
  planName: string; amount: number; currency: string; reviewedAt: string | null;
  state: string | null; invoiceStatus: string | null; refundedAmountMinor: number | null;
  transferReference: string | null; reason: string | null; };
const labels: Record<string,string> = {
  NONE: "لم يُطلب", PENDING: "بانتظار التحويل", SUCCEEDED: "تم الاسترداد", FAILED: "فشل الاسترداد",
};
export function RefundsPanel({items, enabled}: {items: Item[]; enabled: boolean}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [selected, setSelected] = useState<Item | null>(null);
  const [reason, setReason] = useState("");
  const [reference, setReference] = useState("");
  const [verified, setVerified] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const visible = useMemo(() => items.filter(i =>
    (filter === "ALL" || (i.state ?? "NONE") === filter) &&
    [i.businessName, i.paymentReference, i.planName].some(v=>v.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))
  ), [items, filter, search]);
  async function act(action: "request_refund" | "confirm_refund" | "fail_refund" | "reconcile_legacy_invoice") {
    if (!selected || !reason.trim() || !enabled || busy) {setError("اكتب السبب أولًا وتأكد أن الاسترداد متاح."); return;}
    if ((action === "confirm_refund" || action === "reconcile_legacy_invoice") && !reference.trim()) {setError("مرجع تحويل الاسترداد الفعلي مطلوب."); return;}
    if (action === "reconcile_legacy_invoice" && !verified) {setError("لازم تؤكد مراجعة التحويل الأصلي من سجل البنك."); return;}
    const warning = action === "reconcile_legacy_invoice" ? "تأكيد تسوية فاتورة قديمة بعد التحقق من وصول التحويل الأصلي؟ سيتم إصدار فاتورة وإيصال موثقين دون تسجيل تحصيل جديد." : action === "confirm_refund"
      ? `هل تؤكد أن مبلغ ${selected.amount} ${selected.currency} تم تحويله فعليًا إلى العميل ${selected.businessName}؟ تسجيله كناجح قد يلغي الاشتراك المرتبط.`
      : action === "request_refund"
      ? `إنشاء طلب استرداد كامل بمبلغ ${selected.amount} ${selected.currency} إلى ${selected.businessName}؟ لن يتم تحويل أي مبلغ الآن.`
      : "تسجيل فشل الاسترداد؟";
    if (!window.confirm(warning)) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/admin/payments/${selected.paymentRequestId}`, {
        method:"POST", credentials:"same-origin", headers: {"Content-Type":"application/json"},
        body:JSON.stringify({action, reason:reason.trim(), ...((action === "confirm_refund" || action === "reconcile_legacy_invoice") ? {transferReference:reference.trim()} : {}), ...(action === "reconcile_legacy_invoice" ? {verifiedOriginalTransfer:verified} : {})}),
      });
      const data = await response.json().catch(()=>({}));
      if (!response.ok) throw new Error(data.error || data.message || "تعذر تنفيذ الإجراء");
      setSelected(null); setReason(""); setReference(""); setVerified(false); router.refresh();
    } catch (e) {setError(e instanceof Error ? e.message : "تعذر تنفيذ الإجراء");}
    finally {setBusy(false);}
  }
  return <div className="space-y-4">
    <div className="flex flex-wrap gap-3">
      <input aria-label="بحث عن نشاط أو مرجع دفع" placeholder="ابحث باسم النشاط، مثل فواكه الرحمن..." value={search} onChange={e=>setSearch(e.target.value)}
        className="min-w-[220px] flex-1 rounded-xl border border-border bg-card px-4 py-3 text-foreground outline-none focus:border-primary" />
      <select aria-label="تصفية حالة الاسترداد" value={filter} onChange={e=>setFilter(e.target.value)} className="rounded-xl border border-border bg-card px-4 py-3 text-foreground">
        <option value="ALL">كل الحالات</option><option value="PENDING">بانتظار التحويل</option><option value="NONE">لم يُطلب</option>
        <option value="SUCCEEDED">تم الاسترداد</option><option value="FAILED">فشل الاسترداد</option>
      </select>
    </div>
    <p className="text-xs text-muted-foreground">عرض {visible.length} من آخر {items.length} دفعة معتمدة. الاسترداد الكامل فقط متاح حاليًا.</p>
    <div className="overflow-x-auto rounded-2xl border border-border bg-card">
      <table className="min-w-full text-sm"><thead className="bg-surface text-muted-foreground"><tr>
        <th className="p-4 text-start">النشاط</th><th className="p-4 text-start">الدفع</th><th className="p-4 text-start">المبلغ</th>
        <th className="p-4 text-start">حالة الاسترداد</th><th className="p-4 text-start">الإجراء</th>
      </tr></thead><tbody>{visible.map(i=><tr key={i.paymentRequestId} className="border-t border-border">
        <td className="p-4 font-bold">{i.businessName}<div className="text-xs font-normal text-muted-foreground">{i.planName}</div></td>
        <td className="p-4 font-mono text-xs">{i.paymentReference}</td>
        <td className="p-4 tabular-nums">{i.amount} {i.currency}</td>
        <td className="p-4">{labels[i.state ?? "NONE"] ?? i.state}</td>
        <td className="p-4"><Button size="sm" variant="outline" onClick={()=>{setSelected(i);setReason(i.reason ?? "");setReference("");setVerified(false);setError("");}}>التفاصيل والإجراءات</Button></td>
      </tr>)}</tbody></table>
      {!visible.length ? <p className="p-8 text-center text-sm text-muted-foreground">لا توجد مدفوعات مطابقة للبحث.</p> : null}
    </div>
    {selected ? <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center" role="dialog" aria-modal="true" aria-label="مراجعة طلب استرداد">
      <div className="max-h-[90vh] w-full max-w-xl space-y-4 overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-xl">
        <div className="flex items-start justify-between gap-3"><div><h2 className="text-xl font-black">{selected.businessName}</h2><p className="text-xs text-muted-foreground">{selected.paymentReference} · {selected.planName}</p></div><Button variant="ghost" onClick={()=>setSelected(null)} disabled={busy}>إغلاق</Button></div>
        <div className="rounded-xl bg-surface p-4 text-sm"><p>المدفوع: <strong>{selected.amount} {selected.currency}</strong></p><p className="mt-2">الحالة: {labels[selected.state ?? "NONE"] ?? selected.state}</p><p className="mt-2">الفاتورة: {selected.invoiceStatus === "PAID" ? "مدفوعة" : selected.invoiceStatus ?? "غير موجودة"}</p>
          {selected.transferReference ? <p className="mt-2">مرجع الاسترداد: {selected.transferReference}</p> : null}
        </div>
        <label className="block text-sm font-bold">سبب الاسترداد <textarea rows={3} maxLength={1000} value={reason} onChange={e=>setReason(e.target.value)} className="mt-2 w-full rounded-lg border border-border bg-background p-3 text-foreground" /></label>
        {(!selected.invoiceStatus || selected.state === "PENDING") ? <label className="block text-sm font-bold">{!selected.invoiceStatus ? "مرجع التحويل الأصلي الوارد من البنك" : "مرجع تحويل المبلغ للعميل (بعد التحويل الفعلي)"}
          <input maxLength={160} value={reference} onChange={e=>setReference(e.target.value)} className="mt-2 w-full rounded-lg border border-border bg-background p-3 text-foreground" /></label> : null}
        <p className="text-xs leading-6 text-muted-foreground">إنشاء الطلب لا يحوّل فلوس. زر التأكيد يُستخدم فقط بعد إرسال المبلغ للعميل والتحقق من التحويل خارج النظام.</p>
        {!selected.invoiceStatus && !selected.state ? <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={verified} onChange={e=>setVerified(e.target.checked)} /> راجعت سجل الحساب البنكي وتأكدت من وصول التحويل الأصلي وقيمته وتطابقه مع طلب الدفع.</label> : null}
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        <div className="flex flex-wrap gap-2">
          {!selected.invoiceStatus && !selected.state ? <Button disabled={!enabled || busy || !verified || !reference.trim()} onClick={()=>act("reconcile_legacy_invoice")}>تسوية الدفع القديم وإصدار الفاتورة</Button> : null}
          {selected.invoiceStatus === "PAID" && (!selected.state || selected.state === "FAILED") ? <Button disabled={!enabled || busy} onClick={()=>act("request_refund")}>إنشاء طلب استرداد</Button> : null}
          {selected.state === "PENDING" ? <>
            <Button disabled={!enabled || busy || !reference.trim()} onClick={()=>act("confirm_refund")}>تأكيد التحويل الفعلي</Button>
            <Button variant="outline" disabled={!enabled || busy} onClick={()=>act("fail_refund")}>تسجيل فشل الاسترداد</Button>
          </> : null}
        </div>
      </div>
    </div> : null}
  </div>;
}
