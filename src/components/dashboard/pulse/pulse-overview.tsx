import Link from "next/link";
import { ReviewButton } from "./review-button";
import type { PulseSnapshot } from "@/modules/pulse/report";
import type { PulseIntent } from "@/modules/pulse/classifier";

const card="min-w-0 rounded-[22px] border border-border bg-card shadow-[0_16px_40px_-32px_rgba(5,43,58,.36)]";
function Count({label,value,hint}:{label:string;value:number|string;hint:string}) {
 return <div className={card+" p-4 sm:p-5"}>
  <p className="text-xs font-bold text-muted-foreground">{label}</p>
  <p className="mt-4 text-3xl font-black tabular-nums">{typeof value==="number"?value.toLocaleString("en-US"):value}</p>
  <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>
 </div>;
}
function periodHref(period:"today"|"yesterday"|"month",all=false){return "/dashboard?period="+period+(all?"&view=reviews":"");}
export function PulseOverview({data,businessName,businessId,allReviews=false}:{data:PulseSnapshot|null;businessName:string;businessId:string;allReviews?:boolean}) {
 const period=data?.period||"month",monthly=period==="month",yesterday=period==="yesterday";
 const ready=Boolean(data),pending=data?Math.max(0,data.eligible-data.analyzed):0;
 const actionable=(data?.needsAttentionFollowups??0)+(data?.pendingSignals??0);
 const handling=(data?.handlingFollowups??0)+(data?.handlingSignals??0);
 const summary=!ready
  ?"ملخص Pulse غير متاح حاليًا. المحادثات والمتابعة ما زالوا متاحين في قائمة المحادثات."
  :data!.messages===0
   ?"مفيش رسائل واردة جديدة خلال الفترة المختارة. متابعات العملاء المفتوحة بتفضل ظاهرة حتى لو بدأت قبل الفترة دي."
   :"خلال "+(monthly?"الشهر الحالي":yesterday?"أمس":"اليوم")+" وصلتك "+data!.messages.toLocaleString("ar-EG")+" رسالة واردة ضمن "+data!.conversations.toLocaleString("ar-EG")+" محادثة. "+
    (actionable>0?"عندك "+actionable.toLocaleString("ar-EG")+" متابعة أو إشارة محتاجة مراجعة.":"مفيش طلبات مراجعة مفتوحة مصنفة حتى الآن.")+
    (pending>0?" ولسه بيتم تحليل بعض الرسائل.":"");
 const maxTopic=data?.categories[0],totalTopics=(data?.categories??[]).reduce((s,t)=>s+t.conversations,0);
 return <div className="space-y-5 sm:space-y-6" dir="rtl">
  <header className="flex flex-wrap items-end justify-between gap-4">
   <div>
    <p className="mb-1 text-[11px] font-black tracking-wide text-primary">DRVO / PULSE</p>
    <h1 className="text-2xl font-black tracking-tight sm:text-[30px]">نبض نشاطك</h1>
    <p className="mt-1 text-sm text-muted-foreground">كل المهم عن {businessName}، من غير زحمة.</p>
   </div>
   <nav aria-label="الفترة" className="flex rounded-xl border border-border bg-card p-1">
    <Link aria-current={period==="today"?"page":undefined} href={periodHref("today")} className={"rounded-lg px-4 py-2 text-xs font-black "+(period==="today"?"bg-primary text-primary-foreground":"text-muted-foreground hover:bg-surface")}>ملخص اليوم</Link>
    <Link aria-current={yesterday?"page":undefined} href={periodHref("yesterday")} className={"rounded-lg px-4 py-2 text-xs font-black "+(yesterday?"bg-primary text-primary-foreground":"text-muted-foreground hover:bg-surface")}>أمس</Link>
    <Link aria-current={monthly?"page":undefined} href={periodHref("month")} className={"rounded-lg px-4 py-2 text-xs font-black "+(monthly?"bg-primary text-primary-foreground":"text-muted-foreground hover:bg-surface")}>ملخص الشهر</Link>
   </nav>
  </header>
  <section className={card+" border-primary/15 bg-primary/[.035] p-4 sm:p-6"} aria-label="ملخص نبض النشاط">
   <div className="flex items-center gap-2 text-sm font-black"><span className="text-lg text-primary">✦</span> إيه اللي حصل {monthly?"الشهر ده":yesterday?"أمس":"النهارده"}؟</div>
   <p className="mt-3 max-w-4xl text-sm leading-8 text-foreground/90">{summary}</p>
   {ready && handling>0?<p className="mt-2 text-xs leading-6 text-muted-foreground">وفيه {handling.toLocaleString("ar-EG")} متابعة بدأ الفريق التعامل معاها بالفعل؛ مش محسوبة كطلبات محتاجة رد جديد.</p>:null}
   {data?<p className="mt-3 text-xs text-muted-foreground">التصنيف المبدئي: {data.analyzed.toLocaleString("en-US")} من {data.eligible.toLocaleString("en-US")} رسالة نصية متاحة في الفترة • الحجوزات والمشتريات المعروضة استفسارات، وليست عمليات مؤكدة.</p>:null}
  </section>
  <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
   <Count label="محادثات واردة" value={data?.conversations??"—"} hint="عملاء بدأوا أو تفاعلوا خلال الفترة"/>
   <Count label="رد عليها الموظف الذكي" value={data?.aiConversations??"—"} hint="محادثات لها رد AI؛ مش بالضرورة اتحلت"/>
   <Count label="تصعيدات مفتوحة" value={data?.openFollowups??"—"} hint="حالات Smart Follow-up؛ المحادثات مع الفريق أسفلها"/>
   <Count label="تحتاج رد منك" value={data?.pendingSignals??"—"} hint="إشارات محتاجة تدخل؛ الرد البشري يحدثها تلقائيًا"/>
  </div>
  <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(290px,.85fr)]">
   <section className={card+" p-4 sm:p-5"} aria-label="مركز الطلبات">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
     <div>
      <h2 className="text-base font-black sm:text-lg">الطلبات اللي تحتاج مراجعة</h2>
      <p className="mt-1 text-xs text-muted-foreground">الطلبات اللي محتاجة رد أو إجراء منك الآن، حتى لو بدأت قبل الفترة المختارة</p>
     </div>
     <div className="flex items-center gap-3">
      {handling>0?<span className="text-[11px] text-muted-foreground">{handling.toLocaleString("ar-EG")} جاري التعامل معها</span>:null}
      <Link href={periodHref(period,!allReviews)} className="text-xs font-bold text-primary hover:underline">{allReviews?"عرض المختصر":"عرض المزيد من الحالات"}</Link>
     </div>
    </div>
    {!data?<p className="rounded-xl bg-surface p-4 text-sm text-muted-foreground">تعذر تحميل الحالات المصنفة.</p>:
     data.reviews.length===0?<div className="rounded-xl border border-dashed border-border p-7 text-center">
      <p className="font-bold">مفيش طلبات محتاجة رد جديد دلوقتي</p>
      <p className="mt-2 text-xs leading-6 text-muted-foreground">الطلبات اللي اترد عليها انتقلت للمتابعة الجارية، وده مش معناه إن الشكوى اتحلت. راجع معدل تغطية التحليل فوق.</p>
     </div>:
     <div className="divide-y divide-border/65">
      {data.reviews.map((item,i)=><article key={item.kind+item.conversationId+item.intent+i} className="flex min-w-0 gap-3 py-4">
       <span aria-hidden="true" className={"mt-1 h-2.5 w-2.5 shrink-0 rounded-full "+(item.priority==="URGENT"?"bg-warning":"bg-primary/50")}/>
       <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
         <span className="text-sm font-black">{item.name}</span>
         <span className="rounded-full bg-surface px-2 py-1 text-[10px] font-bold text-muted-foreground">{item.label}</span>
         {item.actionType==="OPPORTUNITY"?<span className="text-[10px] text-primary">فرصة محتملة</span>:null}
        </div>
        <p className="mt-1 line-clamp-2 break-words text-xs leading-6 text-muted-foreground" dir="auto">{item.evidence}</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
         <Link href={"/dashboard/inbox?businessId="+encodeURIComponent(businessId)+"&conversationId="+encodeURIComponent(item.conversationId)} className="text-xs font-black text-primary hover:underline">افتح المحادثة ←</Link>
         {item.kind==="SIGNAL"?<ReviewButton conversationId={item.conversationId} intent={item.intent as PulseIntent}/>:<span className="text-[11px] text-muted-foreground">إدارة المتابعة من الشات</span>}
        </div>
       </div>
      </article>)}
     </div>}
    {allReviews?<p className="mt-3 text-[11px] text-muted-foreground">القائمة تعرض أحدث الحالات المصنفة المتاحة، ولا تمثل أرشيفًا كاملًا لكل المحادثات.</p>:null}
   </section>
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
 </div>;
}
