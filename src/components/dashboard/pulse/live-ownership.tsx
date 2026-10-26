"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { HumanOwnershipSnapshot } from "@/modules/ai/human-ownership";

export function LiveOwnership({initial,businessId}:{initial:HumanOwnershipSnapshot|null;businessId:string}) {
  const [state,setState]=useState(initial);
  useEffect(()=>{
    let active=true;
    const controller=new AbortController();
    const poll=async()=>{
      if(document.visibilityState!=="visible")return;
      try{
        const r=await fetch("/api/pulse/ownership",{cache:"no-store",credentials:"same-origin",signal:controller.signal});
        if(!r.ok)return;
        const body=await r.json() as HumanOwnershipSnapshot;
        if(active&&Number.isInteger(body.withTeam)&&Array.isArray(body.chats))setState(body);
      }catch{/* Show last known information. No false zero while offline. */}
    };
    const timer=window.setInterval(()=>void poll(),20_000);
    const onFocus=()=>void poll();
    document.addEventListener("visibilitychange",onFocus);
    window.addEventListener("focus",onFocus);
    void poll();
    return ()=>{
      active=false;
      controller.abort();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange",onFocus);
      window.removeEventListener("focus",onFocus);
    };
  },[]);
  const href="/dashboard/inbox?filter=HUMAN";
  return <section aria-label="حالة المحادثات مع الفريق" className="rounded-[22px] border border-border bg-card p-4 sm:p-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="text-sm font-black">المحادثات مع الفريق</h2>
        <p className="mt-1 text-[11px] text-muted-foreground">الحالة الحالية لكل المحادثات، مش بس حالات التصعيد أو محادثات اليوم</p>
      </div>
      <Link href={href} className="text-xs font-bold text-primary hover:underline">عرض المحادثات ←</Link>
    </div>
    {state===null?<p className="mt-4 text-xs text-muted-foreground">حالة استلام الفريق غير متاحة مؤقتًا</p>:
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Link href={href} className="rounded-xl bg-surface px-4 py-3 text-sm font-bold">
          مع الفريق <span className="ms-2 text-xl tabular-nums">{state.withTeam.toLocaleString("en-US")}</span>
        </Link>
        <Link href={href} className={"rounded-xl px-4 py-3 text-sm font-bold "+(state.awaitingTeamReply?"bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200":"bg-surface")}>
          مستنيين رد الفريق <span className="ms-2 text-xl tabular-nums">{state.awaitingTeamReply.toLocaleString("en-US")}</span>
        </Link>
        <span className="text-xs text-muted-foreground">مع الفريق بدون رد جديد: {state.waitingCustomer.toLocaleString("en-US")}</span>
      </div>}
    {state&&state.chats.length>0?<div className="mt-3 grid min-w-0 gap-2 md:grid-cols-2">
      {state.chats.slice(0,4).map(chat=><Link key={chat.conversationId}
        href={"/dashboard/inbox?businessId="+encodeURIComponent(businessId)+"&conversationId="+encodeURIComponent(chat.conversationId)}
        className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-border/65 px-3 py-3 hover:bg-surface">
        <span className="min-w-0 truncate text-xs font-bold">{chat.name}</span>
        <span className={"shrink-0 text-[11px] "+(chat.waitingForTeam?"font-bold text-amber-700 dark:text-amber-300":"text-muted-foreground")}>
          {chat.waitingForTeam?"محتاج رد":"جاري التعامل"}
        </span>
      </Link>)}
    </div>:null}
  </section>;
}
