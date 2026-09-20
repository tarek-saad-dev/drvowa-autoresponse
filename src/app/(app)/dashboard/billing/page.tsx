import { resolveActiveBusiness } from "@/lib/tenancy/active-business";
import { requireAuthenticatedUser } from "@/lib/tenancy/require-user";
import { getBillingOverview } from "@/modules/billing/service";
import { listUsageEvents } from "@/modules/usage/service";
import { redirect } from "next/navigation";

function formatLimit(value: number | null | undefined): string {
  if (value == null) return "غير محدود";
  return String(value);
}

function formatUtc(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export default async function BillingPage() {
  const user = await requireAuthenticatedUser();
  const businessId = await resolveActiveBusiness(
    user.userId,
    user.activeBusinessId,
  );
  if (!businessId) redirect("/onboarding");

  const [overview, events] = await Promise.all([
    getBillingOverview({ businessId }),
    listUsageEvents({ businessId, limit: 20 }),
  ]);

  const plan = overview.plan;
  const sub = overview.subscription;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">الفوترة والاستخدام</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          خطة الاشتراك وحدود الاستخدام للشهر الحالي (UTC). الدفع الإلكتروني مؤجل.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">الاشتراك</h2>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">الخطة</dt>
            <dd className="font-medium">
              {plan ? `${plan.displayName} (${plan.code})` : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">الحالة</dt>
            <dd className="font-medium">{sub?.status ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">فترة الاستخدام (UTC)</dt>
            <dd className="font-medium">
              {formatUtc(overview.usagePeriod.usagePeriodStartUtc)}
              {" → "}
              {formatUtc(overview.usagePeriod.usagePeriodEndUtc)}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">إجراءات جديدة</dt>
            <dd className="font-medium">
              {overview.canAct
                ? "مسموح"
                : `محظور${overview.blockReason ? ` (${overview.blockReason})` : ""}`}
            </dd>
          </div>
        </dl>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">الحدود والاستخدام</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[28rem] text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2 pr-4 font-medium">المورد</th>
                <th className="py-2 pr-4 font-medium">المستخدم</th>
                <th className="py-2 font-medium">الحد</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b">
                <td className="py-2 pr-4">ردود الذكاء الاصطناعي (شهري)</td>
                <td className="py-2 pr-4">{overview.aiUsed}</td>
                <td className="py-2">{formatLimit(plan?.monthlyAiReplies)}</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 pr-4">رسائل واتساب الصادرة (شهري)</td>
                <td className="py-2 pr-4">{overview.whatsappOutboundUsed}</td>
                <td className="py-2">
                  {formatLimit(plan?.monthlyWhatsAppOutbound)}
                </td>
              </tr>
              <tr className="border-b">
                <td className="py-2 pr-4">اتصالات واتساب</td>
                <td className="py-2 pr-4">{overview.whatsappConnectionsUsed}</td>
                <td className="py-2">
                  {formatLimit(plan?.maxWhatsAppConnections)}
                </td>
              </tr>
              <tr className="border-b">
                <td className="py-2 pr-4">الوكلاء</td>
                <td className="py-2 pr-4">{overview.agentsUsed}</td>
                <td className="py-2">{formatLimit(plan?.maxAgents)}</td>
              </tr>
              <tr>
                <td className="py-2 pr-4">عناصر المعرفة النشطة</td>
                <td className="py-2 pr-4">{overview.activeKnowledgeUsed}</td>
                <td className="py-2">
                  {formatLimit(plan?.maxActiveKnowledgeItems)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">أحداث الاستخدام الأخيرة</h2>
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground">لا توجد أحداث بعد.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {events.map((event) => (
              <li key={event.usageEventId} className="flex flex-wrap gap-x-3">
                <span className="font-medium">{event.eventType}</span>
                <span className="text-muted-foreground">×{event.quantity}</span>
                <span className="text-muted-foreground">
                  {event.occurredAtUtc.toISOString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
