"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { DrvoLoading } from "@/components/ui/drvo-loading";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { mapUserFacingError } from "@/lib/ui/user-errors";

type BillingInterval = "MONTHLY" | "ANNUAL";
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

type PriceQuote = {
  planCode: string;
  planDisplayName: string;
  billingInterval: BillingInterval;
  amount: number;
  originalAmount: number;
  discountAmount: number;
  discountCode: string | null;
  currencyCode: string;
};

type IntentState = {
  paymentRequestId: string;
  paymentReference: string;
  amount: number;
  originalAmount?: number;
  discountAmount?: number;
  discountCode?: string | null;
  currencyCode: string;
  planDisplayName: string;
  planCode: string;
  billingInterval?: BillingInterval;
};

type Props = {
  plans: PlanCard[];
  currentPlanCode: string | null;
  instructions: Instructions | null;
  enabled: boolean;
  initialOpenIntent?: IntentState | null;
  initialPendingReview?: boolean;
  v1Quotes?: Record<string, { monthly: number; annual: number }> | null;
  initialDiscountCode?: string | null;
  initialBillingInterval?: BillingInterval;
  promoPlanCode?: string | null;
};

const numberFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

function money(amount: number, currency?: string | null): string {
  const unit = !currency || currency === "EGP" ? "ج.م" : currency;
  return numberFormat.format(amount) + " " + unit;
}

function limit(value: number | null | undefined): string {
  return value == null ? "غير محدود" : numberFormat.format(value);
}

function planPrice(
  plan: PlanCard,
  interval: BillingInterval,
  v1Quotes: Props["v1Quotes"],
): number | null {
  if (plan.monthlyPriceAmount == null) return null;
  const v1 = v1Quotes?.[plan.code];
  if (v1) return interval === "ANNUAL" ? v1.annual : v1.monthly;
  return Number((plan.monthlyPriceAmount * (interval === "ANNUAL" ? 12 : 1)).toFixed(2));
}

function Icon({ name, className = "" }: { name: "copy" | "check" | "arrow" | "spark" | "shield" | "clock"; className?: string }) {
  const paths: Record<string, ReactNode> = {
    copy: <><rect x="8" y="8" width="11" height="11" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    arrow: <><path d="m15 18-6-6 6-6" /></>,
    spark: <><path d="m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2L12 3Z" /><path d="m19 18 1 2 2 1-2 1-1 2-1-2-2-1 2-1 1-2Z" /></>,
    shield: <><path d="M12 3 4 6v6c0 5 3.4 8 8 9 4.6-1 8-4 8-9V6l-8-3Z" /><path d="m9 12 2 2 4-4" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  };
  return <svg aria-hidden="true" className={className} width="18" height="18" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

function CopyRow({ label, value, copyId, copied, onCopy, testId }: {
  label: string; value: string; copyId: string; copied: string | null;
  onCopy: (value: string, id: string) => void; testId?: string;
}) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 border-b border-border/70 py-3 last:border-b-0">
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 break-all text-sm font-bold text-foreground" dir="ltr" data-testid={testId}>{value}</p>
      </div>
      <button type="button" onClick={() => onCopy(value, copyId)}
        aria-label={"نسخ " + label}
        className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-bold text-foreground transition hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
        <Icon name={copied === copyId ? "check" : "copy"} className="h-4 w-4" />
        {copied === copyId ? "تم النسخ" : "نسخ"}
      </button>
    </div>
  );
}

function InstaPayBrand() {
  return (
    <div className="flex items-center gap-2.5" aria-label="الدفع عبر InstaPay">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#69338d] text-white shadow-sm" aria-hidden="true">
        <svg viewBox="0 0 32 32" width="29" height="29" fill="none">
          <path d="M6 23V10h7M19 9h7v13" stroke="white" strokeWidth="3.2" strokeLinecap="round" />
          <path d="m10 21 12-12m-7 0h7v7" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <div className="min-w-0">
        <p dir="ltr" className="text-lg font-black leading-none tracking-tight text-[#69338d]">InstaPay</p>
        <p className="mt-1 text-[11px] text-muted-foreground">تحويل مباشر من تطبيق إنستاباي</p>
      </div>
    </div>
  );
}

export function BillingPlansClient({
  plans, currentPlanCode, instructions, enabled,
  initialOpenIntent = null, initialPendingReview = false,
  v1Quotes = null, initialDiscountCode = null, initialBillingInterval = "MONTHLY",
  promoPlanCode = null,
}: Props) {
  const router = useRouter();
  const [billingInterval, setBillingInterval] = useState<BillingInterval>(initialBillingInterval);
  const [selectedCode, setSelectedCode] = useState<string | null>(initialOpenIntent?.planCode ?? null);
  const [step, setStep] = useState<"plans" | "review" | "pay" | "confirm" | "done">(
    initialOpenIntent ? "pay" : "plans",
  );
  const [intent, setIntent] = useState<IntentState | null>(initialOpenIntent);
  const [quote, setQuote] = useState<PriceQuote | null>(null);
  const [discountCode, setDiscountCode] = useState(initialDiscountCode ?? "");
  const [payerName, setPayerName] = useState("");
  const [transferReference, setTransferReference] = useState("");
  const [customerNote, setCustomerNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [quoting, setQuoting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showPending, setShowPending] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (!dialogOpen) return;
    function onEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && !creating && !submitting && !quoting) {
        setDialogOpen(false);
      }
    }
    document.addEventListener("keydown", onEscape);
    return () => document.removeEventListener("keydown", onEscape);
  }, [dialogOpen, creating, submitting, quoting]);

  const paidPlans = plans.filter((plan) => (plan.monthlyPriceAmount ?? 0) > 0);
  const currentPlan = plans.find((plan) => plan.code === currentPlanCode);
  const selectedPlan = plans.find((plan) => plan.code === selectedCode);
  const normalizedCode = discountCode.trim().toUpperCase() || null;
  const validQuote = quote !== null
    && quote.planCode === selectedCode
    && quote.billingInterval === billingInterval
    && (quote.discountCode ?? null) === normalizedCode;

  function openPlans() {
    if (initialPendingReview) return;
    setStep("plans");
    setSelectedCode(null);
    setQuote(null);
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

  function editCode(value: string) {
    setDiscountCode(value.toUpperCase().slice(0, 32));
    setQuote(null);
    setError(null);
  }

  async function requestQuote(planCode: string) {
    setSelectedCode(planCode);
    setStep("review");
    setQuoting(true);
    setQuote(null);
    setError(null);
    try {
      const res = await fetch("/api/billing/manual-payment", {
        method: "POST", credentials: "same-origin",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "preview_quote", planCode, billingInterval,
          discountCode: normalizedCode,
        }),
      });
      const data = (await res.json()) as PriceQuote & { error?: string };
      if (!res.ok) throw new Error(mapUserFacingError(data, "تعذر حساب سعر الباقة"));
      setQuote(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر التحقق من السعر");
    } finally {
      setQuoting(false);
    }
  }

  async function createIntent() {
    if (!selectedCode || !validQuote || !quote) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/manual-payment", {
        method: "POST", credentials: "same-origin",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({
          planCode: selectedCode, billingInterval, discountCode: normalizedCode,
        }),
      });
      const data = (await res.json()) as IntentState & { error?: string; status?: string };
      if (!res.ok) throw new Error(mapUserFacingError(data, "تعذر تجهيز طلب الدفع"));
      const created = {
        paymentRequestId: data.paymentRequestId, paymentReference: data.paymentReference,
        amount: data.amount, originalAmount: data.originalAmount, discountAmount: data.discountAmount,
        discountCode: data.discountCode, currencyCode: data.currencyCode,
        planDisplayName: data.planDisplayName, planCode: data.planCode,
        billingInterval: data.billingInterval,
      };
      setIntent(created);
      if (data.status === "PENDING") {
        setShowPending(true);
        setStep("done");
        router.refresh();
        return;
      }
      // The quote is informational. A server-side price or coupon change
      // must be acknowledged before the customer sees transfer instructions.
      if (data.amount !== quote.amount ||
        (data.discountCode ?? null) !== (quote.discountCode ?? null)) {
        setQuote({
          planCode: data.planCode, planDisplayName: data.planDisplayName,
          billingInterval, amount: data.amount,
          originalAmount: data.originalAmount ?? data.amount,
          discountAmount: data.discountAmount ?? 0,
          discountCode: data.discountCode ?? null, currencyCode: data.currencyCode,
        });
        setError("تم تحديث مبلغ الدفع. راجع السعر الجديد واضغط متابعة مرة أخرى.");
        return;
      }
      setStep("pay");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر تجهيز طلب الدفع");
    } finally {
      setCreating(false);
    }
  }

  async function submitConfirmation() {
    if (!intent || !payerName.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/manual-payment", {
        method: "POST", credentials: "same-origin",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "confirm_transfer", paymentRequestId: intent.paymentRequestId,
          payerName: payerName.trim(),
          transferReference: transferReference.trim() || null,
          customerNote: customerNote.trim() || null,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(mapUserFacingError(data, "تعذر إرسال تأكيد التحويل"));
      setShowPending(false);
      setStep("done");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر إرسال تأكيد التحويل");
    } finally {
      setSubmitting(false);
    }
  }

  async function copyValue(value: string, id: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(id);
    } catch {
      setCopied(null);
      setError("تعذر النسخ تلقائيًا. يمكنك تحديد البيانات ونسخها يدويًا.");
    }
  }

  let content: ReactNode;
  if (step === "done" && intent) {
    content = (
      <div className="mx-auto flex max-w-lg flex-col items-center gap-4 py-9 text-center">
        <div className="grid h-16 w-16 place-items-center rounded-full bg-warning-soft text-warning">
          <Icon name="clock" className="h-8 w-8" />
        </div>
        <h3 className="text-xl font-black text-foreground">طلب الدفع قيد المراجعة</h3>
        <p className="text-sm leading-7 text-muted-foreground">
          {showPending
            ? "طلبك مسجل بالفعل لدى DRVO. لا تحتاج إلى إرسال تأكيد آخر."
            : "استلمنا بيانات التحويل. سنراجع العملية يدويًا قبل تفعيل أو تعديل اشتراكك."}
        </p>
        <div className="w-full rounded-2xl border border-border bg-surface p-4 text-start">
          <div className="flex justify-between gap-3 text-sm">
            <span className="text-muted-foreground">الباقة</span>
            <strong>{intent.planDisplayName}</strong>
          </div>
          <div className="mt-3 flex justify-between gap-3 text-sm">
            <span className="text-muted-foreground">المبلغ المسجّل</span>
            <strong dir="ltr">{money(intent.amount, intent.currencyCode)}</strong>
          </div>
          <div className="mt-3 flex justify-between gap-3 text-sm">
            <span className="text-muted-foreground">الحالة</span>
            <strong className="text-warning">بانتظار اعتماد التحويل</strong>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          هذه الرسالة لا تعني أن التحويل تم التحقق منه أو أن الاشتراك اتفعّل.
        </p>
        <Button variant="outline" onClick={() => setDialogOpen(false)}>العودة للاشتراك والاستخدام</Button>
      </div>
    );
  } else if ((step === "pay" || step === "confirm") && intent) {
    content = (
      <div className="mx-auto w-full max-w-2xl space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <InstaPayBrand />
          <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-3 py-1 text-[11px] font-bold text-muted-foreground">
            <Icon name="shield" className="h-4 w-4" /> تحويل يدوي • مراجعة بشرية
          </span>
        </div>
        <section className="rounded-[22px] border border-border bg-card p-4 shadow-sm sm:p-6">
          <div className="rounded-2xl bg-[#69338d]/6 px-3 py-6 text-center sm:px-5">
            <p className="text-xs font-semibold text-muted-foreground">المبلغ المطلوب تحويله</p>
            <p className="mt-2 text-4xl font-black tracking-tight text-foreground sm:text-5xl"
              dir="ltr" data-testid="pay-amount">{money(intent.amount, intent.currencyCode)}</p>
            <p className="mt-2 text-sm text-muted-foreground">
              <span data-testid="pay-plan-name">{intent.planDisplayName}</span>
              {intent.billingInterval ? (intent.billingInterval === "ANNUAL" ? " • اشتراك سنوي" : " • اشتراك شهري") : ""}
            </p>
            {(intent.discountAmount ?? 0) > 0 ? (
              <p className="mt-2 text-xs font-semibold text-[#69338d]">
                وفّرت {money(intent.discountAmount ?? 0, intent.currencyCode)} باستخدام كود {intent.discountCode}
              </p>
            ) : null}
          </div>
          <div className="mt-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-black">بيانات المستفيد</h3>
              <span className="text-xs text-muted-foreground">انسخ البيانات للتحويل</span>
            </div>
            <CopyRow label="اسم المستفيد" value={instructions?.displayName ?? "—"}
              copyId="beneficiary" copied={copied} onCopy={copyValue} />
            <CopyRow label="عنوان الدفع اللحظي (InstaPay)" value={instructions?.handle ?? "—"}
              copyId="handle" copied={copied} onCopy={copyValue} />
            <CopyRow label="مرجع طلب DRVO" value={intent.paymentReference}
              copyId="reference" copied={copied} onCopy={copyValue} testId="drv-payment-reference" />
          </div>
          <p className="mt-4 rounded-xl bg-surface px-3 py-3 text-xs leading-6 text-muted-foreground">
            افتح تطبيق InstaPay، حوّل <strong className="text-foreground">{money(intent.amount, intent.currencyCode)}</strong> إلى المستفيد،
            وتأكد من اسمه قبل اعتماد التحويل. أضف مرجع DRVO في الوصف لو التطبيق بيسمح.
          </p>
          {instructions?.instructions && !/حوّل المبلغ عبر InstaPay باستخدام البيانات أعلاه/.test(instructions.instructions) ? (
            <p className="mt-2 text-xs leading-6 text-muted-foreground">{instructions.instructions}</p>
          ) : null}
          {error ? <p role="alert" className="mt-4 text-sm font-bold text-destructive">{error}</p> : null}
          {step === "pay" ? (
            <Button className="mt-5 w-full rounded-xl" size="lg" onClick={() => {
              setStep("confirm"); setError(null);
            }}>
              لقد حوّلت المبلغ — متابعة التأكيد
              <Icon name="arrow" className="h-4 w-4" />
            </Button>
          ) : null}
        </section>
        {step === "confirm" ? (
          <form className="space-y-4 rounded-[22px] border border-border bg-card p-4 sm:p-6"
            onSubmit={(event) => { event.preventDefault(); void submitConfirmation(); }}>
            <div>
              <h3 className="text-lg font-black">تأكيد بيانات التحويل</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                ادخل البيانات بعد تنفيذ التحويل فعليًا. سنراجعها يدويًا قبل تفعيل الباقة.
              </p>
            </div>
            <div>
              <label htmlFor="payerName" className="mb-1.5 block text-sm font-bold">اسم المحوّل <span className="text-destructive">*</span></label>
              <Input id="payerName" value={payerName} onChange={(event) => setPayerName(event.target.value)}
                autoComplete="name" placeholder="الاسم الظاهر في عملية التحويل" maxLength={160} required />
            </div>
            <div>
              <label htmlFor="transferReference" className="mb-1.5 block text-sm font-bold">رقم العملية / مرجع التحويل <span className="text-xs font-normal text-muted-foreground">(مستحسن)</span></label>
              <Input id="transferReference" dir="ltr" value={transferReference}
                onChange={(event) => setTransferReference(event.target.value)} maxLength={160}
                placeholder="الرقم الموجود في إيصال InstaPay" />
            </div>
            <details className="rounded-xl border border-border px-3 py-2.5">
              <summary className="cursor-pointer text-sm font-bold">إضافة ملاحظة (اختياري)</summary>
              <Textarea id="customerNote" className="mt-3" rows={2} value={customerNote}
                onChange={(event) => setCustomerNote(event.target.value)} maxLength={1000} />
            </details>
            {error ? <p role="alert" className="text-sm font-bold text-destructive">{error}</p> : null}
            <Button type="submit" disabled={submitting || !payerName.trim()} size="lg" className="w-full rounded-xl">
              {submitting ? "جاري إرسال التأكيد…" : "إرسال تأكيد التحويل للمراجعة"}
            </Button>
            <button type="button" className="block w-full text-center text-sm font-semibold text-muted-foreground hover:text-foreground"
              onClick={() => { setError(null); setStep("pay"); }}>
              الرجوع لبيانات التحويل
            </button>
          </form>
        ) : (
          <button type="button" onClick={() => { setStep("review"); setError(null); }}
            className="text-sm font-semibold text-muted-foreground underline-offset-4 hover:underline">
            مراجعة الطلب مرة أخرى
          </button>
        )}
      </div>
    );
  } else if (step === "review") {
    content = (
      <div className="mx-auto w-full max-w-2xl space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold text-primary">الخطوة ٢ من ٣</p>
            <h3 className="mt-1 text-xl font-black">راجع طلب الاشتراك</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {selectedPlan?.displayName ?? "الباقة المختارة"} • {billingInterval === "ANNUAL" ? "سنوي" : "شهري"}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => { setStep("plans"); setError(null); }}>تغيير الباقة</Button>
        </div>
        <section className="space-y-4 rounded-[22px] border border-border bg-card p-4 sm:p-6">
          <div>
            <label htmlFor="billing-discount-code" className="mb-2 block text-sm font-bold">عندك كود خصم؟</label>
            <div className="flex flex-wrap gap-2 sm:flex-nowrap">
              <Input id="billing-discount-code" dir="ltr" autoComplete="off" value={discountCode}
                onChange={(event) => editCode(event.target.value)}
                placeholder="اكتب كود الخصم" className="min-w-0 flex-1" disabled={quoting || creating} />
              <Button variant="outline" disabled={quoting || creating || !selectedCode}
                onClick={() => { if (selectedCode) void requestQuote(selectedCode); }}>
                {quoting ? "جاري التحقق…" : normalizedCode ? "تطبيق الكود" : "تحديث السعر"}
              </Button>
            </div>
            {quote?.discountCode && validQuote ? (
              <p role="status" className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-success">
                <Icon name="check" className="h-4 w-4" /> تم تطبيق كود الخصم {quote.discountCode} بنجاح
              </p>
            ) : null}
          </div>
          {error ? (
            <div role="alert" className="rounded-xl border border-destructive/25 bg-destructive-soft p-3 text-sm font-semibold text-destructive">
              {error}
              {normalizedCode ? (
                <button type="button" className="ms-2 underline" onClick={() => {
                  setDiscountCode(""); setQuote(null); setError(null);
                  if (selectedCode) void requestQuoteWithoutCode(selectedCode);
                }}>
                  متابعة بدون خصم
                </button>
              ) : null}
            </div>
          ) : null}
          {quoting ? (
            <div className="rounded-xl bg-surface">
              <DrvoLoading variant="inline" label="بنراجع السعر والكود…" />
            </div>
          ) : quote && validQuote ? (
            <div className="space-y-3 rounded-2xl bg-surface px-4 py-4">
              <div className="flex justify-between gap-3 text-sm">
                <span className="text-muted-foreground">سعر الباقة</span>
                <span dir="ltr" className="font-semibold">{money(quote.originalAmount, quote.currencyCode)}</span>
              </div>
              {quote.discountAmount > 0 ? (
                <div className="flex justify-between gap-3 text-sm text-success">
                  <span>خصم {quote.discountCode}</span>
                  <span dir="ltr" className="font-semibold">- {money(quote.discountAmount, quote.currencyCode)}</span>
                </div>
              ) : null}
              <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
                <span className="text-sm font-black">الإجمالي المطلوب</span>
                <strong dir="ltr" className="text-2xl font-black tracking-tight">{money(quote.amount, quote.currencyCode)}</strong>
              </div>
            </div>
          ) : null}
          <p className="text-xs leading-6 text-muted-foreground">
            السعر محسوب من نظام الاشتراكات. لن يتم خصم أي مبلغ الآن؛ ستظهر لك بيانات تحويل InstaPay بعد المتابعة.
            {currentPlanCode && selectedCode !== currentPlanCode ? " تُطبَّق تغييرات الباقة بعد مراجعة الدفع وفق شروط الاشتراك." : ""}
          </p>
          <Button size="lg" className="w-full rounded-xl" disabled={!validQuote || quoting || creating}
            onClick={() => void createIntent()}>
            {creating ? "جاري تجهيز الدفع…" : "متابعة إلى الدفع عبر InstaPay"}
            <Icon name="arrow" className="h-4 w-4" />
          </Button>
        </section>
      </div>
    );
  } else {
    content = (
      <div className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="space-y-1">
            <h3 className="text-xl font-black">اختار الباقة المناسبة لشغلك</h3>
            <p className="text-xs text-muted-foreground">مراجعة السعر والخصم قبل الدفع، من غير أي خصم تلقائي.</p>
          </div>
          <div role="group" aria-label="دورة الاشتراك"
            className="inline-flex items-center gap-1 rounded-xl border border-border bg-surface p-1">
            {(["MONTHLY", "ANNUAL"] as const).map((value) => (
              <button type="button" key={value} aria-pressed={billingInterval === value}
                className={"rounded-lg px-4 py-2 text-sm font-bold transition " +
                  (billingInterval === value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
                onClick={() => {
                  setBillingInterval(value); setQuote(null); setError(null);
                }} disabled={quoting || creating}>
                {value === "MONTHLY" ? "شهري" : "سنوي — دفعة واحدة"}
              </button>
            ))}
          </div>
        </div>
        {currentPlan ? (
          <p className="rounded-xl border border-border bg-surface px-3 py-2.5 text-xs font-semibold text-muted-foreground">
            اشتراكك الحالي: <strong className="text-foreground">{currentPlan.displayName}</strong>
            {" · "}التغيير لا يتفعّل بمجرد اختيار الباقة.
          </p>
        ) : null}
        {initialDiscountCode ? (
          <p className="rounded-xl bg-primary/5 px-4 py-3 text-xs text-foreground" role="status">
            <Icon name="spark" className="me-1 inline h-4 w-4 text-primary" />
            كود العرض <strong dir="ltr">{initialDiscountCode}</strong> جاهز للتحقق عند مراجعة السعر.
            {promoPlanCode ? " الباقة المقترحة: " + promoPlanCode + "." : ""}
          </p>
        ) : null}
        <div className="grid gap-3 md:grid-cols-3">
          {paidPlans.map((plan) => {
            const isCurrent = plan.code === currentPlanCode;
            const price = planPrice(plan, billingInterval, v1Quotes);
            const monthly = planPrice(plan, "MONTHLY", v1Quotes);
            const yearly = planPrice(plan, "ANNUAL", v1Quotes);
            const percent = billingInterval === "ANNUAL" && monthly && yearly && yearly < monthly * 12
              ? Math.round((1 - yearly / (monthly * 12)) * 100) : 0;
            return (
              <article key={plan.code} data-testid={"plan-card-" + plan.code}
                className={"flex min-w-0 flex-col rounded-[20px] border p-4 transition sm:p-5 " +
                  (isCurrent ? "border-primary/50 bg-primary/5" : "border-border bg-card hover:border-primary/45")}>
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-base font-black">{plan.displayName}</h4>
                  {isCurrent ? <span className="rounded-full bg-primary/10 px-2 py-1 text-[10px] font-bold text-primary">باقتك الحالية</span> : null}
                  {!isCurrent && percent > 0 ? (
                    <span className="rounded-full bg-success-soft px-2 py-1 text-[10px] font-bold text-success">
                      وفّر {percent}%
                    </span>
                  ) : null}
                </div>
                <p className="mt-4 text-[27px] font-black leading-none tracking-tight" dir="ltr">
                  {price == null ? "—" : money(price, plan.currencyCode)}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {billingInterval === "ANNUAL" ? "تُدفع مرة واحدة للسنة" : "تُدفع شهريًا"}
                </p>
                <div className="mt-5 space-y-2 border-t border-border pt-4 text-xs text-muted-foreground">
                  <p>ردود الموظف الذكي: <strong className="text-foreground">{limit(plan.monthlyAiReplies)}</strong> / شهر</p>
                  <p>رسائل واتساب صادرة: <strong className="text-foreground">{limit(plan.monthlyWhatsAppOutbound)}</strong> / شهر</p>
                  <p>موظفو الاستقبال: <strong className="text-foreground">{limit(plan.maxAgents)}</strong></p>
                  <p>معلومات نشطة: <strong className="text-foreground">{limit(plan.maxActiveKnowledgeItems)}</strong></p>
                </div>
                {enabled && !isCurrent ? (
                  <Button className="mt-6 w-full rounded-xl" disabled={quoting || creating}
                    onClick={() => void requestQuote(plan.code)}>
                    {quoting && selectedCode === plan.code ? "جاري المراجعة…" : "مراجعة السعر"}
                  </Button>
                ) : (
                  <p className="mt-auto pt-6 text-center text-xs font-semibold text-muted-foreground">
                    {isCurrent ? "باقتك المفعّلة حاليًا" : "الدفع غير متاح حاليًا"}
                  </p>
                )}
              </article>
            );
          })}
        </div>
        {plans.some((plan) => plan.code === "FREE") ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-surface px-4 py-3">
            <p className="text-sm font-bold">الباقة المجانية <span className="text-xs font-normal text-muted-foreground">• للاستخدام المحدود</span></p>
            {currentPlanCode === "FREE" ? (
              <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary">باقتك الحالية</span>
            ) : (
              <span className="text-xs text-muted-foreground">الرجوع للباقات الأقل وفق سياسة الاشتراك</span>
            )}
          </div>
        ) : null}
        <p className="text-xs leading-6 text-muted-foreground">
          الترقية تبدأ بعد اعتماد الدفع. أما التخفيض فيبدأ بنهاية الفترة المدفوعة الحالية.
        </p>
      </div>
    );
  }

  // Request a quote with no coupon without depending on an asynchronously-updated input state.
  async function requestQuoteWithoutCode(planCode: string) {
    setQuoting(true); setQuote(null); setError(null);
    try {
      const res = await fetch("/api/billing/manual-payment", {
        method: "POST", credentials: "same-origin",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ action: "preview_quote", planCode, billingInterval, discountCode: null }),
      });
      const data = (await res.json()) as PriceQuote & { error?: string };
      if (!res.ok) throw new Error(mapUserFacingError(data, "تعذر حساب السعر"));
      setQuote(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر حساب السعر");
    } finally {
      setQuoting(false);
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" disabled={initialPendingReview} onClick={openPlans}>
          تغيير الباقة
        </Button>
        {initialOpenIntent ? (
          <Button type="button" variant="ghost" onClick={openExistingPayment}>عرض تعليمات الدفع</Button>
        ) : null}
        {initialPendingReview ? (
          <span className="text-xs text-muted-foreground">لا يمكن بدء طلب جديد أثناء مراجعة التحويل الحالي.</span>
        ) : null}
      </div>

      {dialogOpen ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-3 sm:p-6" dir="rtl">
          <button type="button" aria-label="إغلاق نافذة الدفع"
            disabled={creating || submitting || quoting}
            className="absolute inset-0 bg-black/60 backdrop-blur-[3px]" onClick={() => setDialogOpen(false)} />
          <section role="dialog" aria-modal="true" aria-labelledby="billing-modal-title"
            className={"relative z-10 w-full overflow-y-auto rounded-[24px] border border-border bg-card p-4 shadow-2xl sm:p-6 " +
              (step === "plans" ? "max-w-5xl" : "max-w-3xl")}
            style={{ maxHeight: "calc(100dvh - 2rem)" }}>
            <div className="mb-5 flex items-center justify-between gap-3 border-b border-border pb-4">
              <div>
                <h2 id="billing-modal-title" className="text-lg font-black">
                  {step === "plans" ? "الباقات والاشتراكات" : "إدارة الباقة والدفع"}
                </h2>
                {step !== "plans" && step !== "done" ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {step === "review" ? "مراجعة السعر" : step === "pay" ? "تعليمات تحويل InstaPay" : "تأكيد عملية التحويل"}
                  </p>
                ) : null}
              </div>
              <Button type="button" variant="ghost" size="sm" autoFocus
                disabled={creating || submitting || quoting}
                onClick={() => setDialogOpen(false)}>إغلاق</Button>
            </div>
            {content}
            <p className="sr-only" aria-live="polite">{copied ? "تم نسخ البيانات" : ""}</p>
          </section>
        </div>
      ) : null}
    </>
  );
}
