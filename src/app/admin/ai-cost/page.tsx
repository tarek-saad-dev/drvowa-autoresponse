import Link from "next/link";
import { getAdminAiCostReport } from "@/modules/ai-cost/report";
import { requirePlatformAdmin } from "@/modules/platform-admin/service";

export const dynamic = "force-dynamic";

const fmt = new Intl.NumberFormat("en-US");
const usd = (n: number) => "$" + n.toFixed(4);
const labels: Record<string,string> = {
  WHATSAPP_REPLY: "ردود واتساب",
  KNOWLEDGE_EXTRACT: "استخراج المعرفة",
  KNOWLEDGE_DEDUP: "مراجعة المعرفة",
  ONBOARDING_DISCOVERY: "أسئلة التسجيل",
  ONBOARDING_PREVIEW: "تجربة الموظف",
  PULSE_SHADOW: "التحليل التجريبي",
  VOICE_TRANSCRIBE: "تحويل الصوت",
};

export default async function AdminAiCostPage() {
  await requirePlatformAdmin();
  let rows: Awaited<ReturnType<typeof getAdminAiCostReport>> = [];
  let unavailable = false;
  try {
    rows = await getAdminAiCostReport();
  } catch {
    unavailable = true;
  }
  const calls = rows.reduce((n,r)=>n+Number(r.Requests),0);
  const unpriced = rows.reduce((n,r)=>n+Number(r.Unpriced),0);
  const estimated = rows.reduce((n,r)=>n+Number(r.EstimatedUsd),0);
  return (
    <div className="space-y-5 pb-8">
      <section className="rounded-[24px] border border-border bg-card p-6">
        <p className="text-xs font-bold text-primary">AI COST MONITOR</p>
        <h1 className="mt-2 text-2xl font-black">تكلفة الذكاء الاصطناعي</h1>
        <p className="mt-2 text-sm text-muted-foreground">آخر 30 يوم — حسب النشاط ونوع الاستخدام. الأرقام تبدأ من وقت تفعيل التتبع، وليست فاتورة Google.</p>
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-surface p-4"><p className="text-xs text-muted-foreground">تكلفة Gemini التقديرية</p><p className="mt-2 text-2xl font-black" dir="ltr">{usd(estimated)}</p></div>
          <div className="rounded-xl bg-surface p-4"><p className="text-xs text-muted-foreground">طلبات API مسجلة</p><p className="mt-2 text-2xl font-black">{fmt.format(calls)}</p></div>
          <div className="rounded-xl bg-surface p-4"><p className="text-xs text-muted-foreground">طلبات بدون تكلفة محسوبة</p><p className="mt-2 text-2xl font-black">{fmt.format(unpriced)}</p></div>
        </div>
      </section>
      {unavailable ? (
        <div className="rounded-xl border border-warning/30 p-5 text-sm">تقرير التكلفة غير متاح حاليًا. راجع تطبيق migration 041 واتصال قاعدة البيانات.</div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">لسه مفيش طلبات AI متسجلة في آخر 30 يومًا.</div>
      ) : (
        <section className="overflow-x-auto rounded-[22px] border border-border bg-card">
          <table className="w-full min-w-[760px] text-right text-sm">
            <thead className="bg-surface text-xs text-muted-foreground">
              <tr><th className="p-4">النشاط</th><th className="p-4">الوظيفة</th><th className="p-4">الموديل</th><th className="p-4">الطلبات</th><th className="p-4">Input / Output</th><th className="p-4">غير محسوبة</th><th className="p-4">التكلفة التقديرية</th></tr>
            </thead>
            <tbody>
              {rows.map((r,i)=>(
                <tr key={i} className="border-t border-border">
                  <td className="p-4 font-semibold">{r.BusinessName}</td>
                  <td className="p-4">{labels[r.Purpose] ?? r.Purpose}</td>
                  <td className="p-4 text-xs text-muted-foreground" dir="ltr">{r.Model}</td>
                  <td className="p-4">{fmt.format(Number(r.Requests))}</td>
                  <td className="p-4 tabular-nums" dir="ltr">{fmt.format(Number(r.InputTokens))} / {fmt.format(Number(r.OutputTokens)+Number(r.ThinkingTokens))}</td>
                  <td className="p-4">{fmt.format(Number(r.Unpriced))}</td>
                  <td className="p-4 font-bold tabular-nums" dir="ltr">{usd(Number(r.EstimatedUsd))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      <p className="text-xs leading-6 text-muted-foreground">الأسعار المعروضة تقديرية لطلبات Gemini Standard النصية. تكلفة الصوت غير معروفة حتى توثيق سعر مزود STT. لا تشمل الضرائب أو الرسوم الإضافية أو الاستدعاءات القديمة.</p>
      <Link href="/admin" className="inline-block text-sm font-semibold text-primary hover:underline">العودة للإدارة</Link>
    </div>
  );
}
