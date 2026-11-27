"use client";
import {useEffect,useState} from "react";
import {Button} from "@/components/ui/button";
const url="/api/channels/whatsapp/privacy/retention";
export function PrivacyRetentionPreference(){
 const [value,setValue]=useState("none"),[saved,setSaved]=useState<string|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(false);
 useEffect(()=>{let active=true;fetch(url,{cache:"no-store"}).then(async r=>{if(!r.ok)throw Error();const d=await r.json();if(active){const v=d.days===null?"none":String(d.days);setValue(v);setSaved(v);}}).catch(()=>{if(active)setError(true);});return()=>{active=false;};},[]);
 async function save(){setBusy(true);setError(false);try{const r=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({days:value==="none"?null:Number(value)})});if(!r.ok)throw Error();const d=await r.json();setSaved(d.days===null?"none":String(d.days));}catch{setError(true);}finally{setBusy(false);}}
 return <section className="space-y-3 rounded-2xl border border-border bg-card p-4"><h2 className="text-sm font-black">تفضيل مدة الاحتفاظ</h2><p className="text-xs text-muted-foreground">احفظ المدة المطلوبة للصيانة المستقبلية. الحذف التلقائي غير مفعّل، وحفظ التفضيل لا يحذف الرسائل.</p><div className="flex flex-wrap gap-2"><select aria-label="مدة الاحتفاظ المفضلة" disabled={busy||saved===null} value={value} onChange={e=>setValue(e.target.value)} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm"><option value="none">بدون مدة محددة</option>{[7,30,90,180,365].map(d=><option key={d} value={d}>{d} يوم</option>)}</select><Button size="sm" disabled={busy||saved===null||saved===value} onClick={()=>void save()}>حفظ التفضيل</Button></div>{error&&<p role="alert" className="text-xs text-destructive">تعذر تحميل أو حفظ التفضيل.</p>}</section>;
}
