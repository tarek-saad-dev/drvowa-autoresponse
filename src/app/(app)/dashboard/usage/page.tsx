import { Progress } from "@/components/ui/progress";
import { resolveActiveBusiness } from "@/lib/tenancy/active-business";
import { requireAuthenticatedUser } from "@/lib/tenancy/require-user";
import { formatUsageRenewalAr } from "@/lib/ui/labels";
import { getBillingOverview } from "@/modules/billing/service";
import { listUsageEvents } from "@/modules/usage/service";
import { redirect } from "next/navigation";

function eventTypeLabel(eventType: string): string {
  if (eventType === "AI_REPLY_GENERATED") return "رد آلي";
  if (eventType === "WHATSAPP_OUTBOUND_MESSAGE") return "رسالة واتساب صادرة";
  return "نشاط";
}

export default async function UsagePage() {
  const user = await requireAuthenticatedUser();
  const businessId = await resolveActiveBusiness(
    user.userId,
    user.activeBusinessId,
  );
  if (!businessId) redirect("/onboarding");

  const [overview, events] = await Promise.all([
    getBillingOverview({ businessId }),
    listUsageEvents({ businessId, limit: 50 }),
  ]);

  const plan = overview.plan;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">الاستخدام</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          استهلاكك هذا الشهر. يتجدد في{" "}
          {formatUsageRenewalAr(overview.usagePeriod.usagePeriodEndUtc)}.
        </p>
      </div>

      <section className="space-y-4 rounded-xl border border-border bg-card p-5">
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
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">النشاط الأخير</h2>
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground">لا يوجد نشاط بعد.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {events.map((event) => (
              <li
                key={event.usageEventId}
                className="flex flex-wrap items-baseline gap-x-3 rounded-md border border-border px-3 py-2"
              >
                <span className="font-medium">
                  {eventTypeLabel(event.eventType)}
                </span>
                <span className="text-muted-foreground">×{event.quantity}</span>
                <span className="text-muted-foreground">
                  {new Intl.DateTimeFormat("ar-SA", {
                    dateStyle: "short",
                    timeStyle: "short",
                  }).format(event.occurredAtUtc)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
