import { getV1FreeTrialUsage } from "@/modules/pricing/free-trial-usage";
import { isPricingV1PaymentEnabled, quotePricingV1 } from "@/modules/pricing/payment-quote";
import Link from "next/link";
import { redirect } from "next/navigation";

import { BillingPlansClient } from "@/components/dashboard/billing-plans-client";
import { resolveActiveBusiness } from "@/lib/tenancy/active-business";
import { requireAuthenticatedUser } from "@/lib/tenancy/require-user";
import { subscriptionStatusLabel } from "@/lib/ui/labels";
import { getScheduledBillingChange } from "@/modules/billing/documents";
import {
  getInstaPayDisplayConfig,
  isManualInstaPayEnabled,
} from "@/modules/billing/instapay-config";
import { getBusinessPaymentStatus } from "@/modules/billing/manual-payment-service";
import { getBillingOverview, listActivePlans } from "@/modules/billing/service";
import { listUsageEvents } from "@/modules/usage/service";

function formatDate(value: Date | null | undefined): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ar-EG", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(value);
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function paymentStatusLabel(status: string): string {
  if (status === "AWAITING_TRANSFER") return "بانتظار التحويل";
  if (status === "PENDING") return "قيد المراجعة";
  if (status === "REJECTED") return "تعذر اعتماد الدفع";
  return "—";
}

function UsageMeter({
  title,
  used,
  limit,
}: {
  title: string;
  used: number;
  limit: number | null | undefined;
}) {
  const safeLimit = limit != null && limit > 0 ? limit : null;
  const bounded = safeLimit !== null;
  const percent = safeLimit !== null ? Math.min(100, Math.max(0, (used / safeLimit) * 100)) : 0;
  const remaining = safeLimit !== null ? Math.max(0, safeLimit - used) : null;
  return (
    <article className="space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="space-y-1">
        <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
        <p className="text-2xl font-black tabular-nums sm:text-[26px]" dir="ltr">
          {formatNumber(used)}
          <span className="text-sm font-medium text-muted-foreground">
            {safeLimit !== null ? ` / ${formatNumber(safeLimit)}` : " · بلا حد"}
          </span>
        </p>
      </div>
      <div
        role={bounded ? "progressbar" : undefined}
        aria-label={bounded ? title : undefined}
        aria-valuemin={bounded ? 0 : undefined}
        aria-valuemax={safeLimit ?? undefined}
        aria-valuenow={safeLimit !== null ? Math.min(used, safeLimit) : undefined}
        className="h-1.5 overflow-hidden rounded-full bg-secondary"
      >
        <div
          className={`h-full rounded-full ${percent >= 85 ? "bg-warning" : "bg-primary"}`}
          style={{ width: bounded ? `${percent}%` : "0%" }}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {remaining === null ? "استخدام غير محدود حسب الباقة" : `المتبقي ${formatNumber(remaining)}`}
      </p>
    </article>
  );
}

function eventTypeLabel(type: string) {
  if (type === "AI_REPLY_GENERATED") return "رد الموظف الذكي";
  if (type === "WHATSAPP_OUTBOUND_MESSAGE") return "رسالة واتساب";
  return "استخدام مسجّل";
}

export default async function BillingPage() {
  const user = await requireAuthenticatedUser();
  const businessId = await resolveActiveBusiness(
    user.userId,
    user.activeBusinessId,
  );
  if (!businessId) redirect("/onboarding");

  const manualEnabled = isManualInstaPayEnabled();
  const [overview, availablePlans, paymentStatus, scheduled, events] = await Promise.all([
    getBillingOverview({ businessId }),
    listActivePlans(),
    getBusinessPaymentStatus({ businessId }),
    getScheduledBillingChange(businessId),
    listUsageEvents({ businessId, limit: 12 }),
  ]);

  const plan = overview.plan;
  const freeTrial = plan?.code === "FREE" ? await getV1FreeTrialUsage(businessId) : null;
  const sub = overview.subscription;
  const latest = paymentStatus.pending ?? paymentStatus.open ??
    (paymentStatus.latest?.status === "REJECTED" ? paymentStatus.latest : null);
  const awaitingTransfer = latest?.status === "AWAITING_TRANSFER";
  const pendingReview = latest?.status === "PENDING";
  const rejected = latest?.status === "REJECTED";
  const paid = Boolean(plan && plan.code !== "FREE");
  const grace = Boolean(paid && sub?.periodEndUtc && sub.periodEndUtc <= new Date());
  const scheduledIncomplete = Boolean(scheduled && scheduled.Kind !== "CANCEL" && !scheduled.PlanDisplayName);
  const inconsistent = !sub || !plan ||
    (sub.status === "ACTIVE" && !overview.canAct && !grace) ||
    (sub.periodStartUtc && sub.periodEndUtc && sub.periodEndUtc <= sub.periodStartUtc);
  const needsAttention = Boolean(inconsistent || scheduledIncomplete);
  const exhausted = (used: number, max: number | null | undefined) =>
    max != null && max > 0 && used >= max;
  const nearExhaustion = Boolean(plan && (
    exhausted(overview.aiUsed, plan.monthlyAiReplies) ||
    exhausted(overview.whatsappOutboundUsed, plan.monthlyWhatsAppOutbound)
  ));
  const statusText = needsAttention
    ? "يحتاج مراجعة"
    : grace
      ? "فترة سماح"
      : overview.canAct
        ? subscriptionStatusLabel(sub?.status)
        : sub?.status === "PAST_DUE"
          ? "متأخر الدفع"
          : sub?.status === "EXPIRED" || sub?.status === "CANCELED"
            ? subscriptionStatusLabel(sub?.status)
            : "غير متاح";
  const statusTone = needsAttention || grace || !overview.canAct
    ? "bg-warning-soft text-warning"
    : "bg-success-soft text-success";
  const catalogPrice = plan?.monthlyPriceAmount;
  const currency = plan?.currencyCode ?? "EGP";
  const priceText = plan?.code === "FREE"
    ? "مجانية"
    : catalogPrice == null
      ? "غير محدد"
      : `${formatNumber(catalogPrice)} ${currency}`;

  const otherLimits = [
    { label: "أرقام واتساب", used: overview.whatsappConnectionsUsed, max: plan?.maxWhatsAppConnections },
    { label: "موظفو الاستقبال", used: overview.agentsUsed, max: plan?.maxAgents },
    { label: "المعلومات النشطة", used: overview.activeKnowledgeUsed, max: plan?.maxActiveKnowledgeItems },
  ];

  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 pb-12">
      <header className="space-y-1">
        <h1 className="text-2xl font-black tracking-tight sm:text-3xl">
          الاشتراك والاستخدام
        </h1>
        <p className="text-sm text-muted-foreground">
          باقتك، استهلاكك، ومدفوعاتك في مكان واحد.
        </p>
      </header>

      {freeTrial ? (
        <section className="rounded-2xl border border-border bg-card p-4 sm:p-5" aria-label="التجربة المجانية">
          <h2 className="text-base font-bold">تجربتك المجانية</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {freeTrial.expired || freeTrial.remaining === 0
              ? "انتهت ردود التجربة المجانية. اشترك لتفعيل ردود AI."
              : `متبقي ${formatNumber(freeTrial.remaining)} من 30 رد ذكي إجمالًا`}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            تاريخ انتهاء الردود: {formatDate(freeTrial.expiresAtUtc)} · الرصيد لا يتجدد شهريًا
          </p>
        </section>
      ) : null}

      {needsAttention ? (
        <div role="alert" className="rounded-xl border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-warning">
          معلومات الاشتراك أو التغيير المجدول تحتاج مراجعة. لا تعتمد على حالة التفعيل أو أي مبلغ قبل التأكد من بيانات الحساب.
        </div>
      ) : grace ? (
        <div role="status" className="rounded-xl border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-warning">
          انتهت فترة الاشتراك المدفوعة يوم {formatDate(sub?.periodEndUtc)}. أنت في فترة السماح قبل التحويل للباقة المجانية؛ راجع التجديد.
        </div>
      ) : nearExhaustion ? (
        <div role="status" className="rounded-xl border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-warning">
          وصلت للحد المتاح من بعض استخدامات باقتك. راجع الأرقام أدناه أو غيّر الباقة.
        </div>
      ) : null}

      <section className="rounded-[24px] border border-border bg-card p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">باقتك الحالية</p>
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-2xl font-black">{plan?.displayName ?? "غير محددة"}</h2>
              <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${statusTone}`}>
                {statusText}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              {sub?.periodEndUtc
                ? `نهاية الفترة الحالية: ${formatDate(sub.periodEndUtc)}`
                : plan?.code === "FREE"
                  ? "الباقة المجانية بدون موعد انتهاء محدد"
                  : "لا يوجد موعد تجديد مؤكد"}
            </p>
            {!overview.canAct && !needsAttention ? (
              <p className="text-xs text-warning">التشغيل غير متاح في حالة الاشتراك الحالية.</p>
            ) : null}
          </div>
          <div className="space-y-1 sm:text-end">
            <p className="text-xs text-muted-foreground">السعر الأساسي للباقة</p>
            <p className="text-xl font-black tabular-nums">{priceText}</p>
            {catalogPrice != null && catalogPrice > 0 ? (
              <p className="text-xs text-muted-foreground">
                السعر الشهري المعلن، وقد يختلف المدفوع حسب الخصومات ودورة الفوترة
              </p>
            ) : null}
          </div>
        </div>
        {scheduled && !scheduledIncomplete ? (
          <p className="mt-5 rounded-xl bg-surface px-4 py-3 text-xs leading-6 text-muted-foreground">
            التغيير المجدول: {scheduled.Kind === "CANCEL"
              ? "الانتقال إلى المجاني"
              : `الانتقال إلى ${scheduled.PlanDisplayName}`} يوم {formatDate(scheduled.EffectiveAtUtc)}. لا يعني ذلك أنه طُبّق الآن.
          </p>
        ) : null}
        <div className="mt-5 border-t border-border pt-4">
          <BillingPlansClient
            enabled={manualEnabled}
            currentPlanCode={plan?.code ?? null}
            instructions={manualEnabled ? getInstaPayDisplayConfig() : null}
            initialOpenIntent={awaitingTransfer && paymentStatus.open
              ? {
                  paymentRequestId: paymentStatus.open.paymentRequestId,
                  paymentReference: paymentStatus.open.paymentReference,
                  amount: paymentStatus.open.amount,
                  currencyCode: paymentStatus.open.currencyCode,
                  planDisplayName: paymentStatus.open.requestedPlanDisplayName,
                  planCode: paymentStatus.open.requestedPlanCode,
                }
              : null}
            initialPendingReview={pendingReview}
            v1Quotes={isPricingV1PaymentEnabled() ? Object.fromEntries(["STARTER", "PRO", "BUSINESS"].map((code) => [code, { monthly: quotePricingV1(code, "MONTHLY").amount, annual: quotePricingV1(code, "ANNUAL").amount }])) : null}
            plans={availablePlans.map((item) => ({
              code: item.code,
              displayName: item.displayName,
              monthlyPriceAmount: item.monthlyPriceAmount ?? null,
              currencyCode: item.currencyCode ?? "EGP",
              maxWhatsAppConnections: item.maxWhatsAppConnections ?? null,
              maxAgents: item.maxAgents ?? null,
              maxActiveKnowledgeItems: item.maxActiveKnowledgeItems ?? null,
              monthlyAiReplies: item.monthlyAiReplies ?? null,
              monthlyWhatsAppOutbound: item.monthlyWhatsAppOutbound ?? null,
            }))}
          />
        </div>
      </section>

      <section className="space-y-3" aria-labelledby="usage-heading">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="usage-heading" className="text-lg font-black">استخدامك هذا الشهر</h2>
          <p className="text-xs text-muted-foreground">
            تتجدد حدود الرسائل والردود في {formatDate(overview.usagePeriod.usagePeriodEndUtc)}
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <UsageMeter title="ردود الموظف الذكي" used={overview.aiUsed} limit={plan?.monthlyAiReplies} />
          <UsageMeter title="رسائل واتساب الصادرة" used={overview.whatsappOutboundUsed} limit={plan?.monthlyWhatsAppOutbound} />
        </div>
        <details className="group rounded-2xl border border-border bg-card">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 [&::-webkit-details-marker]:hidden">
            <span className="text-sm font-bold">باقي حدود الباقة</span>
            <span aria-hidden="true" className="text-muted-foreground transition-transform group-open:rotate-90">‹</span>
          </summary>
          <div className="grid gap-4 border-t border-border px-4 py-4 sm:grid-cols-3">
            {otherLimits.map((metric) => (
              <div className="space-y-1" key={metric.label}>
                <p className="text-xs text-muted-foreground">{metric.label}</p>
                <p className="text-base font-bold tabular-nums" dir="ltr">
                  {formatNumber(metric.used)} / {metric.max != null ? formatNumber(metric.max) : "بلا حد"}
                </p>
              </div>
            ))}
            <p className="text-xs leading-5 text-muted-foreground sm:col-span-3">
              عداد واتساب يعرض الاتصالات النشطة، وقد تحجز الاتصالات قيد الربط مكانًا من الحد المتاح.
            </p>
          </div>
        </details>
      </section>

      <section className="space-y-3" aria-labelledby="payment-heading">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="payment-heading" className="text-lg font-black">المدفوعات والفواتير</h2>
          <Link href="/dashboard/billing/documents" className="text-sm font-bold text-primary hover:underline">
            الفواتير والإيصالات ←
          </Link>
        </div>
        {latest && (awaitingTransfer || pendingReview || rejected) ? (
          <div className="space-y-3 rounded-2xl border border-border bg-card p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <p className="font-bold">{paymentStatusLabel(latest.status)}</p>
                <p className="text-xs text-muted-foreground">
                  طلب {latest.requestedPlanDisplayName} · المبلغ {formatNumber(latest.amount)} {latest.currencyCode}
                </p>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${rejected
                ? "bg-destructive/10 text-destructive"
                : "bg-warning-soft text-warning"}`}>
                {paymentStatusLabel(latest.status)}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              مرجع الدفع: <b dir="ltr" className="inline-block font-mono">{latest.paymentReference}</b>
            </p>
            {pendingReview ? (
              <p className="text-sm text-muted-foreground">
                استلمنا تأكيد التحويل، وبنراجعه. مش معنى كده إن الدفع اتعتمد أو الباقة اتفعّلت.
              </p>
            ) : rejected ? (
              <p className="text-sm text-destructive">
                {latest.reviewNote || "طلب الدفع لم يُعتمد. راجع البيانات قبل تقديم طلب جديد."}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                الطلب لسه بانتظار التحويل. افتح تعليمات الدفع وقت ما تكون جاهز.
              </p>
            )}
          </div>
        ) : (
          <div className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">
            مفيش طلب دفع محتاج متابعة حاليًا. تقدر تراجع مستنداتك من الفواتير والإيصالات.
          </div>
        )}
      </section>

      <details className="group rounded-2xl border border-border bg-card">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 [&::-webkit-details-marker]:hidden">
          <span className="text-sm font-bold">سجل الاستخدام</span>
          <span aria-hidden="true" className="text-muted-foreground transition-transform group-open:rotate-90">‹</span>
        </summary>
        <div className="divide-y divide-border border-t border-border px-4">
          {events.length ? events.map((event) => (
            <div key={event.usageEventId} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
              <div>
                <p className="font-medium">{eventTypeLabel(event.eventType)}</p>
                <p className="text-xs text-muted-foreground">{formatDate(event.occurredAtUtc)}</p>
              </div>
              <span className="tabular-nums">+{formatNumber(event.quantity)}</span>
            </div>
          )) : (
            <p className="py-4 text-sm text-muted-foreground">لا يوجد استخدام مسجل حتى الآن.</p>
          )}
        </div>
      </details>
    </main>
  );
}
