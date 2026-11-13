"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import type { PulseReview, PulseSnapshot } from "@/modules/pulse/report";
import { ReviewChatPopup } from "./review-chat-popup";

const PREVIEW_LIMIT = 3;
const reviewKey = (item: PulseReview) => [item.kind,item.conversationId,item.intent].join(":");

function ReviewItem({item,onOpen}: {item:PulseReview;onOpen:(item:PulseReview)=>void}) {
  return (
    <article className="group flex min-w-0 items-start gap-3 px-3 py-4 transition hover:bg-surface/50 sm:px-4">
      <div className="relative shrink-0">
        <span aria-hidden="true" className="grid h-11 w-11 place-items-center rounded-2xl bg-primary/10 text-sm font-black text-primary">
          {item.name.trim().charAt(0).toUpperCase() || "؟"}
        </span>
        <span aria-hidden="true" className="absolute -bottom-1 -left-1 h-3 w-3 rounded-full border-2 border-card bg-warning" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="truncate text-sm font-black" dir="auto">{item.name}</span>
          <span className="rounded-full bg-warning/10 px-2 py-0.5 text-[10px] font-bold text-warning">
            {item.label}
          </span>
        </div>
        <p dir="auto" className="mt-1.5 line-clamp-2 break-words text-xs leading-6 text-muted-foreground">
          {item.evidence}
        </p>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <span className="text-[10px] text-muted-foreground">
            {new Date(item.at).toLocaleTimeString("ar-EG",{hour:"numeric",minute:"2-digit",timeZone:"Africa/Cairo"})}
          </span>
          <button type="button" onClick={()=>onOpen(item)}
            aria-label={"افتح محادثة "+item.name}
            className="inline-flex min-h-9 items-center rounded-xl bg-primary/10 px-3 py-2 text-xs font-black text-primary transition hover:bg-primary hover:text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
            رد على العميل <span aria-hidden="true" className="mr-2">↗</span>
          </button>
        </div>
      </div>
    </article>
  );
}

export function PulseReviewCenter({
  data, periodLabel, allReviews=false,
}: {
  data:PulseSnapshot|null;businessId:string;periodLabel:string;allReviews?:boolean;
}) {
  const router=useRouter();
  const [open,setOpen]=useState(allReviews);
  const [activeChat,setActiveChat]=useState<PulseReview|null>(null);
  // The local update is immediate, but only hides a specific request version.
  // A new customer message with a newer attention timestamp can reappear.
  const [handled,setHandled]=useState<Record<string,string>>({});
  const openButtonRef=useRef<HTMLButtonElement>(null);
  const closeButtonRef=useRef<HTMLButtonElement>(null);
  const dialogRef=useRef<HTMLDivElement>(null);
  const [manualCount,setManualCount]=useState(0);
  const handling=(data?.handlingFollowups??0)+(data?.handlingSignals??0);
  const all=data?.reviews??[];
  const reviews=all.filter(item=>handled[reviewKey(item)]!==item.at);
  const suppressed=all.length-reviews.length;
  const actionable=Math.max(0,(data?.needsAttentionFollowups??0)+(data?.pendingSignals??0)-suppressed);
  const showMore=reviews.length>PREVIEW_LIMIT||actionable>PREVIEW_LIMIT;

  const markHandled=useCallback((item:PulseReview)=>{
    setHandled(previous=>({...previous,[reviewKey(item)]:item.at}));
    setManualCount(previous=>previous+1);
    router.refresh();
  },[router]);
  const openChat=useCallback((item:PulseReview)=>{
    setOpen(false);
    setActiveChat(item);
  },[]);

  // Server state is still authoritative. Polling is done by PulseAutoRefresh.
  // Always show a reactivated request again if the backend attention timestamp changed.
  useEffect(()=>{
    if(!open||activeChat)return;
    const before=document.body.style.overflow;
    document.body.style.overflow="hidden";
    closeButtonRef.current?.focus();
    const escape=(event:KeyboardEvent)=>{
      if(event.key==="Escape"){event.preventDefault();setOpen(false);}
    };
    window.addEventListener("keydown",escape);
    return ()=>{
      document.body.style.overflow=before;
      window.removeEventListener("keydown",escape);
      openButtonRef.current?.focus();
    };
  },[open,activeChat]);

  const trapFocus=(event:ReactKeyboardEvent<HTMLDivElement>)=>{
    if(event.key!=="Tab"||!dialogRef.current)return;
    const elements=Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
      'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
    ));
    if(!elements.length)return;
    if(event.shiftKey&&document.activeElement===elements[0]){
      event.preventDefault();elements[elements.length-1].focus();
    }else if(!event.shiftKey&&document.activeElement===elements[elements.length-1]){
      event.preventDefault();elements[0].focus();
    }
  };

  return (
    <section aria-label="مركز الطلبات"
      className="min-w-0 overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border/65 p-4 sm:p-5">
        <div className="min-w-0">
          <h2 className="font-display text-base font-bold sm:text-lg">الطلبات اللي تحتاج مراجعة</h2>
          <p className="mt-1 text-xs leading-6 text-muted-foreground">
            محتاجة رد من الفريق خلال {periodLabel}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span aria-label={"عدد الطلبات "+actionable} className="grid h-9 min-w-9 place-items-center rounded-xl bg-warning/10 px-2 text-base font-black tabular-nums text-warning">
            {data?actionable.toLocaleString("ar-EG"):"—"}
          </span>
          {showMore ? <button ref={openButtonRef} type="button" onClick={()=>setOpen(true)}
            className="rounded-lg px-2 py-2 text-xs font-black text-primary hover:bg-primary/10">
            عرض الكل
          </button>:null}
        </div>
      </header>
      {handling>0 ? <p className="border-b border-border/60 px-4 py-2.5 text-[11px] text-muted-foreground sm:px-5">
        <span className="font-bold">{handling.toLocaleString("ar-EG")} متابعة جارية</span> · مش ضمن الطلبات المنتظرة للرد
      </p>:null}
      {!data ? <p className="p-5 text-sm text-muted-foreground">تعذر تحميل الطلبات. جرّب تحديث الصفحة.</p>
        :reviews.length===0 ? <div className="px-5 py-10 text-center">
          <span aria-hidden="true" className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-success/10 text-xl text-success">✓</span>
          <h3 className="mt-3 text-sm font-black">مفيش طلبات مستنية رد خلال {periodLabel}</h3>
          <p className="mt-2 text-xs text-muted-foreground">الردود اللي اتسجلت من DRVO أو واتساب بتتنقل تلقائيًا للمتابعة الجارية.</p>
        </div> : <div className="divide-y divide-border/65">
          {reviews.slice(0,PREVIEW_LIMIT).map(item=>
            <ReviewItem key={reviewKey(item)} item={item} onOpen={openChat}/>
          )}
        </div>}
      {showMore ? <div className="border-t border-border/65 px-4 py-3">
        <button type="button" onClick={()=>setOpen(true)}
          className="w-full rounded-xl bg-surface px-3 py-2.5 text-xs font-bold text-primary transition-colors hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
          عرض كل الطلبات ({actionable.toLocaleString("ar-EG")})
        </button>
      </div>:null}
      {manualCount>0 ? <span className="sr-only" aria-live="polite">تم تحديث {manualCount} متابعة</span>:null}

      {open ? <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-3 backdrop-blur-[2px] sm:p-6"
        onMouseDown={event=>{if(event.target===event.currentTarget)setOpen(false);}}>
        <div ref={dialogRef} dir="rtl" role="dialog" aria-modal="true"
          aria-label="كل الطلبات اللي تحتاج مراجعة" onKeyDown={trapFocus}
          className="flex max-h-[90dvh] w-full max-w-2xl flex-col overflow-hidden rounded-[24px] bg-card shadow-2xl">
          <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
            <div>
              <h2 className="text-base font-black">كل الطلبات اللي تحتاج مراجعة</h2>
              <p className="mt-1 text-xs text-muted-foreground">{actionable.toLocaleString("ar-EG")} طلب خلال {periodLabel}</p>
            </div>
            <button ref={closeButtonRef} type="button" aria-label="إغلاق" onClick={()=>setOpen(false)}
              className="grid h-9 w-9 place-items-center rounded-full bg-surface text-xl">×</button>
          </header>
          <div className="min-h-0 flex-1 divide-y divide-border/60 overflow-y-auto">
            {reviews.map(item=><ReviewItem key={reviewKey(item)} item={item} onOpen={openChat}/>)}
            {actionable>reviews.length?<p className="p-4 text-xs text-muted-foreground">
              ظاهر أحدث {reviews.length.toLocaleString("ar-EG")} طلب. باقي المحادثات في صندوق المحادثات.
            </p>:null}
          </div>
        </div>
      </div>:null}

      {activeChat ? <ReviewChatPopup key={reviewKey(activeChat)} item={activeChat}
        onClose={()=>setActiveChat(null)}
        onHandled={markHandled}
        onResolved={markHandled}
      />:null}
    </section>
  );
}
