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

function relativeActivityLabel(value: Date | null): string {
  if (!value) return "مفيش نشاط لسه";
  const diffMs = Date.now() - new Date(value).getTime();
  const minutes = Math.max(0, Math.floor(diffMs / 60_000));
  if (minutes < 1) return "دلوقتي";
  if (minutes < 60) return `منذ ${minutes} دقيقة`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `منذ ${hours} ساعة`;
  const days = Math.floor(hours / 24);
  return `منذ ${days} يوم`;
}

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
  const activeKnowledge = knowledgeItems.filter((item) => item.isActive).length;
  const activeAgent = agents.find((agent) => agent.isActive) ?? agents[0] ?? null;
  const hasAgent = Boolean(activeAgent);
  const knowledgeLimit = billing.plan?.maxActiveKnowledgeItems ?? null;

  const setupTasks = [
    { label: "بيانات النشاط", done: Boolean(business.name), href: "/dashboard/settings" },
    { label: "معرفة الموظف", done: activeKnowledge > 0, href: "/dashboard/knowledge" },
    { label: "موظف الاستقبال", done: hasAgent, href: "/dashboard/agent" },
    { label: "ربط واتساب", done: waActive, href: "/dashboard/whatsapp" },
    { label: "الرد الآلي", done: aiOn, href: "/dashboard/agent" },
  ];
  const completedSetup = setupTasks.filter((task) => task.done).length;
  const setupPercent = Math.round((completedSetup / setupTasks.length) * 100);
  const setupComplete = completedSetup === setupTasks.length;

  const latestConversation = conversations[0] ?? null;
  const assistantState = !waActive
    ? "محتاج ربط واتساب"
    : !hasAgent || activeKnowledge === 0
      ? "محتاج إعداد بسيط"
      : aiOn
        ? "شغال وبيستقبل العملاء"
        : "جاهز لكن الرد الآلي متوقف";

  const assistantTone = aiOn && waActive
    ? "border-success/20 bg-success-soft/45"
    : setupComplete
      ? "border-warning/20 bg-warning-soft/45"
      : "border-primary/15 bg-primary/5";

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <section
        className={`overflow-hidden rounded-[28px] border p-5 shadow-sm sm:p-7 ${assistantTone}`}
      >
        <div className="grid gap-6 lg:grid-cols-[1.45fr_.75fr] lg:items-center">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={aiOn && waActive ? "default" : "warning"}>
                {aiOn && waActive ? "شغال الآن" : "يحتاج انتباه"}
              </Badge>
              <span className="text-xs font-bold text-muted-foreground">
                {waActive ? "واتساب متصل" : "واتساب غير متصل"}
              </span>
            </div>

            <h1 className="mt-4 text-3xl font-black tracking-[-0.04em] sm:text-4xl">
              موظف الاستقبال بتاع {business.name || "البيزنس"}
            </h1>
            <p className="mt-3 max-w-2xl text-base leading-8 text-muted-foreground">
              {assistantState}
              {activeAgent ? ` — ${activeAgent.name}` : ""}
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/dashboard/inbox">
                <Button size="lg" disabled={!waActive}>
                  شوف المحادثات
                </Button>
              </Link>
              <Link href="/dashboard/knowledge">
                <Button size="lg" variant="outline">
                  علّمه معلومة جديدة
                </Button>
              </Link>
              {!setupComplete ? (
                <Link href="/onboarding">
                  <Button size="lg" variant="ghost">
                    كمّل الإعداد الموجّه
                  </Button>
                </Link>
              ) : null}
            </div>
          </div>

          <div className="rounded-[24px] border border-white/70 bg-white/75 p-5 shadow-sm backdrop-blur">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold text-muted-foreground">آخر نشاط</p>
                <p className="mt-1 text-lg font-black">
                  {relativeActivityLabel(latestConversation?.lastMessageAtUtc ?? null)}
                </p>
              </div>
              <div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-2xl">
                ✦
              </div>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-surface p-4">
                <p className="text-xs font-bold text-muted-foreground">المعرفة</p>
                <p className="mt-1 text-xl font-black tabular-nums">{activeKnowledge}</p>
              </div>
              <div className="rounded-2xl bg-surface p-4">
                <p className="text-xs font-bold text-muted-foreground">المحادثات الأخيرة</p>
                <p className="mt-1 text-xl font-black tabular-nums">{conversations.length}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {!setupComplete ? (
        <Card className="overflow-hidden">
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="text-lg">كمّل تجهيز موظفك</CardTitle>
                <CardDescription className="mt-1">
                  باقي خطوات بسيطة قبل ما يبقى كل شيء جاهز بالكامل.
                </CardDescription>
              </div>
              <div className="min-w-28 text-start sm:text-end">
                <div className="text-2xl font-black tabular-nums">{setupPercent}%</div>
                <div className="text-xs text-muted-foreground">
                  {completedSetup} من {setupTasks.length}
                </div>
              </div>
            </div>
            <Progress value={completedSetup} max={setupTasks.length} className="mt-3" />
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
              {setupTasks.map((task, index) => (
                <Link
                  key={task.label}
                  href={task.href}
                  className={`rounded-2xl border p-4 transition hover:-translate-y-0.5 hover:shadow-sm ${
                    task.done
                      ? "border-success/15 bg-success-soft/40"
                      : "border-border bg-white hover:border-primary/40"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span
                      className={`grid h-8 w-8 place-items-center rounded-full text-xs font-black ${
                        task.done
                          ? "bg-success text-white"
                          : "bg-secondary text-muted-foreground"
                      }`}
                    >
                      {task.done ? "✓" : index + 1}
                    </span>
                    {!task.done ? (
                      <span className="text-[11px] font-black text-primary">متابعة</span>
                    ) : null}
                  </div>
                  <div className="mt-3 text-sm font-black">{task.label}</div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <section>
        <div className="mb-3 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-lg font-black">إيه اللي تحب تعمله؟</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              اختار المهمة، وسيب أسماء الأقسام والتفاصيل التقنية علينا.
            </p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            {
              href: "/dashboard/knowledge",
              icon: "＋",
              title: "علّمه معلومة",
              description: "ضيف خدمة، سعر، سياسة أو أي معلومة جديدة.",
            },
            {
              href: "/dashboard/inbox",
              icon: "💬",
              title: "شوف المحادثات",
              description: "تابع العملاء وتدخل يدويًا وقت ما تحتاج.",
            },
            {
              href: "/dashboard/agent",
              icon: "✦",
              title: "عدّل أسلوبه",
              description: "غيّر النبرة والتعليمات وطريقة الكلام.",
            },
            {
              href: "/dashboard/whatsapp",
              icon: "◉",
              title: "إدارة واتساب",
              description: "راجع الاتصال أو اربط رقم جديد حسب خطتك.",
            },
          ].map((action) => (
            <Link
              key={action.href + action.title}
              href={action.href}
              className="group rounded-[22px] border border-border bg-card p-5 shadow-sm transition-all hover:-translate-y-1 hover:border-primary/30 hover:shadow-md"
            >
              <div className="grid h-11 w-11 place-items-center rounded-2xl bg-primary/8 text-xl text-primary transition group-hover:bg-primary group-hover:text-white">
                {action.icon}
              </div>
              <div className="mt-4 text-base font-black">{action.title}</div>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                {action.description}
              </p>
            </Link>
          ))}
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[1.35fr_.65fr]">
        <Card>
          <CardHeader className="flex-row items-start justify-between gap-3">
            <div>
              <CardTitle className="text-lg">آخر المحادثات</CardTitle>
              <CardDescription className="mt-1">
                أحدث نشاط من العملاء على واتساب.
              </CardDescription>
            </div>
            <Link href="/dashboard/inbox">
              <Button variant="ghost" size="sm">عرض الكل</Button>
            </Link>
          </CardHeader>
          <CardContent>
            {conversations.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-surface/50 p-7 text-center">
                <div className="text-3xl">💬</div>
                <div className="mt-3 font-black">لسه مفيش محادثات</div>
                <p className="mt-1 text-sm text-muted-foreground">
                  أول رسالة واتساب هتظهر هنا تلقائيًا.
                </p>
                {!waActive ? (
                  <Link href="/dashboard/whatsapp" className="mt-4 inline-block">
                    <Button size="sm">اربط واتساب</Button>
                  </Link>
                ) : null}
              </div>
            ) : (
              <div className="space-y-2">
                {conversations.map((conversation) => (
                  <Link
                    key={conversation.conversationId}
                    href="/dashboard/inbox"
                    className="flex items-center gap-3 rounded-2xl border border-transparent p-3 transition hover:border-border hover:bg-surface"
                  >
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-secondary text-sm font-black">
                      {(conversation.contactDisplayName
                        || conversation.contactPhoneNormalized
                        || "ع").slice(0, 1)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-3">
                        <span className="truncate text-sm font-black">
                          {conversation.contactDisplayName
                            || conversation.contactPhoneNormalized
                            || "عميل"}
                        </span>
                        <span className="shrink-0 text-[11px] text-muted-foreground">
                          {relativeActivityLabel(conversation.lastMessageAtUtc)}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {conversation.lastMessagePreview || "محادثة جديدة"}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardDescription>حالة واتساب</CardDescription>
              <CardTitle className="flex items-center justify-between gap-3 text-lg">
                <span>{waLabel}</span>
                <Badge variant={waActive ? "default" : "warning"}>{waLabel}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-6 text-muted-foreground">
                {waActive
                  ? "الاتصال شغال. أي رسالة جديدة هتوصل للـInbox."
                  : "اربط واتساب عشان تبدأ تستقبل الرسائل."}
              </p>
              <Link href="/dashboard/whatsapp" className="mt-4 inline-block">
                <Button variant="outline" size="sm">
                  {waActive ? "إدارة الاتصال" : "ربط واتساب"}
                </Button>
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardDescription>استخدام الخطة</CardDescription>
              <CardTitle className="text-lg">
                {billing.plan?.displayName ?? "مجانية"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="mb-2 flex items-center justify-between gap-3 text-xs">
                  <span className="font-bold">ردود الذكاء</span>
                  <span className="tabular-nums text-muted-foreground">
                    {billing.aiUsed}
                    {billing.plan?.monthlyAiReplies != null
                      ? ` / ${billing.plan.monthlyAiReplies}`
                      : ""}
                  </span>
                </div>
                <Progress
                  value={billing.aiUsed}
                  max={billing.plan?.monthlyAiReplies}
                />
              </div>
              <div>
                <div className="mb-2 flex items-center justify-between gap-3 text-xs">
                  <span className="font-bold">رسائل واتساب</span>
                  <span className="tabular-nums text-muted-foreground">
                    {billing.whatsappOutboundUsed}
                    {billing.plan?.monthlyWhatsAppOutbound != null
                      ? ` / ${billing.plan.monthlyWhatsAppOutbound}`
                      : ""}
                  </span>
                </div>
                <Progress
                  value={billing.whatsappOutboundUsed}
                  max={billing.plan?.monthlyWhatsAppOutbound}
                />
              </div>
              <p className="text-[11px] text-muted-foreground">
                التجديد {formatUsageRenewalAr(billing.usagePeriod.usagePeriodEndUtc)}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      {params.next === "whatsapp" ? (
        <div className="rounded-2xl border border-primary/15 bg-primary/5 p-4 text-sm font-bold text-primary">
          تم حفظ الإعداد. الخطوة التالية: اربط واتساب وجرّب أول رسالة.
        </div>
      ) : null}
    </div>
  );
}
