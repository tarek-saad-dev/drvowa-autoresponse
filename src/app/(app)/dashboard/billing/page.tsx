import { Alert } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { BillingPlansClient } from "@/components/dashboard/billing-plans-client";
import { resolveActiveBusiness } from "@/lib/tenancy/active-business";
import { requireAuthenticatedUser } from "@/lib/tenancy/require-user";
import {
  formatUsageRenewalAr,
  subscriptionStatusLabel,
} from "@/lib/ui/labels";
import {
  getInstaPayDisplayConfig,
  isManualInstaPayEnabled,
} from "@/modules/billing/instapay-config";
import { getBusinessPaymentStatus } from "@/modules/billing/manual-payment-service";
import {
  getBillingOverview,
  listActivePlans,
} from "@/modules/billing/service";
import { redirect } from "next/navigation";

function formatDate(value: Date | null | undefined): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ar-SA", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(value);
}

function paymentStatusLabel(status: string): string {
  if (status === "AWAITING_TRANSFER") return "بانتظار التحويل";
  if (status === "PENDING") return "قيد المراجعة";
  if (status === "APPROVED") return "تم اعتماد الدفع وتفعيل الباقة";
  if (status === "REJECTED") return "تعذر اعتماد الدفع";
  if (status === "CANCELED") return "ملغي";
  return "—";
}

export default async function BillingPage() {
  const user = await requireAuthenticatedUser();
  const businessId = await resolveActiveBusiness(
    user.userId,
    user.activeBusinessId,
  );
  if (!businessId) redirect("/onboarding");

  const manualEnabled = isManualInstaPayEnabled();
  const [overview, availablePlans, paymentStatus] = await Promise.all([
    getBillingOverview({ businessId }),
    listActivePlans(),
    getBusinessPaymentStatus({ businessId }),
  ]);

  const plan = overview.plan;
  const sub = overview.subscription;
  const instructions = manualEnabled ? getInstaPayDisplayConfig() : null;
  const latest = paymentStatus.latest;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <section className="rounded-[28px] border border-border bg-card p-5 shadow-sm sm:p-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-black text-primary">الخطة والفوترة</p>
            <h1 className="mt-2 text-3xl font-black tracking-[-0.035em]">
              خطتك واضحة، والترقية وقت ما تحتاج
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground">
              راجع حالة اشتراكك واستخدامك، واختار الخطة المناسبة من غير تفاصيل محاسبية معقدة.
            </p>
          </div>
          <div className="rounded-2xl bg-surface px-4 py-3">
            <p className="text-[11px] font-bold text-muted-foreground">التجديد</p>
            <p className="mt-1 text-sm font-black">
              {formatUsageRenewalAr(overview.usagePeriod.usagePeriodEndUtc)}
            </p>
          </div>
        </div>
      </section>

      {latest ? (
        <Alert
          variant={
            latest.status === "APPROVED"
              ? "success"
              : latest.status === "REJECTED"
                ? "error"
                : "info"
          }
          title={paymentStatusLabel(latest.status)}
        >
          <p className="text-sm">
            مرجع الدفع:{" "}
            <span className="font-mono font-semibold">
              {latest.paymentReference}
            </span>
          </p>
          {latest.status === "APPROVED" ? (
            <p className="mt-1 text-sm">تم تفعيل باقتك.</p>
          ) : null}
          {latest.status === "REJECTED" && latest.reviewNote ? (
            <p className="mt-1 text-sm">{latest.reviewNote}</p>
          ) : null}
          {latest.status === "AWAITING_TRANSFER" ? (
            <p className="mt-1 text-sm">
              أكمل التحويل عبر InstaPay ثم أكّد العملية من شاشة الدفع أدناه.
            </p>
          ) : null}
          {latest.status === "PENDING" ? (
            <p className="mt-1 text-sm">
              نراجع التحويل يدوياً. لا ترسل طلباً جديداً حتى تظهر النتيجة.
            </p>
          ) : null}
        </Alert>
      ) : null}

      <section className="rounded-[24px] border border-border bg-card p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-black text-primary">اشتراكك الحالي</p>
            <h2 className="mt-1 text-2xl font-black">{plan?.displayName ?? "—"}</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {overview.canAct
                ? "التشغيل متاح دلوقتي ضمن حدود الخطة."
                : "التشغيل متوقف مؤقتًا — راجع حالة الاشتراك."}
            </p>
          </div>
          <div className={`rounded-full px-3 py-1.5 text-xs font-black ${
            overview.canAct
              ? "bg-success-soft text-success"
              : "bg-warning-soft text-warning"
          }`}>
            {subscriptionStatusLabel(sub?.status)}
          </div>
        </div>

        <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">

          <div>
            <dt className="text-muted-foreground">تاريخ الانتهاء</dt>
            <dd className="font-medium">{formatDate(sub?.periodEndUtc)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">حالة التشغيل</dt>
            <dd className="font-medium">
              {overview.canAct ? "جاهز للاستخدام" : "محتاج مراجعة"}
            </dd>
          </div>
        </dl>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-black">استخدامك الحالي</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            نظرة سريعة قبل ما تقرر إذا كنت محتاج ترقية.
          </p>
        </div>
        <div className="grid gap-4 rounded-[24px] border border-border bg-card p-5 shadow-sm sm:grid-cols-2 sm:p-6">
          <Progress
            label="ردود الذكاء الاصطناعي"
            value={overview.aiUsed}
            max={plan?.monthlyAiReplies}
          />
          <Progress
            label="رسائل واتساب الصادرة"
            value={overview.whatsappOutboundUsed}
            max={plan?.monthlyWhatsAppOutbound}
          />
          <Progress
            label="اتصالات واتساب"
            value={overview.whatsappConnectionsUsed}
            max={plan?.maxWhatsAppConnections}
          />
          <Progress
            label="موظفو الاستقبال"
            value={overview.agentsUsed}
            max={plan?.maxAgents}
          />
          <Progress
            label="معرفة نشطة"
            value={overview.activeKnowledgeUsed}
            max={plan?.maxActiveKnowledgeItems}
          />
        </div>
      </section>

      <BillingPlansClient
        enabled={manualEnabled}
        currentPlanCode={plan?.code ?? null}
        instructions={instructions}
        initialOpenIntent={
          paymentStatus.open?.status === "AWAITING_TRANSFER"
            ? {
                paymentRequestId: paymentStatus.open.paymentRequestId,
                paymentReference: paymentStatus.open.paymentReference,
                amount: paymentStatus.open.amount,
                currencyCode: paymentStatus.open.currencyCode,
                planDisplayName: paymentStatus.open.requestedPlanDisplayName,
                planCode: paymentStatus.open.requestedPlanCode,
              }
            : null
        }
        plans={availablePlans.map((p) => ({
          code: p.code,
          displayName: p.displayName,
          monthlyPriceAmount: p.monthlyPriceAmount ?? null,
          currencyCode: p.currencyCode ?? "EGP",
          maxWhatsAppConnections: p.maxWhatsAppConnections ?? null,
          maxAgents: p.maxAgents ?? null,
          maxActiveKnowledgeItems: p.maxActiveKnowledgeItems ?? null,
          monthlyAiReplies: p.monthlyAiReplies ?? null,
          monthlyWhatsAppOutbound: p.monthlyWhatsAppOutbound ?? null,
        }))}
      />
    </div>
  );
}
