"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { mapUserFacingError } from "@/lib/ui/user-errors";

type PlanCard = {
  code: string;
  displayName: string;
  monthlyPriceAmount: number | null;
  currencyCode: string | null;
  maxWhatsAppConnections: number | null;
  maxAgents: number | null;
  maxActiveKnowledgeItems: number | null;
  monthlyAiReplies: number | null;
  monthlyWhatsAppOutbound: number | null;
};

type Instructions = {
  displayName: string;
  handle: string;
  instructions: string;
};

type IntentState = {
  paymentRequestId: string;
  paymentReference: string;
  amount: number;
  currencyCode: string;
  planDisplayName: string;
  planCode: string;
};

type Props = {
  plans: PlanCard[];
  currentPlanCode: string | null;
  instructions: Instructions | null;
  enabled: boolean;
  initialOpenIntent?: IntentState | null;
  initialPendingReview?: boolean;
};

function formatLimit(value: number | null | undefined): string {
  if (value == null) return "—";
  return String(value);
}

function formatPrice(amount: number | null | undefined, currency: string | null): string {
  if (amount == null) return "—";
  if (amount === 0) return "مجاناً";
  return `${amount} ${currency ?? "EGP"}`;
}

export function BillingPlansClient({
  plans,
  currentPlanCode,
  instructions,
  enabled,
  initialOpenIntent = null,
  initialPendingReview = false,
}: Props) {
  const router = useRouter();
  const [billingInterval, setBillingInterval] = useState<"MONTHLY" | "ANNUAL">("MONTHLY");
  const [selectedCode, setSelectedCode] = useState<string | null>(
    initialOpenIntent?.planCode ?? null,
  );
  const [step, setStep] = useState<"plans" | "pay" | "confirm" | "done">(
    initialOpenIntent ? "pay" : "plans",
  );
  const [intent, setIntent] = useState<IntentState | null>(initialOpenIntent);
  const [payerName, setPayerName] = useState("");
  const [transferReference, setTransferReference] = useState("");
  const [customerNote, setCustomerNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [creating, setCreating] = useState(false);
  const [showPending, setShowPending] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    if (!dialogOpen) return;
    function onEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && !creating && !submitting) setDialogOpen(false);
    }
    document.addEventListener("keydown", onEscape);
    return () => document.removeEventListener("keydown", onEscape);
  }, [dialogOpen, creating, submitting]);

  function openPlans() {
    if (initialPendingReview) return;
    if (step !== "done" && step !== "confirm") {
      setStep("plans");
    }
    setError(null);
    setDialogOpen(true);
  }

  function openExistingPayment() {
    if (!initialOpenIntent) return;
    setIntent(initialOpenIntent);
    setStep("pay");
    setError(null);
    setDialogOpen(true);
  }


  async function choosePlan(planCode: string) {
    setSelectedCode(planCode);
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/manual-payment", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ planCode, billingInterval }),
      });
      const data = (await res.json()) as IntentState & {
        error?: string;
        status?: string;
      };
      if (!res.ok) {
        throw new Error(mapUserFacingError(data, "تعذر تجهيز طلب الدفع"));
      }
      if (data.status === "PENDING") {
        setIntent({
          paymentRequestId: data.paymentRequestId,
          paymentReference: data.paymentReference,
          amount: data.amount,
          currencyCode: data.currencyCode,
          planDisplayName: data.planDisplayName,
          planCode: data.planCode,
        });
        setShowPending(true);
        setStep("done");
        router.refresh();
        return;
      }
      setSelectedCode(planCode);
      setIntent({
        paymentRequestId: data.paymentRequestId,
        paymentReference: data.paymentReference,
        amount: data.amount,
        currencyCode: data.currencyCode,
        planDisplayName: data.planDisplayName,
        planCode: data.planCode,
      });
      setStep("pay");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر تجهيز طلب الدفع");
    } finally {
      setCreating(false);
    }
  }

  async function submitConfirmation() {
    if (!intent) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/manual-payment", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "confirm_transfer",
          paymentRequestId: intent.paymentRequestId,
          payerName,
          transferReference: transferReference || null,
          customerNote: customerNote || null,
        }),
      });
      const data = (await res.json()) as {
        paymentReference?: string;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(mapUserFacingError(data, "تعذر إرسال تأكيد الدفع"));
      }
      setShowPending(false);
      setStep("done");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر إرسال تأكيد الدفع");
    } finally {
      setSubmitting(false);
    }
  }

  let content: ReactNode;

  if (step === "done" && intent) {
    content = (
      <Alert variant="info" title={showPending ? "طلب الدفع قيد المراجعة بالفعل" : "تم إرسال تأكيد التحويل"}>
        <p className="mt-1">
          {showPending ? "طلب التحويل مسجل بالفعل وفي انتظار مراجعة الإدارة. لا داعي لإعادة إرساله." : "استلمنا بيانات التحويل، وفي انتظار مراجعتها يدويًا قبل تطبيق أي تغيير على اشتراكك."}
        </p>
        <p className="mt-3 text-sm font-semibold">
          مرجع DRVOWA: <span className="font-mono">{intent.paymentReference}</span>
        </p>
        <Button
          className="mt-4"
          variant="outline"
          size="sm"
          onClick={() => {
            setStep("plans");
            setSelectedCode(null);
            setIntent(null);
            setShowPending(false);
          }}
        >
          العودة للخطط
        </Button>
      </Alert>
    );
  }

  else if ((step === "pay" || step === "confirm") && intent) {
    content = (
      <section className="space-y-5 rounded-xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">الدفع عبر InstaPay</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {intent.planDisplayName} — {formatPrice(intent.amount, intent.currencyCode)}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setStep("plans");
              setError(null);
            }}
          >
            رجوع
          </Button>
        </div>

        <Alert variant="info" title="حوّل المبلغ التالي عبر InstaPay">
          <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">الباقة</dt>
              <dd className="font-semibold" data-testid="pay-plan-name">
                {intent.planDisplayName}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">المبلغ</dt>
              <dd className="font-semibold" data-testid="pay-amount">
                {formatPrice(intent.amount, intent.currencyCode)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">الدفع عبر</dt>
              <dd className="font-semibold">InstaPay</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">المستلم</dt>
              <dd className="font-semibold">{instructions?.displayName ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">معرّف InstaPay</dt>
              <dd className="font-mono font-semibold">{instructions?.handle ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">مرجع DRVOWA</dt>
              <dd
                className="font-mono font-semibold text-primary"
                data-testid="drv-payment-reference"
              >
                {intent.paymentReference}
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-sm">
            اكتب مرجع DRVOWA في وصف التحويل إذا كان التطبيق يسمح بذلك.
          </p>
          <p className="mt-2 text-sm font-medium">
            بعد التحويل اضغط لقد حوّلت المبلغ وأدخل بيانات العملية.
          </p>
          {instructions?.instructions ? (
            <p className="mt-2 text-sm text-muted-foreground">
              {instructions.instructions}
            </p>
          ) : null}
        </Alert>

        {step === "pay" ? (
          <Button onClick={() => setStep("confirm")}>لقد حوّلت المبلغ</Button>
        ) : (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void submitConfirmation();
            }}
          >
            <div>
              <label className="text-sm font-medium" htmlFor="payerName">
                اسم المحوّل
              </label>
              <Input
                id="payerName"
                className="mt-1"
                value={payerName}
                onChange={(e) => setPayerName(e.target.value)}
                required
                maxLength={160}
              />
            </div>
            <div>
              <label className="text-sm font-medium" htmlFor="transferReference">
                رقم العملية / مرجع التحويل (مستحسن)
              </label>
              <Input
                id="transferReference"
                className="mt-1"
                value={transferReference}
                onChange={(e) => setTransferReference(e.target.value)}
                maxLength={160}
              />
            </div>
            <div>
              <label className="text-sm font-medium" htmlFor="customerNote">
                ملاحظة (اختياري)
              </label>
              <Textarea
                id="customerNote"
                className="mt-1"
                rows={3}
                value={customerNote}
                onChange={(e) => setCustomerNote(e.target.value)}
                maxLength={1000}
              />
            </div>
            {error ? (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}
            <Button type="submit" disabled={submitting || !payerName.trim()}>
              {submitting ? "جاري الإرسال…" : "إرسال تأكيد الدفع"}
            </Button>
          </form>
        )}
      </section>
    );
  }

  else {
    content = (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">الباقات المتاحة</h2>
      <label className="flex items-center gap-3">دورة الاشتراك
        <select aria-label="دورة الاشتراك" className="rounded border border-border bg-card p-2 text-foreground" value={billingInterval} onChange={e => setBillingInterval(e.target.value as "MONTHLY" | "ANNUAL")} disabled={creating}>
          <option value="MONTHLY">شهري</option><option value="ANNUAL">سنوي — سعر 12 شهر</option>
        </select>
      </label>
      <p className="text-sm leading-7 text-muted-foreground">لو اخترت باقة أعلى، يبدأ الاشتراك الجديد بعد اعتماد الدفع. ولو اخترت باقة أقل، يستمر اشتراكك الحالي حتى نهاية فترته، وبعدها يبدأ التغيير. اختيار باقة وحده لا يخصم أي مبلغ.</p>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {plans.map((plan) => {
          const isCurrent = plan.code === currentPlanCode;
          const isPaid = (plan.monthlyPriceAmount ?? 0) > 0;
          return (
            <article
              key={plan.code}
              className={`flex flex-col rounded-xl border p-5 ${
                isCurrent
                  ? "border-primary bg-primary/5 shadow-sm"
                  : "border-border bg-card"
              }`}
              data-testid={`plan-card-${plan.code}`}
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-base font-semibold">{plan.displayName}</h3>
                {isCurrent ? (
                  <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-medium text-primary">
                    خطتك الحالية
                  </span>
                ) : null}
              </div>
              <p className="mt-2 text-2xl font-bold tracking-tight">
                {formatPrice(plan.monthlyPriceAmount == null ? null : plan.monthlyPriceAmount * (billingInterval === "ANNUAL" ? 12 : 1), plan.currencyCode)}
                {(plan.monthlyPriceAmount ?? 0) > 0 ? (billingInterval === "ANNUAL" ? " / سنة" : " / شهر") : ""}
              </p>
              <ul className="mt-4 flex-1 space-y-1.5 text-sm text-muted-foreground">
                <li>واتساب: {formatLimit(plan.maxWhatsAppConnections)}</li>
                <li>موظفو استقبال: {formatLimit(plan.maxAgents)}</li>
                <li>معرفة نشطة: {formatLimit(plan.maxActiveKnowledgeItems)}</li>
                <li>ردود ذكاء / شهر: {formatLimit(plan.monthlyAiReplies)}</li>
                <li>رسائل صادرة / شهر: {formatLimit(plan.monthlyWhatsAppOutbound)}</li>
              </ul>
              {isPaid && enabled && !isCurrent ? (
                <Button
                  className="mt-5 w-full"
                  disabled={creating}
                  onClick={() => void choosePlan(plan.code)}
                >
                  {creating && selectedCode === plan.code
                    ? "جاري التجهيز…"
                    : "اختيار الباقة"}
                </Button>
              ) : null}
              {isPaid && !enabled ? (
                <p className="mt-5 text-xs text-muted-foreground">
                  تعليمات الدفع غير مُعدّة بعد.
                </p>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={initialPendingReview}
          onClick={openPlans}
        >
          تغيير الباقة
        </Button>
        {initialOpenIntent ? (
          <Button type="button" variant="ghost" onClick={openExistingPayment}>
            عرض تعليمات الدفع
          </Button>
        ) : null}
        {initialPendingReview ? (
          <span className="text-xs text-muted-foreground">
            لا يمكن بدء طلب جديد أثناء مراجعة التحويل الحالي.
          </span>
        ) : null}
      </div>

      {dialogOpen ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-3 sm:p-6">
          <button
            type="button"
            aria-label="إغلاق نافذة الباقات"
            disabled={creating || submitting}
            className="absolute inset-0 bg-black/55 backdrop-blur-sm"
            onClick={() => setDialogOpen(false)}
          />
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="billing-modal-title"
            className="relative z-10 max-h-[calc(100dvh-2rem)] w-full max-w-5xl overflow-y-auto rounded-2xl border border-border bg-card p-4 shadow-2xl sm:max-h-[calc(100dvh-3rem)] sm:p-6"
          >
            <div className="mb-5 flex items-center justify-between gap-3 border-b border-border pb-4">
              <h2 id="billing-modal-title" className="text-lg font-black">
                إدارة الباقة والدفع
              </h2>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={creating || submitting}
                onClick={() => setDialogOpen(false)}
              >
                إغلاق
              </Button>
            </div>
            {content}
          </section>
        </div>
      ) : null}
    </>
  );
}
