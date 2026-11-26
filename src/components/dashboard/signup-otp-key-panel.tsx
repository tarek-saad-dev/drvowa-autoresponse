"use client";

import { useRef,useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

export function SignupOtpKeyPanel({initialActive}:{initialActive:boolean}){
  const [active,setActive]=useState(initialActive);
  const [apiKey,setApiKey]=useState<string|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [confirmation,setConfirmation]=useState<"rotate"|"revoke"|null>(null);
  const [copied,setCopied]=useState(false);
  const pending=useRef(false);
  async function change(action:"rotate"|"revoke"){
    if(pending.current)return;
    pending.current=true;setBusy(true);setApiKey(null);setCopied(false);setError("");
    try{
      const res=await fetch("/api/integrations/signup-otp",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action}),cache:"no-store"});
      const result=await res.json();
      if(!res.ok||!result.ok)throw new Error(result.error||"تعذر حفظ المفتاح.");
      if(action==="rotate"&&typeof result.apiKey!=="string")throw new Error("تعذر عرض المفتاح الجديد. أعد إصداره.");
      setActive(result.active===true);setApiKey(action==="rotate"?result.apiKey:null);setConfirmation(null);
    }catch(e){setError(e instanceof Error?e.message:"تعذر الاتصال.");}
    finally{pending.current=false;setBusy(false);}
  }
  return <section className="space-y-4 rounded-[26px] border border-primary/20 bg-card p-5 sm:p-6">
    <div><p className="text-xs font-black text-primary">DRVO ERP · Authentication</p><h2 className="mt-1 text-xl font-black">مفتاح إرسال OTP للتسجيل</h2><p className="mt-2 text-sm leading-7 text-muted-foreground">مفتاح مستقل لإرسال والتحقق من رمز تسجيل الحساب فقط، من رقم واتساب المنشأة الحالية. لا يتيح الوصول للمحادثات أو إرسال رسائل عامة أو أدوات ERP.</p></div>
    <p className="text-sm font-bold">{active?"مفتاح نشط":"لم يتم إصدار مفتاح"}</p>
    <div className="flex flex-wrap gap-2"><Button type="button" disabled={busy} onClick={()=>setConfirmation("rotate")}>{active?"إصدار مفتاح بديل":"إنشاء مفتاح OTP"}</Button>{active&&<Button type="button" disabled={busy} onClick={()=>setConfirmation("revoke")}>إلغاء المفتاح</Button>}</div>
    {confirmation&&<div className="rounded-xl border border-border p-3"><p className="text-sm">{confirmation==="rotate"?(active?"إصدار مفتاح جديد يلغي المفتاح الحالي فورًا. تأكد من تحديث إعدادات السيرفر.":"سيظهر المفتاح مرة واحدة فقط. احفظه مباشرة في إعدادات السيرفر."):"إلغاء المفتاح يوقف الطلبات الجديدة باستخدامه. هل تريد المتابعة؟"}</p><div className="mt-3 flex gap-2"><Button type="button" disabled={busy} onClick={()=>void change(confirmation)}>{busy?"جاري التنفيذ…":"تأكيد"}</Button><button type="button" disabled={busy} className="px-3 text-sm font-bold" onClick={()=>setConfirmation(null)}>رجوع</button></div></div>}
    {error&&<Alert variant="error">{error}</Alert>}
    {apiKey&&<div className="space-y-3 rounded-xl border border-primary/20 bg-primary/5 p-4"><p className="text-xs font-bold">انسخ المفتاح الآن — لن يظهر مرة أخرى بعد إغلاق الصفحة.</p><code dir="ltr" className="block break-all text-sm">{apiKey}</code><div className="flex flex-wrap gap-2"><Button type="button" onClick={async()=>{try{await navigator.clipboard.writeText(apiKey);setCopied(true);}catch{setError("تعذر النسخ. انسخ المفتاح يدويًا.");}}}>{copied?"تم النسخ":"نسخ المفتاح"}</Button><button type="button" className="px-3 text-sm" onClick={()=>setApiKey(null)}>إخفاء المفتاح</button></div><p className="text-xs text-muted-foreground">لا تشارك المفتاح في المحادثات أو في الكود. ضعه في PUBLIC_SIGNUP_OTP_API_KEY على سيرفر Casher.</p></div>}
  </section>;
}
