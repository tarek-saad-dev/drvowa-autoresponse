"use client";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/**
 * Refresh authoritative Pulse attention after a manual reply from DRVO or
 * from a connected WhatsApp phone. Never marks items reviewed by itself.
 * Poll only while attention exists and the dashboard tab is visible.
 */
export function PulseAutoRefresh({activeAttentionCount=0}:{activeAttentionCount?:number}) {
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
   // Cached RSC payloads can survive browser Back even after a phone reply.
   refresh();
   const interval=activeAttentionCount>0
     ? window.setInterval(refresh,15000) : null;
   window.addEventListener("pageshow",refresh);
   window.addEventListener("focus",refresh);
   document.addEventListener("visibilitychange",refresh);
   return ()=>{
     if(interval!==null)window.clearInterval(interval);
     window.removeEventListener("pageshow",refresh);
     window.removeEventListener("focus",refresh);
     document.removeEventListener("visibilitychange",refresh);
   };
 },[router,activeAttentionCount]);
 return null;
}
