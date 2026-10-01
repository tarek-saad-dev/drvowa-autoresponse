import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { resolveActiveBusiness } from "@/lib/tenancy/active-business";
import { requireAuthenticatedUser } from "@/lib/tenancy/require-user";
import { formatUsageRenewalAr } from "@/lib/ui/labels";
import { getBillingOverview } from "@/modules/billing/service";
import { listUsageEvents } from "@/modules/usage/service";

function eventTypeLabel(eventType: string): string {
  if (eventType === "AI_REPLY_GENERATED") return "رد آلي";
  if (eventType === "WHATSAPP_OUTBOUND_MESSAGE") return "رسالة واتساب";
  return "نشاط";
}

function formatEventTime(value: Date): string {
  return new Intl.DateTimeFormat("ar-EG", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
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

  const metrics = [
    {
      label: "ردود الموظف الذكي",
      value: overview.aiUsed,
      max: plan?.monthlyAiReplies,
      hint: "كل رد يولده الموظف للعملاء",
    },
    {
      label: "رسائل واتساب الصادرة",
      value: overview.whatsappOutboundUsed,
      max: plan?.monthlyWhatsAppOutbound,
      hint: "الرسائل اللي خرجت من النظام",
    },
    {
      label: "أرقام واتساب",
      value: overview.whatsappConnectionsUsed,
      max: plan?.maxWhatsAppConnections,
      hint: "عدد الاتصالات المستخدمة",
    },
    {
      label: "موظفو الاستقبال",
      value: overview.agentsUsed,
      max: plan?.maxAgents,
      hint: "عدد الشخصيات/الموظفين",
    },
    {
      label: "المعلومات النشطة",
      value: overview.activeKnowledgeUsed,
      max: plan?.maxActiveKnowledgeItems,
      hint: "المعلومات اللي الموظف بيرجع لها",
    },
  ];

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <section className="rounded-[28px] border border-border bg-card p-5 shadow-sm sm:p-7">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-black text-primary">استخدام الخطة</p>
            <h1 className="mt-2 text-3xl font-black tracking-[-0.035em]">
              شايف استخدامك من غير أرقام مربكة
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground">
              تابع أهم الحدود اللي بتأثر على التشغيل. الاستهلاك بيتجدد{" "}
              {formatUsageRenewalAr(overview.usagePeriod.usagePeriodEndUtc)}.
            </p>
          </div>
          <Link href="/dashboard/billing">
            <Button variant="outline">شوف الخطة والترقية</Button>
          </Link>
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {metrics.map((metric) => (
          <Card key={metric.label}>
            <CardHeader className="pb-3">
              <CardDescription>{metric.label}</CardDescription>
              <CardTitle className="text-2xl tabular-nums">
                {metric.value}
                {metric.max != null ? ` / ${metric.max}` : ""}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Progress value={metric.value} max={metric.max} />
              <p className="mt-3 text-xs leading-5 text-muted-foreground">
                {metric.hint}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">آخر نشاط محسوب</CardTitle>
          <CardDescription>
            بنعرض آخر العمليات اللي أثرت على استهلاك خطتك.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-surface/50 p-8 text-center">
              <div className="text-3xl">↗</div>
              <p className="mt-3 font-black">لسه مفيش استخدام</p>
              <p className="mt-1 text-sm text-muted-foreground">
                أول رد أو رسالة واتساب هتظهر هنا تلقائيًا.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {events.map((event) => (
                <div
                  key={event.usageEventId}
                  className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="text-sm font-black">
                      {eventTypeLabel(event.eventType)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatEventTime(event.occurredAtUtc)}
                    </p>
                  </div>
                  <div className="rounded-full bg-secondary px-3 py-1 text-xs font-black tabular-nums">
                    +{event.quantity}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
