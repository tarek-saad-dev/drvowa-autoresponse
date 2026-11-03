"use client";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type Run = {
  runId:string;
  status:"QUEUED"|"RUNNING"|"PAUSED"|"COMPLETED"|"CANCELLED";
  total:number; pending:number; inFlight:number; sent:number; failed:number;
  unknown:number; skipped:number; createdAtUtc:string;
};
type Preview = {
  eligible:number; canLaunch:boolean; hasQuota:boolean; enabled:boolean; labelActive:boolean;
  alreadyLaunched:boolean; businessName:string; optInText:string;
  sendRate:string; coverage:"EVENT_DRIVEN_PARTIAL"; run:Run|null;
};

export function LabelCampaignLaunch({draftId,preflightId,messageText}:{
  draftId:string;preflightId:string;messageText:string;
}) {
  const [preview,setPreview]=useState<Preview|null>(null);
  const [confirm,setConfirm]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const url="/api/whatsapp/label-campaigns/"+draftId+"/launch";
  const refresh=useCallback(async () => {
    const res=await fetch(url+"?preflightId="+encodeURIComponent(preflightId),{cache:"no-store"});
    const data=(await res.json().catch(()=>({}))) as {preview?:Preview;error?:string};
    if(!res.ok||!data.preview)throw new Error(data.error||"تعذر مراجعة جاهزية الحملة.");
    setPreview(data.preview);
  },[url,preflightId]);

  useEffect(()=>{
    let active=true;
    void refresh().catch(()=>{if(active)setError("تعذر تحميل حالة الحملة.");});
    const timer=setInterval(()=>{
      void refresh().catch(()=>{});
    },30000);
    return ()=>{active=false;clearInterval(timer);};
  },[refresh]);

  async function submit() {
    if(!preview?.canLaunch||busy||!confirm)return;
    setBusy(true);setError(null);
    try {
      const res=await fetch(url,{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          preflightId,expectedEligible:preview.eligible,expectedMessage:messageText,
        }),
      });
      const data=(await res.json().catch(()=>({}))) as {run?:Run;error?:string};
      if(!res.ok||!data.run)throw new Error(data.error||"تعذر بدء الحملة.");
      setConfirm(false);
      await refresh();
    } catch(err) {
      setError(err instanceof Error?err.message:"تعذر بدء الحملة.");
    } finally {setBusy(false);}
  }
  async function action(action:"pause"|"resume"|"cancel") {
    if(!preview?.run||busy)return;
    setBusy(true);setError(null);
    try {
      const res=await fetch(url,{
        method:"PATCH",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({preflightId,runId:preview.run.runId,action}),
      });
      const data=(await res.json().catch(()=>({}))) as {run?:Run;error?:string};
      if(!res.ok||!data.run)throw new Error(data.error||"تعذر تغيير حالة الحملة.");
      await refresh();
    } catch(err) {
      setError(err instanceof Error?err.message:"تعذر تحديث الحملة.");
    } finally {setBusy(false);}
  }
  if (!preview) return <p role="status" className="text-xs text-muted-foreground">بنراجع جاهزية الإرسال…</p>;

  return <div className="space-y-2 rounded-xl border border-border bg-surface/50 p-3">
    <p className="text-xs font-bold">الإرسال والمتابعة</p>
    {preview.run ? <>
      <p className="text-xs font-semibold">
        {preview.run.status==="QUEUED"?"في انتظار الإرسال":
          preview.run.status==="RUNNING"?"جاري إرسال الرسائل تدريجيًا":
          preview.run.status==="PAUSED"?"الحملة متوقفة مؤقتًا":
          preview.run.status==="CANCELLED"?"الحملة ملغية":"اكتملت الحملة"}
      </p>
      <p className="text-xs leading-6 text-muted-foreground">
        {preview.run.sent.toLocaleString("ar-EG")} أرسلت لواتساب،
        {" "}{preview.run.pending.toLocaleString("ar-EG")} منتظرة،
        {" "}{preview.run.skipped.toLocaleString("ar-EG")} مستبعدة،
        {" "}{preview.run.failed.toLocaleString("ar-EG")} فشلت،
        {" "}{preview.run.unknown.toLocaleString("ar-EG")} نتائجها غير مؤكدة
      </p>
      {preview.run.unknown>0?
        <p className="text-xs text-warning">فيه محاولات مش معروف وصلت ولا لأ؛ مش هنعيدها تلقائيًا لمنع التكرار.</p>:null}
      <div className="flex flex-wrap gap-2">
        {["QUEUED","RUNNING"].includes(preview.run.status)?<>
          <Button size="sm" variant="outline" disabled={busy} onClick={()=>void action("pause")}>إيقاف مؤقت</Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={()=>void action("cancel")}>إلغاء الباقي</Button>
        </>:null}
        {preview.run.status==="PAUSED"?
          <Button size="sm" disabled={busy} onClick={()=>void action("resume")}>استئناف</Button>:null}
        <Button size="sm" variant="outline" disabled={busy}
          onClick={()=>void refresh().catch(()=>setError("تعذر تحديث النتائج."))}>تحديث النتائج</Button>
      </div>
    </> : <>
      <p className="text-xs leading-6 text-muted-foreground">
        {preview.eligible.toLocaleString("ar-EG")} عميل موافق صراحة ومسموح إدراجه حاليًا.
        المزامنة القديمة قد تكون جزئية.
      </p>
      {!preview.labelActive?
        <p className="text-xs text-warning">المسودة أو القائمة اتغيرت؛ راجعها واعتمد الصياغة من جديد.</p>:null}
      {preview.eligible===0?<div className="space-y-1">
        <p className="text-xs">مفيش موافقات موثقة للرسائل التسويقية في القائمة حاليًا. لو العميل حابب يشترك، يقدر يبعث النص ده من رقمه:</p>
        <p dir="auto" className="rounded-lg bg-card p-2 text-xs">{preview.optInText}</p>
        <Button size="sm" variant="outline" onClick={()=>void navigator.clipboard.writeText(preview.optInText)}>نسخ النص</Button>
      </div>:null}
      {preview.eligible>0&&!preview.hasQuota?<p className="text-xs text-warning">
        باقتك الحالية مش بتسمح بإرسال العدد ده من رسائل واتساب. راجع الاستخدام أو الباقة.
      </p>:null}
      {!preview.enabled?<p className="text-xs text-warning">
        محرك إرسال الحملات لسه غير مفعّل على السيرفر.
      </p>:null}
      {preview.eligible>60?<p className="text-xs text-warning">
        الحد الأقصى للإرسال في الحملة الواحدة 60 رقمًا. قسم القائمة لحملات أصغر.
      </p>:null}
      {preview.canLaunch?<div className="space-y-2">
        <p className="text-[11px] text-muted-foreground">{preview.sendRate}</p>
        {!confirm?
          <Button size="sm" onClick={()=>setConfirm(true)}>مراجعة وإرسال ({preview.eligible.toLocaleString("ar-EG")})</Button>
          :<div className="space-y-2 rounded-xl border border-border bg-card p-3">
            <p className="text-xs font-bold">تأكيد نهائي: سيتم إرسال الرسالة التالية إلى {preview.eligible.toLocaleString("ar-EG")} عميل.</p>
            <p dir="auto" className="whitespace-pre-wrap text-xs leading-6">{messageText}</p>
            <p className="text-[11px] text-muted-foreground">بعد التأكيد، الرسائل هتتبعت تدريجيًا في أوقات العمل، وتقدر توقف الباقي.</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled={busy} onClick={()=>void submit()}>تأكيد بدء الإرسال</Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={()=>setConfirm(false)}>رجوع</Button>
            </div>
          </div>}
      </div>:null}
    </>}
    {error?<p role="alert" className="text-xs text-warning">{error}</p>:null}
  </div>;
}
