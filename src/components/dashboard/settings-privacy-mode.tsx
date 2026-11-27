"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { PrivacyMode } from "@/modules/messaging/privacy-mode-policy";
const endpoint = "/api/channels/whatsapp/privacy/mode";
const options: { mode: PrivacyMode; title: string; desc: string }[] = [
 {mode:"ALL", title:"كل المحادثات", desc:"الموظف يتعامل مع كل الأرقام غير المستثناة."},
 {mode:"BUSINESS_ONLY", title:"عملاء البيزنس فقط", desc:"الرسائل الجديدة والمزامنة للأرقام المعتمدة فقط. باقي الرسائل لا تدخل DRVO."},
 {mode:"MANUAL", title:"تفعيل يدوي", desc:"تظهر الرسائل غير المستثناة، لكن الموظف الذكي يعمل فقط مع الأرقام المعتمدة."}
];
export function SettingsPrivacyMode() {
 const [value,setValue] = useState<{mode:PrivacyMode;approved:string[]}|null>(null);
 const [phone,setPhone] = useState("");
 const [busy,setBusy] = useState(false);
 const [error,setError] = useState("");
 useEffect(() => { let active=true; fetch(endpoint,{cache:"no-store"}).then(async r=>{if(!active||r.status===403)return;if(!r.ok)throw Error();const data=await r.json();if(active)setValue(data);}).catch(()=>{if(active)setError("تعذر تحميل أوضاع الخصوصية.");});return()=>{active=false;};},[]);
 async function change(data: object) { setBusy(true);setError("");try{const r=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(data)});if(!r.ok)throw Error();setValue(await r.json());setPhone("");}catch{setError("تعذر حفظ التغيير.");}finally{setBusy(false);} }
 if(!value&&!error)return null;
 return <section className="space-y-3 rounded-2xl border border-border bg-card p-4" aria-label="وضع تشغيل واتساب">
  <h2 className="text-sm font-black">وضع تشغيل الموظف الذكي</h2>
  {value&&<><fieldset disabled={busy} className="space-y-2"><legend className="sr-only">وضع التشغيل</legend>{options.map(o=><button key={o.mode} type="button" aria-pressed={o.mode===value.mode} className={"block w-full rounded-xl border p-3 text-start "+(o.mode===value.mode?"border-primary bg-surface":"border-border")} disabled={busy} onClick={()=>{if(o.mode!==value.mode&&window.confirm("تغيير الوضع يؤثر على الرسائل الجديدة والردود التلقائية. لن يحذف السجل الموجود."))void change({action:"mode",mode:o.mode});}}><span className="block text-sm font-bold">{o.title}{o.mode===value.mode?" ✓":""}</span><span className="block text-xs text-muted-foreground">{o.desc}</span></button>)}</fieldset>
  <p className="text-xs text-muted-foreground">الأرقام المعتمدة مشتركة بين وضع البيزنس والتفعيل اليدوي. الاستثناء الشخصي له الأولوية دائمًا. السجل السابق لا يُحذف ولا يُخفى.</p>
  <form className="flex gap-2" onSubmit={e=>{e.preventDefault();void change({action:"approve",phone});}}><input dir="ltr" type="tel" aria-label="رقم معتمد دولي" required value={phone} onChange={e=>setPhone(e.target.value)} placeholder="+201XXXXXXXXX" disabled={busy} className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm"/><Button type="submit" size="sm" disabled={busy||!phone.trim()}>اعتماد الرقم</Button></form>
  {value.approved.map(p=><div key={p} className="flex items-center justify-between border-t border-border py-2"><span dir="ltr" className="text-sm">+{p}</span><Button variant="outline" size="sm" disabled={busy} onClick={()=>void change({action:"revoke",phone:p})}>إلغاء الاعتماد</Button></div>)}
  </>}
  {error&&<p role="alert" className="text-xs text-destructive">{error}</p>}
 </section>;
}
