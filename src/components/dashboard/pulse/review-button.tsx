"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { PulseIntent } from "@/modules/pulse/classifier";

export function ReviewButton({conversationId,intent}:{conversationId:string;intent:PulseIntent}) {
 const [busy,setBusy]=useState(false),[error,setError]=useState("");
 const router=useRouter();
 return <div className="flex flex-col items-start gap-1">
  <button type="button" disabled={busy} onClick={async()=>{
   setBusy(true);setError("");
   try{
    const result=await fetch("/api/pulse/review",{method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({conversationId,intent})});
    if(!result.ok)throw new Error("REVIEW_FAILED");
    router.refresh();
   }catch{setError("لم يتم تسجيل المراجعة. حاول تاني.");}
   finally{setBusy(false);}
  }} className="rounded-lg border border-border px-3 py-1.5 text-[11px] font-bold text-muted-foreground transition hover:bg-surface disabled:opacity-50">
   {busy?"جارٍ الحفظ...":"تمت المراجعة"}
  </button>
  {error?<span role="alert" className="text-[11px] text-warning">{error}</span>:null}
 </div>;
}
