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
  if (!preview) return <p role="status" className="rounded-xl border border-border bg-surface p-4 text-sm text-muted-foreground">بنجهّز بداية الإرسال…</p>;

  return <section aria-label="حالة إرسال حملة واتساب" className="space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-5">
    <h4 className="font-display text-base font-bold">{preview.run ? "متابعة الإرسال" : "بدء الإرسال"}</h4>
    {preview.run ? <>
      <p role="status" className={"inline-flex rounded-full px-3 py-2 text-xs font-semibold " +
        (preview.run.status === "COMPLETED" ? "bg-success-soft text-success" :
          preview.run.status === "PAUSED" || preview.run.status === "CANCELLED" ? "bg-warning-soft text-warning" :
            "bg-info-soft text-info")}>
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
        <p role="status" className="rounded-xl border border-warning/30 bg-warning-soft px-3 py-2 text-xs leading-6 text-warning">فيه محاولات مش معروف وصلت ولا لأ؛ مش هنعيدها تلقائيًا لمنع التكرار.</p>:null}
      <div className="flex flex-wrap gap-2">
        {["QUEUED","RUNNING"].includes(preview.run.status)?<>
          <Button size="sm" variant="outline" disabled={busy} onClick={()=>void action("pause")}>إيقاف مؤقت</Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={()=>void action("cancel")}>إلغاء الباقي</Button>
        </>:null}
        {preview.run.status==="PAUSED"?
          <Button size="sm" disabled={busy} onClick={()=>void action("resume")}>استئناف</Button>:null}
        <Button size="sm" variant="outline" disabled={busy}
          onClick={()=>void refresh().catch(()=>setError("تعذر تحديث النتائج."))}>تحديث النتائج</Button>
      </div>
    </> : <>
      <div className="rounded-xl border border-border bg-surface px-4 py-3">
        <p className="text-sm font-bold">{preview.eligible.toLocaleString("ar-EG")} عميل مؤهل للإرسال</p>
        <p className="mt-1 text-xs text-muted-foreground">
          بنراجع الموافقات، وطلبات الإيقاف، والتكرار والباقة تلقائيًا قبل الإرسال.
        </p>
      </div>
      {!preview.labelActive?
        <p className="rounded-lg bg-warning-soft px-3 py-2 text-xs text-warning">المسودة أو القائمة اتغيرت؛ راجعها واعتمد الصياغة من جديد.</p>:null}
      {preview.eligible===0?<p className="text-xs text-warning">
        مفيش رقم مؤهل حاليًا. لازم العميل يوافق على استقبال العروض من رقمه قبل بدء الإرسال.
      </p>:null}
      {preview.eligible>0&&!preview.hasQuota?<p className="text-xs text-warning">
        باقتك الحالية مش بتسمح بإرسال العدد ده من رسائل واتساب. راجع الاستخدام أو الباقة.
      </p>:null}
      {!preview.enabled?<p className="text-xs text-warning">
        محرك إرسال الحملات لسه غير مفعّل على السيرفر.
      </p>:null}
      {preview.eligible>60?<p className="text-xs text-warning">
        الحد الأقصى للإرسال في الحملة الواحدة 60 رقمًا. قسم القائمة لحملات أصغر.
      </p>:null}
      <div className="space-y-3 border-t border-border pt-4">
        <p className="text-xs leading-6 text-muted-foreground">
          {preview.sendRate} · من ٩ صباحًا إلى ٩ مساءً بتوقيت القاهرة.
          الإرسال التدريجي بيقلل المخاطر لكنه مش ضمان ضد قيود واتساب.
        </p>
        {!confirm?
          <Button type="button" disabled={!preview.canLaunch || busy}
            onClick={()=>setConfirm(true)}>بدء الإرسال</Button>
          :<div className="space-y-3 rounded-xl border border-primary/35 bg-primary/5 p-4">
            <p className="text-sm font-bold">تأكيد إرسال الرسالة إلى {preview.eligible.toLocaleString("ar-EG")} عميل مؤهل</p>
            <p dir="auto" className="whitespace-pre-wrap break-words rounded-xl border border-border bg-card p-3 text-xs leading-6 text-foreground">{messageText}</p>
            <p className="text-xs text-muted-foreground">بعد التأكيد الحملة هتدخل طابور الإرسال التدريجي. تقدر توقف الباقي في أي وقت.</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled={busy || !preview.canLaunch} loading={busy} onClick={()=>void submit()}>
                {busy ? "بنبدأ…" : "تأكيد بدء الإرسال"}
              </Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={()=>setConfirm(false)}>رجوع</Button>
            </div>
          </div>}
      </div>
    </>}
    {error?<p role="alert" className="rounded-xl border border-destructive/30 bg-destructive-soft px-3 py-2 text-xs text-destructive">{error}</p>:null}
  </section>;
}
