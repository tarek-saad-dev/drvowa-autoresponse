import { Alert } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { resolveActiveBusiness } from "@/lib/tenancy/active-business";
import { requireAuthenticatedUser } from "@/lib/tenancy/require-user";
import {
  formatUsageRenewalAr,
  subscriptionStatusLabel,
} from "@/lib/ui/labels";
import { isPaymentCheckoutEnabled } from "@/modules/billing/payment-provider";
import {
  getBillingOverview,
  listActivePlans,
} from "@/modules/billing/service";
import { redirect } from "next/navigation";

function formatLimit(value: number | null | undefined): string {
  if (value == null) return "بلا حد";
  return String(value);
}

export default async function BillingPage() {
  const user = await requireAuthenticatedUser();
  const businessId = await resolveActiveBusiness(
    user.userId,
    user.activeBusinessId,
  );
  if (!businessId) redirect("/onboarding");

  const paymentsConfigured = isPaymentCheckoutEnabled();

  const [overview, availablePlans] = await Promise.all([
    getBillingOverview({ businessId }),
    listActivePlans(),
  ]);

  const plan = overview.plan;
  const sub = overview.subscription;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">الخطة والحدود</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          خطتك الحالية وحدود الاستخدام. يتجدد الاستهلاك الشهري في{" "}
          {formatUsageRenewalAr(overview.usagePeriod.usagePeriodEndUtc)}.
        </p>
      </div>

      {!paymentsConfigured ? (
        <Alert variant="info" title="الترقية قريباً">
          الترقية للخطط المدفوعة ستتوفر قريباً. يمكنك الاستمرار على الخطة الحالية
          بدون انقطاع.
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
          <div className="sm:col-span-2">
            <dt className="text-muted-foreground">إمكانية التشغيل</dt>
            <dd className="font-medium">
              {overview.canAct
                ? "يمكنك استخدام الرد الآلي والميزات ضمن حدود خطتك"
                : "التشغيل موقوف مؤقتاً — راجع حالة الاشتراك أو تواصل مع الدعم"}
            </dd>
          </div>
        </dl>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">حدود خطتك</h2>
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
            label="عناصر المعرفة النشطة"
            value={overview.activeKnowledgeUsed}
            max={plan?.maxActiveKnowledgeItems}
          />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">مقارنة الخطط</h2>
        <p className="text-sm text-muted-foreground">
          مقارنة الحدود بين الخطط. الأسعار النهائية ستُعلن عند فتح الترقية.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[32rem] text-sm">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="py-2 pe-3 text-start font-medium">الخطة</th>
                <th className="py-2 pe-3 text-start font-medium">واتساب</th>
                <th className="py-2 pe-3 text-start font-medium">الموظفون</th>
                <th className="py-2 pe-3 text-start font-medium">المعرفة</th>
                <th className="py-2 pe-3 text-start font-medium">ردود AI</th>
                <th className="py-2 text-start font-medium">رسائل صادرة</th>
              </tr>
            </thead>
            <tbody>
              {availablePlans.map((p) => (
                <tr key={p.planId} className="border-b last:border-0">
                  <td className="py-2 pe-3 font-medium">
                    {p.displayName}
                    {plan?.planId === p.planId ? (
                      <span className="ms-2 text-xs text-primary">
                        (الحالية)
                      </span>
                    ) : null}
                  </td>
                  <td className="py-2 pe-3">
                    {formatLimit(p.maxWhatsAppConnections)}
                  </td>
                  <td className="py-2 pe-3">{formatLimit(p.maxAgents)}</td>
                  <td className="py-2 pe-3">
                    {formatLimit(p.maxActiveKnowledgeItems)}
                  </td>
                  <td className="py-2 pe-3">
                    {formatLimit(p.monthlyAiReplies)}
                  </td>
                  <td className="py-2">
                    {formatLimit(p.monthlyWhatsAppOutbound)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
