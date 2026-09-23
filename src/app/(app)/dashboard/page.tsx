import Link from "next/link";
import { redirect } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { resolveActiveBusiness } from "@/lib/tenancy/active-business";
import { requireAuthenticatedUser } from "@/lib/tenancy/require-user";
import { formatUsageRenewalAr, whatsappStatusLabel } from "@/lib/ui/labels";
import { listAgents } from "@/modules/agents/service";
import { getWhatsAppAiSetting } from "@/modules/ai";
import { getBillingOverview } from "@/modules/billing/service";
import { getBusinessById } from "@/modules/businesses/service";
import { findWhatsAppConnection } from "@/modules/channels/repository";
import { listItems } from "@/modules/knowledge/service";
import { listInboxConversations } from "@/modules/messaging";

export default async function DashboardOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  const user = await requireAuthenticatedUser();
  const businessId = await resolveActiveBusiness(
    user.userId,
    user.activeBusinessId,
  );

  if (!businessId) {
    redirect("/onboarding");
  }

  const [
    business,
    agents,
    knowledgeItems,
    wa,
    aiSetting,
    billing,
    conversations,
  ] = await Promise.all([
    getBusinessById({ businessId }),
    listAgents({ businessId }),
    listItems({ businessId }),
    findWhatsAppConnection({ businessId }),
    getWhatsAppAiSetting({ businessId }),
    getBillingOverview({ businessId }),
    listInboxConversations({ businessId, limit: 5 }),
  ]);

  const waActive = wa?.status === "ACTIVE";
  const waLabel = whatsappStatusLabel(wa?.status);
  const aiOn = Boolean(aiSetting?.autoReplyEnabled);
  const activeKnowledge = knowledgeItems.filter((k) => k.isActive).length;
  const hasAgent = agents.length > 0;
  const knowledgeLimit = billing.plan?.maxActiveKnowledgeItems ?? null;

  const setupTasks: Array<{ href: string; label: string; done: boolean }> = [
    {
      href: "/dashboard/whatsapp",
      label: "ربط واتساب",
      done: waActive,
    },
    {
      href: "/dashboard/agent",
      label: "إعداد موظف الاستقبال",
      done: hasAgent,
    },
    {
      href: "/dashboard/knowledge",
      label: "إضافة معرفة أولية",
      done: activeKnowledge > 0,
    },
    {
      href: "/dashboard/agent",
      label: "تفعيل الرد الآلي",
      done: aiOn,
    },
  ];
  const pendingSetup = setupTasks.filter((t) => !t.done);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          مرحباً{business.name ? `، ${business.name}` : ""}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {params.next === "whatsapp"
            ? "تم حفظ الإعداد. اربط واتساب لبدء استقبال العملاء."
            : "ملخص حالة الاستقبال والرد الآلي الآن."}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>واتساب</CardDescription>
            <CardTitle className="flex items-center gap-2 text-lg">
              {waLabel}
              <Badge variant={waActive ? "default" : "warning"}>{waLabel}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Link href="/dashboard/whatsapp">
              <Button variant="outline" size="sm">
                {waActive ? "إدارة الاتصال" : "ربط واتساب"}
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>الرد الآلي</CardDescription>
            <CardTitle className="text-lg">
              {aiOn ? "مفعّل" : "متوقف"}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {hasAgent
              ? `موظف الاستقبال: ${agents[0]?.name ?? "جاهز"}`
              : "لم يُعدّ موظف الاستقبال بعد"}
            <div className="mt-3">
              <Link href="/dashboard/agent">
                <Button variant="outline" size="sm">
                  إعداد الموظف
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>ردود الذكاء هذا الشهر</CardDescription>
            <CardTitle className="text-lg tabular-nums">
              {billing.aiUsed}
              {billing.plan?.monthlyAiReplies != null
                ? ` / ${billing.plan.monthlyAiReplies}`
                : ""}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Progress
              value={billing.aiUsed}
              max={billing.plan?.monthlyAiReplies}
            />
            <p className="mt-2 text-xs text-muted-foreground">
              يتجدد في {formatUsageRenewalAr(billing.usagePeriod.usagePeriodEndUtc)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>رسائل واتساب الصادرة</CardDescription>
            <CardTitle className="text-lg tabular-nums">
              {billing.whatsappOutboundUsed}
              {billing.plan?.monthlyWhatsAppOutbound != null
                ? ` / ${billing.plan.monthlyWhatsAppOutbound}`
                : ""}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Progress
              value={billing.whatsappOutboundUsed}
              max={billing.plan?.monthlyWhatsAppOutbound}
            />
            <p className="mt-2 text-xs text-muted-foreground">
              الخطة: {billing.plan?.displayName ?? "مجانية"}
            </p>
          </CardContent>
        </Card>
      </div>

      {pendingSetup.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">إعداد حسابك</CardTitle>
            <CardDescription>
              أكمل الخطوات التالية لتجهيز الاستقبال الآلي.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {pendingSetup.map((task) => (
              <Link
                key={task.label}
                href={task.href}
                className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5 text-sm transition-colors hover:bg-surface"
              >
                <span>{task.label}</span>
                <span className="text-xs text-primary">متابعة</span>
              </Link>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">قاعدة المعرفة</CardTitle>
            <CardDescription>
              {activeKnowledge}
              {knowledgeLimit != null ? ` من ${knowledgeLimit}` : ""} عنصر نشط
              يستخدمه موظف الاستقبال في الرد.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/dashboard/knowledge">
              <Button variant="outline" size="sm">
                إدارة المعرفة
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">أحدث المحادثات</CardTitle>
            <CardDescription>
              {conversations.length === 0
                ? "ستظهر المحادثات هنا بعد استلام رسائل واتساب."
                : "آخر النشاط في الوارد."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {conversations.length === 0 ? (
              waActive ? (
                <Link href="/dashboard/inbox">
                  <Button variant="outline" size="sm">
                    فتح الوارد
                  </Button>
                </Link>
              ) : (
                <Link href="/dashboard/whatsapp">
                  <Button size="sm">ربط واتساب أولاً</Button>
                </Link>
              )
            ) : (
              <>
                <ul className="space-y-2 text-sm">
                  {conversations.map((c) => (
                    <li
                      key={c.conversationId}
                      className="truncate text-muted-foreground"
                    >
                      <span className="font-medium text-foreground">
                        {c.contactDisplayName
                          || c.contactPhoneNormalized
                          || "عميل"}
                      </span>
                      {c.lastMessagePreview
                        ? ` — ${c.lastMessagePreview}`
                        : ""}
                    </li>
                  ))}
                </ul>
                <Link href="/dashboard/inbox">
                  <Button variant="outline" size="sm">
                    فتح المحادثات
                  </Button>
                </Link>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
