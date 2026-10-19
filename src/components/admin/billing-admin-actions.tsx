"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function BillingAdminActions({ paymentRequestId, status, onCompleted }: { paymentRequestId: string; status: string; onCompleted?: () => void }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [percent, setPercent] = useState("0");
  const [reference, setReference] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function act(action: string) {
    if (!reason.trim()) { setMessage("اكتب سبب الإجراء أولاً"); return; }
    if (!window.confirm("تأكيد الإجراء؟ سيُسجّل باسمك في سجل المراجعة.")) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/admin/payments/${paymentRequestId}`, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason, ...(action === "discount" ? { discountPercent: Number(percent) } : {}), ...(action === "confirm_refund" ? { transferReference: reference } : {}) }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "تعذر تنفيذ الإجراء");
      setMessage("تم تسجيل الإجراء"); router.refresh(); onCompleted?.();
    } catch (error) { setMessage(error instanceof Error ? error.message : "تعذر تنفيذ الإجراء"); }
    finally { setBusy(false); }
  }
  return <section className="space-y-3 rounded-xl border border-border bg-card p-4 text-foreground">
    <h3 className="font-bold">إدارة الفوترة — {paymentRequestId.slice(0, 8)}</h3>
    <label className="block">سبب الإجراء<input className="mt-1 w-full rounded border border-border bg-background p-2 text-foreground" value={reason} onChange={e => setReason(e.target.value)} maxLength={1000} /></label>
    {status === "AWAITING_TRANSFER" ? <div className="flex gap-2"><input aria-label="نسبة الخصم" className="w-24 rounded border border-border bg-background p-2" type="number" min="0" max="100" step="0.01" value={percent} onChange={e => setPercent(e.target.value)} /><Button disabled={busy} onClick={() => act("discount")}>تطبيق الخصم %</Button></div> : null}
    {status === "APPROVED" ? <div className="flex flex-wrap gap-2">
      <Button variant="outline" disabled={busy} onClick={() => act("cancel_at_end")}>إلغاء بنهاية الفترة بدون استرداد</Button>
      <Button variant="outline" disabled={busy} onClick={() => act("cancel_now")}>إلغاء الاشتراك الحالي فورًا بدون استرداد</Button>
      <Button variant="outline" disabled={busy} onClick={() => act("cancel_scheduled")}>التراجع عن الإلغاء المجدول</Button>
    </div> : null}
    {status === "APPROVED" ? <div className="space-y-2">
      <p className="text-sm text-muted-foreground">الاسترداد كامل قيمة الدفع. طلب الاسترداد لا يعني تحويل المبلغ؛ التأكيد التالي يُستخدم بعد التحويل الفعلي ويلغي الاشتراك المرتبط أو التخفيض المجدول.</p>
      <Button variant="outline" disabled={busy} onClick={() => act("request_refund")}>طلب استرداد وإلغاء</Button>
      <label className="block">مرجع تحويل الاسترداد<input className="mt-1 w-full rounded border border-border bg-background p-2" value={reference} onChange={e => setReference(e.target.value)} maxLength={160} /></label>
      <div className="flex gap-2"><Button disabled={busy} onClick={() => act("confirm_refund")}>تأكيد التحويل والاسترداد</Button><Button variant="outline" disabled={busy} onClick={() => act("fail_refund")}>تسجيل فشل الاسترداد</Button></div>
    </div> : null}
    {message ? <p role="status">{message}</p> : null}
  </section>;
}
