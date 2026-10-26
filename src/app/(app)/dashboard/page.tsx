import Link from "next/link";
import { redirect } from "next/navigation";
import { ConnectionHealthStrip } from "@/components/dashboard/overview/connection-health-strip";
import { RecentConversations, type OverviewConversation } from "@/components/dashboard/overview/recent-conversations";
import { isMissingObjectError } from "@/lib/db";
import { fillOverviewTrend, getOverviewConversationTrend, type OverviewTrendDay } from "@/lib/dashboard/overview-trend";
import { deriveReceptionistStatus } from "@/lib/dashboard/receptionist-status";
import { resolveActiveBusiness } from "@/lib/tenancy/active-business";
import { requireAuthenticatedUser } from "@/lib/tenancy/require-user";
import { listAgents } from "@/modules/agents/service";
import { getWhatsAppAiSetting } from "@/modules/ai";
import { getReceptionistOperationalHealth } from "@/modules/ai/operational-health";
import { getBusinessById } from "@/modules/businesses/service";
import { countOpenEscalations } from "@/modules/escalations/service";
import { listItems } from "@/modules/knowledge/service";
import { getDashboardDailyActivity, getInboxConversationCounts, listInboxConversations } from "@/modules/messaging";

const panel = "min-w-0 rounded-[24px] border border-border bg-card shadow-[0_14px_42px_-34px_rgba(5,43,58,.46)]";

function Metric({ label, value, hint, glyph, attention = false, href }: {
  label: string; value: number | null; hint: string; glyph: string; attention?: boolean; href?: string;
}) {
  return <section className={`${panel} flex min-h-[144px] flex-col justify-between p-4 sm:p-5`}>
    <div className="flex items-start justify-between gap-2">
      <span className="text-xs font-bold text-muted-foreground sm:text-sm">{label}</span>
      <span aria-hidden className={`grid h-9 w-9 place-items-center rounded-xl text-lg ${attention ? "bg-warning-soft text-warning" : "bg-primary/10 text-primary"}`}>{glyph}</span>
    </div>
    <div className="mt-4">
      <p dir="ltr" className={`w-fit font-mono text-3xl font-semibold tabular-nums tracking-tight ${attention && value !== null && value > 0 ? "text-warning" : ""}`}>
        {value === null ? "—" : value.toLocaleString("en-US")}
      </p>
      <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>
      {href ? <Link href={href} className="mt-2 inline-flex text-xs font-bold text-primary hover:underline">عرض الحالات ←</Link> : null}
    </div>
  </section>;
}

function Trend({ days }: { days: OverviewTrendDay[] | null }) {
  const peak = Math.max(1, ...(days ?? []).map((d) => d.conversations));
  const points = (days ?? []).map((d, i) => ({ ...d, x: 16 + i * 94.66, y: 125 - d.conversations / peak * 101 }));
  const line = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const active = points.some((p) => p.conversations > 0);
  return <section className={`${panel} p-5 sm:p-6`} aria-label="اتجاه نشاط المحادثات">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="text-base font-black sm:text-lg">نشاط المحادثات</h2>
        <p className="mt-1 text-xs text-muted-foreground">المحادثات النشطة يوميًا خلال آخر 7 أيام</p></div>
      <span className="rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-bold text-muted-foreground">آخر 7 أيام</span>
    </div>
    {!days ? <p className="grid min-h-48 place-items-center text-xs text-muted-foreground">اتجاه النشاط غير متاح حاليًا</p> :
      !active ? <p className="grid min-h-48 place-items-center text-xs text-muted-foreground">مفيش محادثات مسجلة في الفترة دي</p> :
      <>
        <div className="mt-5 flex items-baseline gap-2">
          <span dir="ltr" className="font-mono text-2xl font-semibold tabular-nums">{days.reduce((s, d) => s + d.conversations, 0).toLocaleString("en-US")}</span>
          <span className="text-xs text-muted-foreground">مجموع المحادثات اليومية</span>
        </div>
        <svg className="mt-3 h-36 w-full overflow-visible" viewBox="0 0 600 146" role="img" aria-label={days.map((d) => `${d.date}: ${d.conversations}`).join("، ")}>
          <defs><linearGradient id="overviewTrendFade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity=".22" />
            <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
          </linearGradient></defs>
          {[24, 74, 125].map((y) => <line key={y} x1="16" x2="584" y1={y} y2={y} stroke="var(--border)" strokeDasharray="4 7" />)}
          <path d={`${line} L 584 125 L 16 125 Z`} fill="url(#overviewTrendFade)" />
          <path d={line} stroke="var(--primary)" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" fill="none" />
          {points.map((p) => <circle key={p.date} cx={p.x} cy={p.y} r="3.5" stroke="var(--primary)" strokeWidth="2" fill="var(--card)">
            <title>{p.date}: {p.conversations}</title></circle>)}
        </svg>
        <div className="grid grid-cols-7 gap-1 text-center">{days.map((d) => <span key={d.date} className="text-[10px] font-bold text-muted-foreground">
          {new Intl.DateTimeFormat("ar-EG", { weekday: "short", timeZone: "UTC" }).format(new Date(`${d.date}T12:00:00Z`))}
        </span>)}</div>
      </>
    }
  </section>;
}

function conversationMeta(c: { aiMode: string | null | undefined; aiReplyHealth: {state: string} | null | undefined }): Pick<OverviewConversation, "statusLabel" | "statusTone"> {
  if (c.aiMode === "SAFETY_PAUSED") return {statusLabel: "محتاج مراجعة", statusTone: "attention"};
  if (c.aiMode === "HUMAN_PAUSED") return {statusLabel: "مع الفريق", statusTone: "attention"};
  if (c.aiReplyHealth?.state === "DISABLED" || c.aiReplyHealth?.state === "FAILED") return {statusLabel: "محتاج تدخل", statusTone: "attention"};
  if (c.aiReplyHealth?.state === "REPLYING") return {statusLabel: "بيجهز رد", statusTone: "neutral"};
  return {statusLabel: null, statusTone: "ok"};
}

export default async function DashboardOverviewPage({ searchParams }: { searchParams: Promise<{next?: string}> }) {
  const params = await searchParams;
  const user = await requireAuthenticatedUser();
  const businessId = await resolveActiveBusiness(user.userId, user.activeBusinessId);
  if (!businessId) redirect("/onboarding");
  const [business, agents, knowledgeItems, aiSetting, conversations, inboxCounts] = await Promise.all([
    getBusinessById({businessId}), listAgents({businessId}), listItems({businessId}),
    getWhatsAppAiSetting({businessId}), listInboxConversations({businessId,limit: 5}), getInboxConversationCounts({businessId}),
  ]);
  let openEscalations: number | null = null;
  try { openEscalations = await countOpenEscalations(businessId); }
  catch (error) { if (!isMissingObjectError(error)) throw error; }
  let dailyActivity: Awaited<ReturnType<typeof getDashboardDailyActivity>> = null;
  try { dailyActivity = await getDashboardDailyActivity({businessId}); }
  catch (error) { if (!isMissingObjectError(error)) throw error; }
  let trend: OverviewTrendDay[] | null = null;
  try { trend = fillOverviewTrend(await getOverviewConversationTrend(businessId)); }
  catch (error) { console.error("[dashboard] trend unavailable", error); }
  const activeAgent = agents.find((a) => a.isActive);
  const activeKnowledge = knowledgeItems.filter((item) => item.isActive).length;
  const health = await getReceptionistOperationalHealth({
    businessId, businessName: business.name, autoReplyEnabled: Boolean(aiSetting?.autoReplyEnabled),
    hasActiveAgent: Boolean(activeAgent), hasActiveKnowledge: activeKnowledge > 0,
  });
  const status = deriveReceptionistStatus({ businessName: business.name, health });
  const recent: OverviewConversation[] = conversations.map((c) => ({
    conversationId: c.conversationId, contactDisplayName: c.contactDisplayName,
    contactPhoneNormalized: c.contactPhoneNormalized, lastMessagePreview: c.lastMessagePreview,
    lastMessageAtUtc: c.lastMessageAtUtc, unread: c.unread, ...conversationMeta(c),
  }));
  return <div className="mx-auto w-full max-w-[1420px] space-y-5 pb-6 sm:space-y-6">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="mb-1 text-[11px] font-black tracking-wide text-primary">DRVO / OVERVIEW</p>
        <h1 className="text-2xl font-black tracking-tight sm:text-[30px]">نظرة عامة</h1>
        <p className="mt-1 text-sm text-muted-foreground">كل المهم عن {business.name} في مكان واحد.</p>
      </div>
      <span className="rounded-xl border border-border bg-card px-3 py-2 text-xs font-bold text-muted-foreground">ملخص اليوم</span>
    </header>
    <ConnectionHealthStrip initialUiState={health.whatsappLiveState} initialInboundHealth={health.inboundHealth} initialInboundIssue={health.inboundIssue} status={status} />
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
      <Metric label="محادثات اليوم" value={dailyActivity?.conversationsToday ?? null} hint="محادثات نشطة اليوم" glyph="▤" />
      <Metric label="تحتاج متابعتك" value={openEscalations} hint="حالات تصعيد مفتوحة الآن" glyph="!" attention href={openEscalations !== null && openEscalations > 0 ? "/dashboard/inbox?filter=FOLLOW_UP" : undefined} />
      <Metric label="غير مقروءة" value={inboxCounts.unread} hint="من كل المحادثات الحالية" glyph="◉" />
      <Metric label="تحويلات للفريق" value={dailyActivity?.interventionsToday ?? null} hint="إجمالي تحويلات اليوم" glyph="↗" />
    </div>
    <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.65fr)_minmax(280px,.75fr)]">
      <RecentConversations conversations={recent} whatsappConnected={health.whatsappLiveState === "READY"} />
      <section className={`${panel} flex flex-col p-5 sm:p-6`} aria-label="الموظف الذكي">
        <div className="flex items-center justify-between gap-3"><h2 className="text-base font-black sm:text-lg">الموظف الذكي</h2>
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-xl text-primary" aria-hidden>✦</span></div>
        <div className="mt-5 flex items-center gap-3">
          <div aria-hidden className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl border border-primary/15 bg-primary/5 text-2xl text-primary">✧</div>
          <div className="min-w-0"><p className="truncate text-base font-black">{activeAgent?.name ?? "موظفك الذكي"}</p>
            <p className="mt-1 text-xs text-muted-foreground">{activeAgent?.roleTitle ?? "مساعد العملاء"}</p></div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <span className={`rounded-full px-3 py-1.5 text-[11px] font-black ${status.kind === "working" ? "bg-success-soft text-success" : status.kind === "checking" ? "bg-surface text-muted-foreground" : "bg-warning-soft text-warning"}`}>
            {status.kind === "working" ? "● نشط عند آخر فحص" : status.kind === "checking" ? "◌ جاري الفحص" : status.headline}
          </span>
          <span className="rounded-full bg-surface px-3 py-1.5 text-[11px] font-bold text-muted-foreground">{activeKnowledge.toLocaleString("en-US")} معلومة نشطة</span>
        </div>
        <p className="mt-4 text-xs leading-6 text-muted-foreground">{status.kind === "working" ? "جاهز للرد على العملاء حسب المعلومات اللي اتعلمها." : status.detail}</p>
        <div className="mt-auto space-y-2 pt-6">
          <Link href="/dashboard/agent" className="flex w-full items-center justify-between rounded-xl bg-primary px-4 py-3 text-sm font-black text-primary-foreground transition hover:bg-primary-hover">إدارة الموظف <span aria-hidden>←</span></Link>
          <Link href="/dashboard/knowledge" className="flex w-full items-center justify-between rounded-xl border border-border px-4 py-3 text-xs font-bold transition hover:bg-surface">علّمه معلومة جديدة <span aria-hidden>←</span></Link>
        </div>
      </section>
    </div>
    <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.65fr)_minmax(280px,.75fr)]">
      <Trend days={trend} />
      <section className={`${panel} p-5 sm:p-6`} aria-label="ملخص التشغيل">
        <h2 className="text-base font-black sm:text-lg">ملخص التشغيل</h2>
        <p className="mt-1 text-xs text-muted-foreground">أهم مؤشرات المتابعة الحالية</p>
        <div className="mt-6 space-y-4">
          <div className="flex items-center justify-between gap-2 border-b border-border pb-4">
            <span className="text-xs text-muted-foreground">واتساب</span><span className={`text-xs font-black ${health.whatsappLiveState === "READY" ? "text-success" : "text-warning"}`}>{health.whatsappLiveState === "READY" ? "متصل عند آخر فحص" : "غير جاهز عند آخر فحص"}</span>
          </div>
          <div className="flex items-center justify-between gap-2 border-b border-border pb-4">
            <span className="text-xs text-muted-foreground">الرد الآلي</span><span className={`text-xs font-black ${status.kind === "working" ? "text-success" : status.kind === "checking" ? "text-muted-foreground" : "text-warning"}`}>{status.kind === "working" ? "جاهز عند آخر فحص" : status.kind === "checking" ? "جاري التحقق" : status.headline}</span>
          </div>
          <div className="flex items-center justify-between gap-2"><span className="text-xs text-muted-foreground">غير مقروءة</span>
            <span dir="ltr" className="font-mono text-sm font-semibold tabular-nums">{inboxCounts.unread.toLocaleString("en-US")}</span></div>
        </div>
        <Link href="/dashboard/inbox" className="mt-6 inline-flex text-xs font-black text-primary hover:underline">افتح مركز المحادثات ←</Link>
      </section>
    </div>
    {params.next === "whatsapp" && <p className="rounded-2xl border border-primary/15 bg-primary/5 px-4 py-3 text-sm font-bold text-primary">تم حفظ الإعداد. الخطوة التالية: اربط واتساب وجرّب أول رسالة.</p>}
  </div>;
}
