"use client";
import {useEffect,useState} from "react";
import {Button} from "@/components/ui/button";
const url="/api/channels/whatsapp/privacy/retention";
type Settings={days:number|null;automatic:boolean;available:boolean;enabledAt:string|null;lastAttemptAt:string|null;preview:{candidates:number;eligible:number}|null};
export function PrivacyRetentionPreference(){
 const [value,setValue]=useState("none"),[automatic,setAutomatic]=useState(false),[confirmed,setConfirmed]=useState(false),[saved,setSaved]=useState<Settings|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(false),[success,setSuccess]=useState(false);
 function apply(d:Settings){setSaved(d);setValue(d.days===null?"none":String(d.days));setAutomatic(d.automatic);setConfirmed(false);}
 useEffect(()=>{let active=true;fetch(url,{cache:"no-store"}).then(async r=>{if(!r.ok)throw Error();const d=await r.json();if(active)apply(d);}).catch(()=>{if(active)setError(true);});return()=>{active=false;};},[]);
 const dirty=Boolean(saved&&(value!==(saved.days===null?"none":String(saved.days))||automatic!==saved.automatic));
 async function save(){if(!dirty||busy||(automatic&&!confirmed))return;setBusy(true);setError(false);setSuccess(false);try{const r=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({days:value==="none"?null:Number(value),automatic,...(automatic?{confirmation:"DELETE_EXPIRED_CONTENT"}:{})})});if(!r.ok)throw Error();apply(await r.json());setSuccess(true);}catch{setError(true);}finally{setBusy(false);}}
 return <section className="space-y-3 rounded-2xl border border-border bg-card p-4"><h2 className="text-sm font-black">مدة الاحتفاظ بمحتوى واتساب</h2><p className="text-xs text-muted-foreground">اختر مدة من تاريخ تخزين الرسالة في DRVO. حفظ المدة وحده لا يمحو البيانات. الحذف التلقائي لا يعمل إلا بعد موافقة صريحة وتفعيل الخدمة.</p>
 <select aria-label="مدة الاحتفاظ" disabled={busy||!saved} value={value} onChange={e=>{setValue(e.target.value);setConfirmed(false);setSuccess(false);if(e.target.value==="none")setAutomatic(false);}} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm"><option value="none">بدون حذف تلقائي</option>{[7,30,90,180,365].map(d=><option key={d} value={d}>{d} يوم</option>)}</select>
 {saved&&<><label className="flex items-start gap-2 text-xs"><input type="checkbox" checked={automatic} disabled={busy||value==="none"||(!saved.available&&!automatic)} onChange={e=>{setAutomatic(e.target.checked);setConfirmed(false);setSuccess(false);}}/><span>حذف محتوى الرسائل والمرفقات المنتهية تلقائيًا</span></label>
 {!saved.available&&<p className="text-xs text-muted-foreground">خدمة الحذف التلقائي غير متاحة حاليًا؛ يمكنك حفظ التفضيل أو إيقاف التفعيل.</p>}
 {automatic&&dirty&&<label className="flex items-start gap-2 rounded-lg border border-red-300 p-3 text-xs text-red-600"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>أوافق على محو المحتوى الأقدم من المدة المختارة، بما في ذلك الموجود حاليًا. لا يمكن استرجاع المحتوى الممحُو.</label>}
 {saved.preview&&<p className="text-xs text-muted-foreground">وفق المدة المحفوظة: {saved.preview.candidates.toLocaleString("ar-EG")} رسالة تجاوزت المدة، منها {saved.preview.eligible.toLocaleString("ar-EG")} مؤهلة للتنظيف. لا يشمل ذلك النسخ الاحتياطية أو كل البيانات المشتقة.</p>}
 <p className="text-xs font-bold">{saved.automatic?(saved.available?"الحذف التلقائي مفعّل":"التفعيل محفوظ، والخدمة متوقفة"):"الحذف التلقائي غير مفعّل"}</p></>}
 <Button size="sm" disabled={busy||!dirty||(automatic&&(!confirmed||!saved?.available))} onClick={()=>void save()}>{busy?"جاري الحفظ…":"حفظ الإعداد"}</Button>
 {success&&<p role="status" className="text-xs text-success">تم حفظ إعداد الاحتفاظ.</p>}{error&&<p role="alert" className="text-xs text-destructive">تعذر تحميل أو حفظ الإعداد.</p>}</section>;
}
