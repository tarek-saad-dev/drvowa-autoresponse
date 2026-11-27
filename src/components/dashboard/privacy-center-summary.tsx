"use client";
import { useEffect,useState } from "react";
type Inventory={messages:number;hiddenMessages:number;olderMessages:number;olderMedia:number;hiddenMedia:number;days:number;removed:{phone:string;removedAtUtc:string}[]};
export function PrivacyCenterSummary(){
 const [days,setDays]=useState(90);
 const [data,setData]=useState<Inventory|null>(null);
 const [error,setError]=useState(false);
 useEffect(()=>{let active=true;setError(false);setData(null);fetch("/api/channels/whatsapp/privacy/inventory?days="+days,{cache:"no-store"}).then(async r=>{if(!r.ok)throw Error();const next=await r.json();if(active)setData(next);}).catch(()=>{if(active)setError(true);});return()=>{active=false;};},[days]);
 const fmt=(n:number|undefined)=>n===undefined?"—":n.toLocaleString("ar-EG");
 return <div className="space-y-4">
 <section className="grid grid-cols-2 gap-2 sm:grid-cols-3" aria-label="ملخص البيانات">
 {[["رسائل محفوظة",data?.messages],["رسائل مخفية",data?.hiddenMessages],["أرقام تمت إزالتها",data?.removed.length]].map(([label,n])=><div key={String(label)} className="rounded-2xl border border-border bg-card p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-black tabular-nums">{fmt(typeof n==="number"?n:undefined)}</p></div>)}
 </section>
 <section className="rounded-2xl border border-border bg-card p-4 space-y-3"><h2 className="text-sm font-black">معاينة الاحتفاظ بالبيانات</h2><p className="text-xs text-muted-foreground">اختر فترة لعرض عدد الرسائل التي تجاوزت عمرها التخزيني. هذه معاينة فقط، لا تحفظ سياسة حذف ولا تمحو أي بيانات.</p><label className="block text-xs font-bold">الفترة <select value={days} onChange={e=>setDays(Number(e.target.value))} className="ms-2 rounded-lg border border-border bg-surface p-2">{[7,30,90,180,365].map(d=><option key={d} value={d}>{d} يوم</option>)}</select></label><div className="grid grid-cols-2 gap-2 text-xs"><div className="rounded-xl bg-surface p-3">رسائل أقدم من الفترة<strong className="mt-1 block text-lg">{fmt(data?.olderMessages)}</strong></div><div className="rounded-xl bg-surface p-3">مرفقات مرتبطة بها<strong className="mt-1 block text-lg">{fmt(data?.olderMedia)}</strong></div></div></section>
 <section className="rounded-2xl border border-border bg-card p-4 space-y-3"><h2 className="text-sm font-black">الأرقام التي تمت إزالتها</h2><p className="text-xs text-muted-foreground">ممنوعة من إعادة الظهور تلقائيًا. السجل السابق لم يُمحَ نهائيًا.</p>{data?.removed.length===0&&<p className="text-xs text-muted-foreground">لا توجد أرقام تمت إزالتها.</p>}{data?.removed.map(r=><div key={r.phone} className="flex items-center justify-between border-t border-border pt-2 text-xs"><span dir="ltr">+{r.phone}</span><span className="text-muted-foreground">{new Date(r.removedAtUtc).toLocaleDateString("ar-EG")}</span></div>)}</section>
 {error&&<p role="alert" className="text-xs text-destructive">تعذر تحميل بيانات الخصوصية.</p>}
 </div>;
}
