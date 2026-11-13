"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { mapUserFacingError } from "@/lib/ui/user-errors";

type RefundItem = {
  paymentRequestId: string;
  reference: string;
  planName: string;
  amount: number;
  currency: string;
  paidAt: string | null;
  invoiceNumber: string;
  status: "NONE" | "REQUESTED" | "PROCESSING" | "SUCCEEDED" | "FAILED" | "REJECTED";
  reviewNote: string | null;
};

type Props =
  | { mode: "cancellation"; canManage: boolean; paid: boolean; periodEnd: string | null; scheduledKind: string | null }
  | { mode: "refunds"; canManage: boolean; payments: RefundItem[] };

const money = (value: number, currency: string): string =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value) +
  (currency === "EGP" ? " ج.م" : " " + currency);

const statuses: Record<RefundItem["status"], { label: string; description: string }> = {
  NONE: { label: "متاح تقديم طلب", description: "" },
  REQUESTED: { label: "طلب استرداد قيد المراجعة", description: "استلمنا طلبك، ولم يتم اعتماد أي استرداد بعد." },
  PROCESSING: { label: "جارٍ تجهيز الاسترداد", description: "الإدارة بدأت إجراءات الاسترداد. لم يتم تأكيد إعادة المبلغ بعد." },
  SUCCEEDED: { label: "تم تسجيل إتمام الاسترداد", description: "الإدارة أكدت التحويل الفعلي وسجلت مرجعه." },
  FAILED: { label: "تعذر تنفيذ الاسترداد", description: "يمكنك متابعة سبب تعذر التحويل مع إدارة DRVO." },
  REJECTED: { label: "لم يُقبل طلب الاسترداد", description: "راجع ملاحظة الإدارة أدناه." },
};

async function sendAction(body: Record<string, string>) {
  const res = await fetch("/api/billing/account-actions", {
    method: "POST", credentials: "same-origin",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(mapUserFacingError(data, "تعذر تنفيذ الإجراء"));
  return data;
}

export function BillingCustomerActions(props: Props) {
  const router = useRouter();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [openPayment, setOpenPayment] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function run(body: Record<string, string>, successful: string) {
    if (busy) return;
    setBusy(true); setError(null); setNotice(null);
    try {
      await sendAction(body);
      setNotice(successful);
      setOpenPayment(null);
      setReason("");
      setCancelOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر تنفيذ الطلب");
    } finally {
      setBusy(false);
    }
  }

  if (props.mode === "cancellation") {
    if (!props.paid) return null;
    const formattedEnd = props.periodEnd
      ? new Date(props.periodEnd).toLocaleDateString("ar-EG", { timeZone: "Africa/Cairo", day: "numeric", month: "long", year: "numeric" })
      : null;
    return (
      <div className="mt-4 border-t border-border pt-4" aria-label="إدارة الاشتراك">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold">إدارة اشتراكك</p>
            <p className="mt-1 text-xs leading-6 text-muted-foreground">
              لا يتم تحصيل رسوم تلقائيًا عبر InstaPay. إلغاء الاشتراك لا يُعيد أي مبالغ تم دفعها.
            </p>
          </div>
          {props.scheduledKind === "CANCEL" ? (
            props.canManage ? (
              <Button variant="outline" size="sm" disabled={busy} onClick={() =>
                void run({ action: "undo_cancel" }, "تم التراجع عن الإلغاء المجدول.")}>
                {busy ? "جاري الحفظ…" : "التراجع عن الإلغاء"}
              </Button>
            ) : null
          ) : props.scheduledKind ? (
            <span className="text-xs font-semibold text-muted-foreground">يوجد تغيير آخر مجدول على اشتراكك.</span>
          ) : props.canManage && formattedEnd ? (
            <Button variant="outline" size="sm" disabled={busy} onClick={() => { setCancelOpen(v => !v); setError(null); }}>
              إلغاء عند نهاية الفترة
            </Button>
          ) : null}
        </div>
        {props.scheduledKind === "CANCEL" ? (
          <p role="status" className="mt-3 rounded-xl border border-warning/30 bg-warning-soft px-3 py-3 text-xs leading-6 text-warning">
            تم جدولة الانتقال للباقة المجانية {formattedEnd ? "يوم " + formattedEnd : "بنهاية الفترة الحالية"}.
            الخدمة المدفوعة تظل متاحة حتى ذلك الموعد، ولا يحدث استرداد تلقائي.
          </p>
        ) : null}
        {cancelOpen && props.scheduledKind !== "CANCEL" ? (
          <div className="mt-3 space-y-3 rounded-xl border border-border bg-surface p-4">
            <p className="text-sm font-bold">تأكيد الإلغاء بنهاية الفترة</p>
            <p className="text-xs leading-6 text-muted-foreground">
              ستظل باقتك ومزاياها متاحة حتى {formattedEnd ?? "نهاية الفترة المدفوعة"}، ثم تنتقل إلى المجاني.
              تستطيع التراجع قبل موعد التنفيذ. هذه الخطوة ليست طلب استرداد.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled={busy} onClick={() =>
                void run({ action: "schedule_cancel" }, "تم جدولة إلغاء الاشتراك بنهاية الفترة.")}>
                {busy ? "جارٍ الحفظ…" : "تأكيد الإلغاء بنهاية الفترة"}
              </Button>
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => setCancelOpen(false)}>الرجوع</Button>
            </div>
          </div>
        ) : null}
        {error ? <p role="alert" className="mt-3 text-sm font-bold text-destructive">{error}</p> : null}
        {notice ? <p role="status" className="mt-3 text-sm font-bold text-success">{notice}</p> : null}
      </div>
    );
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-4 sm:p-5" aria-label="طلبات الاسترداد">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-base font-bold">المدفوعات وطلبات الاسترداد</h3>
          <p className="mt-1 text-xs leading-6 text-muted-foreground">
            تقدر تطلب استرداد دفعة معتمدة. تقديم الطلب لا يضمن الموافقة ولا يحوّل المبلغ تلقائيًا.
          </p>
        </div>
        <a href="/dashboard/billing/documents" className="rounded-md text-xs font-bold text-primary underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
          الفواتير والإيصالات
        </a>
      </div>
      {props.payments.length === 0 ? (
        <p className="mt-4 rounded-xl bg-surface px-4 py-3 text-sm text-muted-foreground">
          لا توجد دفعات معتمدة بفواتير مدفوعة مؤهلة لتقديم طلب استرداد حاليًا.
        </p>
      ) : (
        <div className="mt-4 divide-y divide-border border-t border-border">
          {props.payments.map(p => (
            <div key={p.paymentRequestId} className="space-y-3 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-bold">{p.planName} <span className="font-normal text-muted-foreground">• فاتورة #{p.invoiceNumber}</span></p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    <span dir="ltr" className="inline-block">{p.reference}</span>
                    {p.paidAt ? " • " + new Date(p.paidAt).toLocaleDateString("ar-EG", { timeZone: "Africa/Cairo" }) : ""}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <strong dir="ltr" className="text-sm tabular-nums">{money(p.amount, p.currency)}</strong>
                  {p.status === "NONE" && props.canManage ? (
                    <Button variant="outline" size="sm" disabled={busy} onClick={() => {
                      setOpenPayment(p.paymentRequestId === openPayment ? null : p.paymentRequestId);
                      setReason(""); setError(null); setNotice(null);
                    }}>طلب استرداد</Button>
                  ) : (
                    <span className={"rounded-lg px-2.5 py-1 text-xs font-bold " +
                      (p.status === "SUCCEEDED" ? "bg-success-soft text-success" :
                        p.status === "REJECTED" || p.status === "FAILED" ? "bg-destructive-soft text-destructive" :
                          "bg-warning-soft text-warning")}>
                      {statuses[p.status].label}
                    </span>
                  )}
                </div>
              </div>
              {p.status !== "NONE" ? (
                <div className="rounded-lg bg-surface px-3 py-2.5 text-xs leading-6 text-muted-foreground">
                  {statuses[p.status].description}
                  {p.reviewNote ? <p className="mt-1 font-semibold text-foreground">ملاحظة الإدارة: {p.reviewNote}</p> : null}
                </div>
              ) : null}
              {openPayment === p.paymentRequestId && p.status === "NONE" ? (
                <form className="space-y-3 rounded-xl border border-warning/25 bg-surface p-4" onSubmit={e => {
                  e.preventDefault();
                  void run({
                    action: "request_refund", paymentRequestId: p.paymentRequestId, reason: reason.trim(),
                  }, "استلمنا طلب الاسترداد، وهو الآن بانتظار مراجعة الإدارة.");
                }}>
                  <p className="text-sm font-bold">طلب استرداد كامل — {money(p.amount, p.currency)}</p>
                  <p className="text-xs leading-6 text-muted-foreground">
                    حدد سبب طلب الاسترداد. الإدارة ستراجع الفاتورة والدفع وشروط الاسترداد.
                    اشتراكك لن يُلغى بمجرد إرسال هذا الطلب.
                  </p>
                  <label htmlFor={"refund-reason-" + p.paymentRequestId} className="block text-sm font-bold">سبب طلب الاسترداد</label>
                  <Textarea id={"refund-reason-" + p.paymentRequestId} value={reason}
                    onChange={e => setReason(e.target.value)} rows={3} required minLength={8} maxLength={1000}
                    placeholder="اكتب سبب طلبك بالتفصيل…" className="w-full" />
                  <div className="flex flex-wrap gap-2">
                    <Button type="submit" disabled={busy || reason.trim().length < 8} size="sm">
                      {busy ? "جاري الإرسال…" : "إرسال الطلب للمراجعة"}
                    </Button>
                    <Button variant="ghost" size="sm" disabled={busy} onClick={() => setOpenPayment(null)}>
                      رجوع
                    </Button>
                  </div>
                  {error ? <p role="alert" className="text-sm font-bold text-destructive">{error}</p> : null}
                </form>
              ) : null}
            </div>
          ))}
        </div>
      )}
      {error && !openPayment ? <p role="alert" className="mt-3 text-sm text-destructive">{error}</p> : null}
      {notice ? <p role="status" className="mt-3 text-sm font-bold text-success">{notice}</p> : null}
    </section>
  );
}
