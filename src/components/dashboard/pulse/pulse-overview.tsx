import Link from "next/link";
import { PulseReviewCenter } from "./review-center";
import { PulseSummaryChat } from "./pulse-summary-chat";
import type { PulseSnapshot } from "@/modules/pulse/report";
import type { PulsePeriod } from "@/modules/pulse/time";

const card="min-w-0 rounded-[22px] border border-border bg-card shadow-[0_16px_40px_-32px_rgba(5,43,58,.36)]";
function Count({label,value,hint}:{label:string;value:number|string;hint:string}) {
 return <div className={card+" p-4 sm:p-5"}>
  <p className="text-xs font-bold text-muted-foreground">{label}</p>
  <p className="mt-4 text-3xl font-black tabular-nums">{typeof value==="number"?value.toLocaleString("en-US"):value}</p>
  <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>
 </div>;
}
function periodHref(period:"today"|"yesterday"|"month"){return "/dashboard?period="+period;}
export function PulseOverview({data,businessName,businessId,selectedPeriod,quotaWarningActive=false,allReviews=false}:{data:PulseSnapshot|null;businessName:string;businessId:string;selectedPeriod?:PulsePeriod;quotaWarningActive?:boolean;allReviews?:boolean}) {
 const period=selectedPeriod??data?.period??"month",monthly=period==="month",yesterday=period==="yesterday";
 const periodLabel=monthly?"الشهر الحالي":yesterday?"أمس":"اليوم";
 const actionable=(data?.needsAttentionFollowups??0)+(data?.pendingSignals??0);
 const maxTopic=data?.categories[0],totalTopics=(data?.categories??[]).reduce((s,t)=>s+t.conversations,0);
 return <div className="space-y-5 sm:space-y-6" dir="rtl">
  <div className="flex flex-wrap items-center gap-2">
   <nav aria-label="الفترة" className="flex rounded-xl border border-border bg-card p-1">
    <Link aria-current={period==="today"?"page":undefined} href={periodHref("today")} className={"rounded-lg px-4 py-2 text-xs font-black "+(period==="today"?"bg-primary text-primary-foreground":"text-muted-foreground hover:bg-surface")}>ملخص اليوم</Link>
    <Link aria-current={yesterday?"page":undefined} href={periodHref("yesterday")} className={"rounded-lg px-4 py-2 text-xs font-black "+(yesterday?"bg-primary text-primary-foreground":"text-muted-foreground hover:bg-surface")}>أمس</Link>
    <Link aria-current={monthly?"page":undefined} href={periodHref("month")} className={"rounded-lg px-4 py-2 text-xs font-black "+(monthly?"bg-primary text-primary-foreground":"text-muted-foreground hover:bg-surface")}>ملخص الشهر</Link>
   </nav>
  </div>
  <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
   <Count label="محادثات واردة" value={data?.conversations??"—"} hint="عملاء بدأوا أو تفاعلوا خلال الفترة"/>
   <Count label="رد عليها الموظف الذكي" value={data?.aiConversations??"—"} hint="محادثات لها رد AI؛ مش بالضرورة اتحلت"/>
   <Count label="تصعيدات مفتوحة" value={data?.openFollowups??"—"} hint="حالات مفتوحة بدأت أو تجدد نشاطها خلال الفترة"/>
   <Count label="تحتاج رد منك" value={data?actionable:"—"} hint="إجمالي طلبات المتابعة والإشارات اللي لسه محتاجة رد"/>
  </div>
  <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(290px,.85fr)]">
   <PulseReviewCenter data={data} businessId={businessId} periodLabel={periodLabel} quotaWarningActive={quotaWarningActive} allReviews={allReviews}/>
   <div className="min-w-0 space-y-4">
    <section className={card+" p-4 sm:p-5"} aria-label="مواضيع العملاء">
     <h2 className="text-base font-black">العملاء بيسألوا عن إيه؟</h2>
     <p className="mt-1 text-xs text-muted-foreground">عدد المحادثات المصنفة لكل موضوع خلال الفترة</p>
     {data?.categories.length?<div className="mt-5 space-y-4">
      {data.categories.slice(0,5).map(c=><div key={c.intent}>
       <div className="mb-1.5 flex items-center justify-between gap-2 text-xs">
        <span className="font-bold">{c.label}</span><span className="tabular-nums text-muted-foreground">{c.conversations.toLocaleString("en-US")}</span>
       </div>
       <div className="h-1.5 overflow-hidden rounded-full bg-surface">
        <div className="h-full rounded-full bg-primary" style={{width:Math.max(3,Math.round(100*c.conversations/Math.max(1,maxTopic?.conversations??1)))+"%"}}/>
       </div>
      </div>)}
     </div>:<p className="mt-5 text-xs leading-6 text-muted-foreground">لسه مفيش مواضيع متصنفة للفترة دي.</p>}
     {totalTopics>0?<p className="mt-4 text-[10px] leading-5 text-muted-foreground">المحادثة ممكن تدخل في أكتر من موضوع، فمجموع الصفوف مش بالضرورة يساوي إجمالي المحادثات.</p>:null}
    </section>
    <section className={card+" p-4 sm:p-5"} aria-label="اقتراح تحسين">
     <h2 className="flex items-center gap-2 text-base font-black"><span className="text-primary">✦</span> Discover</h2>
     {maxTopic && maxTopic.conversations>=3?
      <>
       <p className="mt-3 text-sm leading-7">موضوع <strong>{maxTopic.label}</strong> ظهر في {maxTopic.conversations} محادثات مصنفة خلال الفترة.</p>
       <p className="mt-2 text-xs leading-6 text-muted-foreground">اقتراح: راجع إجابات الموظف الذكي عن الموضوع ده، واتأكد إن المعلومات محدثة. ده مؤشر اهتمام مش إثبات وجود مشكلة.</p>
       <Link href="/dashboard/agent" className="mt-3 inline-block text-xs font-bold text-primary hover:underline">راجع معلومات الموظف ←</Link>
      </>:<p className="mt-3 text-xs leading-7 text-muted-foreground">هنعرض فرصة تحسين لما يظهر نمط متكرر بدليل كافٍ في الرسائل المصنفة، بدل توصيات من غير أساس.</p>}
    </section>
   </div>
  </div>
  <PulseSummaryChat data={data} period={period} businessName={businessName}/>
 </div>;
}
