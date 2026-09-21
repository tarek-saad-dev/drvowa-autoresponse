"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

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

type Props = {
  plans: PlanCard[];
  currentPlanCode: string | null;
  instructions: Instructions | null;
  enabled: boolean;
};

function formatLimit(value: number | null | undefined): string {
  if (value == null) return "—";
  return String(value);
}

function formatPrice(amount: number | null | undefined, currency: string | null): string {
  if (amount == null) return "—";
  if (amount === 0) return "مجاناً";
  return `${amount} ${currency ?? "EGP"} / شهر`;
}

export function BillingPlansClient({
  plans,
  currentPlanCode,
  instructions,
  enabled,
}: Props) {
  const router = useRouter();
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [step, setStep] = useState<"plans" | "pay" | "confirm" | "done">("plans");
  const [payerName, setPayerName] = useState("");
  const [transferReference, setTransferReference] = useState("");
  const [customerNote, setCustomerNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [paymentReference, setPaymentReference] = useState<string | null>(null);

  const selected = plans.find((p) => p.code === selectedCode) ?? null;

  async function submitPayment() {
    if (!selected) return;
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
          planCode: selected.code,
          payerName,
          transferReference: transferReference || null,
          customerNote: customerNote || null,
        }),
      });
      const data = (await res.json()) as {
        paymentReference?: string;
        error?: string;
        code?: string;
      };
      if (!res.ok) {
        throw new Error(mapUserFacingError(data, "تعذر إرسال طلب الدفع"));
      }
      setPaymentReference(data.paymentReference ?? null);
      setStep("done");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر إرسال طلب الدفع");
    } finally {
      setSubmitting(false);
    }
  }

  if (step === "done" && paymentReference) {
    return (
      <Alert variant="success" title="طلب الدفع قيد المراجعة">
        <p className="mt-1">
          تم استلام تأكيدك. سيتم تفعيل الاشتراك بعد مراجعة التحويل.
        </p>
        <p className="mt-3 text-sm font-semibold">
          مرجع الدفع: <span className="font-mono">{paymentReference}</span>
        </p>
        <Button
          className="mt-4"
          variant="outline"
          size="sm"
          onClick={() => {
            setStep("plans");
            setSelectedCode(null);
            setPaymentReference(null);
          }}
        >
          العودة للخطط
        </Button>
      </Alert>
    );
  }

  if ((step === "pay" || step === "confirm") && selected) {
    return (
      <section className="space-y-5 rounded-xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">الدفع عبر InstaPay</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {selected.displayName} — {formatPrice(selected.monthlyPriceAmount, selected.currencyCode)}
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
            إلغاء
          </Button>
        </div>

        <Alert variant="info" title="حوّل المبلغ التالي عبر InstaPay">
          <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">المبلغ</dt>
              <dd className="font-semibold">
                {formatPrice(selected.monthlyPriceAmount, selected.currencyCode)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">المدة</dt>
              <dd className="font-semibold">شهر</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">المستلم</dt>
              <dd className="font-semibold">{instructions?.displayName ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">معرّف InstaPay</dt>
              <dd className="font-mono font-semibold">{instructions?.handle ?? "—"}</dd>
            </div>
          </dl>
          <p className="mt-3 text-sm">{instructions?.instructions}</p>
          <p className="mt-2 text-sm font-medium">
            بعد التحويل أرسل بيانات العملية، وسيتم تفعيل الاشتراك بعد المراجعة.
          </p>
        </Alert>

        {step === "pay" ? (
          <Button onClick={() => setStep("confirm")}>لقد حوّلت المبلغ</Button>
        ) : (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void submitPayment();
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

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">الباقات المتاحة</h2>
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
                {formatPrice(plan.monthlyPriceAmount, plan.currencyCode)}
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
                  onClick={() => {
                    setSelectedCode(plan.code);
                    setStep("pay");
                    setError(null);
                  }}
                >
                  اختيار الباقة
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
