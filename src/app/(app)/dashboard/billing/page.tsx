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
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">الخطة والفوترة</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          خطتك الحالية وحدود الاستخدام. يتجدد الاستهلاك الشهري في{" "}
          {formatUsageRenewalAr(overview.usagePeriod.usagePeriodEndUtc)}.
        </p>
      </div>

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
          {latest.status === "PENDING" ? (
            <p className="mt-1 text-sm">
              نراجع التحويل يدوياً. لا ترسل طلباً جديداً حتى تظهر النتيجة.
            </p>
          ) : null}
        </Alert>
      ) : null}

      <section className="space-y-3 rounded-xl border border-border bg-card p-5">
        <h2 className="text-lg font-semibold">اشتراكك الحالي</h2>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">الخطة</dt>
            <dd className="font-medium">{plan?.displayName ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">الحالة</dt>
            <dd className="font-medium">
              {subscriptionStatusLabel(sub?.status)}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">تاريخ الانتهاء</dt>
            <dd className="font-medium">{formatDate(sub?.periodEndUtc)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">إمكانية التشغيل</dt>
            <dd className="font-medium">
              {overview.canAct
                ? "يمكنك استخدام الرد الآلي ضمن حدود خطتك"
                : "التشغيل موقوف مؤقتاً — راجع حالة الاشتراك"}
            </dd>
          </div>
        </dl>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">استخدامك الحالي</h2>
        <div className="space-y-4 rounded-xl border border-border bg-card p-5">
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
