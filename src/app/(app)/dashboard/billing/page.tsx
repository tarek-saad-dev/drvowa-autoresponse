import { resolveActiveBusiness } from "@/lib/tenancy/active-business";
import { requireAuthenticatedUser } from "@/lib/tenancy/require-user";
import { isPaymentCheckoutEnabled } from "@/modules/billing/payment-provider";
import {
  getBillingOverview,
  listActivePlans,
} from "@/modules/billing/service";
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

  const paymentsConfigured = isPaymentCheckoutEnabled();

  const [overview, events, availablePlans] = await Promise.all([
    getBillingOverview({ businessId }),
    listUsageEvents({ businessId, limit: 20 }),
    listActivePlans(),
  ]);

  const plan = overview.plan;
  const sub = overview.subscription;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">الفوترة والاستخدام</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          خطة الاشتراك وحدود الاستخدام للشهر الحالي (UTC). تُصفَّر عدّادات
          الاستخدام الشهرية مع بداية كل شهر تقويمي UTC.
        </p>
      </div>

      {!paymentsConfigured ? (
        <div
          className="rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm"
          role="status"
        >
          <p className="font-medium">الدفع الإلكتروني غير مفعّل حالياً</p>
          <p className="mt-1 text-muted-foreground">
            الوضع التجريبي/المجاني فقط — بوابة الدفع غير مهيأة (
            EXTERNAL_GATE_PAYMENT_PROVIDER). لا يوجد زر شراء حتى يتم اختيار مزوّد
            الدفع وإعداد بيانات الاعتماد.
          </p>
        </div>
      ) : null}

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
                : `محظور${overview.blockReason ? ` — ${overview.blockReason}` : ""}`}
            </dd>
          </div>
          {!overview.canAct && overview.blockReason ? (
            <div className="sm:col-span-2">
              <dt className="text-muted-foreground">سبب الحظر</dt>
              <dd className="font-medium text-destructive">
                {overview.blockReason}
              </dd>
            </div>
          ) : null}
        </dl>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">الخطط المتاحة (عرض فقط)</h2>
        <p className="text-sm text-muted-foreground">
          حدود تقنية للخطط النشطة. الأسعار غير معروضة (
          EXTERNAL_GATE_PRICING).
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[32rem] text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2 pr-4 font-medium">الخطة</th>
                <th className="py-2 pr-4 font-medium">واتساب</th>
                <th className="py-2 pr-4 font-medium">وكلاء</th>
                <th className="py-2 pr-4 font-medium">معرفة</th>
                <th className="py-2 pr-4 font-medium">AI / شهر</th>
                <th className="py-2 font-medium">صادر / شهر</th>
              </tr>
            </thead>
            <tbody>
              {availablePlans.map((p) => (
                <tr key={p.planId} className="border-b">
                  <td className="py-2 pr-4 font-medium">
                    {p.displayName} ({p.code})
                  </td>
                  <td className="py-2 pr-4">
                    {formatLimit(p.maxWhatsAppConnections)}
                  </td>
                  <td className="py-2 pr-4">{formatLimit(p.maxAgents)}</td>
                  <td className="py-2 pr-4">
                    {formatLimit(p.maxActiveKnowledgeItems)}
                  </td>
                  <td className="py-2 pr-4">
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
                <span className="font-medium">
                  {event.eventType === "AI_REPLY_GENERATED"
                    ? "رد ذكاء اصطناعي"
                    : event.eventType === "WHATSAPP_OUTBOUND_MESSAGE"
                      ? "رسالة واتساب صادرة"
                      : event.eventType}
                </span>
                <span className="text-muted-foreground">×{event.quantity}</span>
                <span className="text-muted-foreground">
                  {event.occurredAtUtc.toISOString().slice(0, 16)}Z
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
