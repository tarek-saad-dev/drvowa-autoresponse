import Link from "next/link";
import { redirect } from "next/navigation";
import { resolveActiveBusiness } from "@/lib/tenancy/active-business";
import { requireAuthenticatedUser } from "@/lib/tenancy/require-user";
import { getReliabilityOverview } from "@/modules/reliability/service";

const labels: Record<string, string> = {
  RUNTIME_NOT_INGESTED: "واتساب التقط رسالة ولم تظهر في DRVO",
  AI_REPLY_MISSING: "آخر رسالة مؤهلة بلا رد مؤكد أو Job نشطة",
};

export default async function ReliabilityPage() {
  const user = await requireAuthenticatedUser();
  const businessId = await resolveActiveBusiness(user.userId, user.activeBusinessId);
  if (!businessId) redirect("/onboarding");
  const { counters, incidents } = await getReliabilityOverview(businessId);
  const c = counters ?? { captured: 0, stored: 0, missing: 0, unacknowledged: 0, openIncidents: 0, aiSent: 0, aiFailed: 0, handoffPending: 0, escalations: 0, escalationNotificationsSent: 0, escalationsAcknowledged: 0, escalationsAnswered: 0, autoResumed: 0, resumedOnTime: 0, overdueResumes: 0 };
  const tiles = [
    { label: "رسائل Runtime المرصودة (24 ساعة)", value: c.captured },
    { label: "تمت مطابقتها في DRVO", value: c.stored },
    { label: "مفقودة من DRVO بعد دقيقتين", value: c.missing },
    { label: "بانتظار تأكيد Runtime", value: c.unacknowledged },
    { label: "AI Jobs انتهت بإرسال", value: c.aiSent },
    { label: "AI Jobs فشلت", value: c.aiFailed },
    { label: "محادثات مع الفريق", value: c.handoffPending },
    { label: "حوادث مفتوحة", value: c.openIncidents },
    { label: "تصعيدات للتدخل البشري (24 ساعة)", value: c.escalations },
    { label: "إشعارات المالك التي أُرسلت", value: c.escalationNotificationsSent },
    { label: "تصعيدات تم تأكيد استلامها", value: c.escalationsAcknowledged },
    { label: "تصعيدات تلاها رد بشري", value: c.escalationsAnswered },
    { label: "عودة تلقائية بعد 30 دقيقة", value: c.autoResumed },
    { label: "عودة تلقائية خلال 32 دقيقة", value: c.resumedOnTime },
    { label: "محادثات متأخرة عن موعد العودة", value: c.overdueResumes },
  ];
  const captureCoverage = Number(c.captured) > 0
    ? ((Number(c.stored) / Number(c.captured)) * 100).toFixed(1) + "%"
    : "—";
  const resumedWithinSla = Number(c.autoResumed) > 0
    ? ((Number(c.resumedOnTime) / Number(c.autoResumed)) * 100).toFixed(1) + "%"
    : "—";
  const acknowledgedRate = Number(c.escalations) > 0
    ? ((Number(c.escalationsAcknowledged) / Number(c.escalations)) * 100).toFixed(1) + "%"
    : "—";
  return (
    <div dir="rtl" className="mx-auto max-w-7xl space-y-6 pb-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold text-primary">Reliability Center</p>
          <h1 className="mt-1 text-2xl font-black">مراقبة أداء الموظف الذكي</h1>
          <p className="mt-2 text-sm text-muted-foreground">مؤشرات من السجلات الفعلية، مش نسب نجاح تقديرية. آخر 24 ساعة باستثناء الحوادث المفتوحة.</p>
        </div>
        <Link href="/dashboard/inbox" className="rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground hover:opacity-90">فتح المحادثات</Link>
      </div>
      <section className="rounded-2xl border border-border bg-card p-5">
        <p className="text-xs font-bold text-muted-foreground">نسبة مطابقة عينات الـ Runtime المسجلة</p>
        <p className="mt-2 text-3xl font-black tabular-nums" dir="ltr">{captureCoverage}</p>
        <p className="mt-2 text-xs leading-6 text-muted-foreground">دي نسبة تغطية السجلات اللي وصلنا إثبات التقاطها فقط. مش ضمان إن كل الرسائل على واتساب اتشافَت أثناء انقطاع الاتصال. نجاح الإرسال لا يثبت وصوله لهاتف العميل.</p>
      </section>
      <section className="grid gap-3 md:grid-cols-2">
        <article className="rounded-2xl border border-border bg-card p-5">
          <p className="text-xs font-bold text-muted-foreground">تأكيد استلام التصعيدات خلال آخر 24 ساعة</p>
          <p className="mt-2 text-3xl font-black tabular-nums" dir="ltr">{acknowledgedRate}</p>
          <p className="mt-2 text-xs text-muted-foreground">تأكيد الاستلام من الموظف، مش مجرد إرسال إشعار واتساب.</p>
        </article>
        <article className="rounded-2xl border border-border bg-card p-5">
          <p className="text-xs font-bold text-muted-foreground">عودة تلقائية خلال المهلة (30 دقيقة + دقيقتين سماح)</p>
          <p className="mt-2 text-3xl font-black tabular-nums" dir="ltr">{resumedWithinSla}</p>
          <p className="mt-2 text-xs text-muted-foreground">من المحادثات التي عادت تلقائيًا في آخر 24 ساعة. لا تشمل الاستئناف اليدوي أو التصعيد المفتوح.</p>
        </article>
      </section>
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map(tile => (
          <article key={tile.label} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <p className="min-h-10 text-xs leading-5 text-muted-foreground">{tile.label}</p>
            <p className="mt-2 text-2xl font-black tabular-nums">{Number(tile.value ?? 0).toLocaleString("en-US")}</p>
          </article>
        ))}
      </section>
      <section className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="border-b border-border p-5">
          <h2 className="text-lg font-black">الحوادث اللي محتاجة متابعة</h2>
          <p className="mt-1 text-xs text-muted-foreground">الـ Watchdog بيرصد المشاكل وبيحل علامة الحادث لما تظهر أدلة صحيحة. مش بيعيد إرسال واتساب بنتيجة مجهولة.</p>
        </div>
        {incidents.length === 0 ? <p className="p-6 text-sm text-muted-foreground">مفيش حوادث مفتوحة مسجلة حاليًا. ده مش بديل عن التأكد من اتصال واتساب.</p> : (
          <div className="divide-y divide-border">
            {incidents.map(item => (
              <article key={item.incidentId} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="text-sm font-bold">{labels[item.incidentKind] ?? item.incidentKind}</p>
                  <p className="mt-1 text-xs text-muted-foreground" dir="ltr">{item.detailCode ?? "UNKNOWN"} · {new Date(item.detectedAtUtc).toLocaleString("en-GB")}</p>
                </div>
                {item.conversationId ? (
                  <Link className="rounded-lg border border-border px-3 py-2 text-xs font-bold hover:bg-secondary" href={`/dashboard/inbox?conversationId=${encodeURIComponent(item.conversationId)}`}>افتح الشات</Link>
                ) : <span className="text-xs text-muted-foreground">افحص Runtime وسجل الاستقبال</span>}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
