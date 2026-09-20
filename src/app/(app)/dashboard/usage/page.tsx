import { resolveActiveBusiness } from "@/lib/tenancy/active-business";
import { requireAuthenticatedUser } from "@/lib/tenancy/require-user";
import { getBillingOverview } from "@/modules/billing/service";
import { listUsageEvents } from "@/modules/usage/service";
import { redirect } from "next/navigation";

function formatLimit(value: number | null | undefined): string {
  if (value == null) return "غير محدود";
  return String(value);
}

function eventTypeLabel(eventType: string): string {
  if (eventType === "AI_REPLY_GENERATED") return "رد ذكاء اصطناعي";
  if (eventType === "WHATSAPP_OUTBOUND_MESSAGE") return "رسالة واتساب صادرة";
  return eventType;
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
          استهلاك الحصة الشهري (UTC) وأحداث القياس الأخيرة.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">ملخص الشهر الحالي</h2>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">ردود الذكاء الاصطناعي</dt>
            <dd className="font-medium">
              {overview.aiUsed} / {formatLimit(plan?.monthlyAiReplies)}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">واتساب الصادر</dt>
            <dd className="font-medium">
              {overview.whatsappOutboundUsed}
              {" / "}
              {formatLimit(plan?.monthlyWhatsAppOutbound)}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">إعادة التعيين التالية (UTC)</dt>
            <dd className="font-medium">
              {overview.usagePeriod.usagePeriodEndUtc.toISOString().slice(0, 10)}
            </dd>
          </div>
        </dl>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">الأحداث الأخيرة</h2>
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground">لا توجد أحداث بعد.</p>
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
                    timeZone: "UTC",
                  }).format(event.occurredAtUtc)}{" "}
                  UTC
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
