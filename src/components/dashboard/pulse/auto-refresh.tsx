"use client";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/** Re-fetch server-derived Pulse counts when returning from an Inbox conversation.
 * Never changes message state, never marks a task reviewed. No polling loop.
 */
export function PulseAutoRefresh() {
 const router=useRouter();
 const last=useRef(0);
 useEffect(()=>{
   const refresh=()=>{
     if(document.visibilityState!=="visible")return;
     const now=Date.now();
     if(now-last.current<1200)return;
     last.current=now;
     router.refresh();
   };
   // Initial client render may reuse a cached RSC payload after browser Back.
   refresh();
   window.addEventListener("pageshow",refresh);
   window.addEventListener("focus",refresh);
   document.addEventListener("visibilitychange",refresh);
   return ()=>{
     window.removeEventListener("pageshow",refresh);
     window.removeEventListener("focus",refresh);
     document.removeEventListener("visibilitychange",refresh);
   };
 },[router]);
 return null;
}
