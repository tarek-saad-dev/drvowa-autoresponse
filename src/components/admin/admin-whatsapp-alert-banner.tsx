"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
type Counts = { total: number; stale: number };
export function AdminWhatsAppAlertBanner() {
  const [counts, setCounts] = useState<Counts | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    let stopped = false, busy = false;
    const controller = new AbortController();
    async function refresh() {
      if (stopped || busy || document.visibilityState === "hidden") return;
      busy = true;
      try {
        const r = await fetch("/api/admin/whatsapp/alerts", { cache: "no-store", signal: controller.signal });
        if (!r.ok) throw new Error("alerts unavailable");
        const value = await r.json() as Counts;
        if (!stopped) { setCounts(value); setUnavailable(false); }
      } catch { if (!stopped) setUnavailable(true); }
      finally { busy = false; }
    }
    void refresh();
    const timer = window.setInterval(() => void refresh(), 30000);
    document.addEventListener("visibilitychange", refresh);
    return () => { stopped = true; controller.abort(); window.clearInterval(timer); document.removeEventListener("visibilitychange", refresh); };
  }, []);
  if (!unavailable && (!counts || !counts.total)) return null;
  return <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-warning/30 bg-warning-soft/25 p-3 text-sm" role="status">
    <div className="text-warning">{unavailable ? "تعذر تحديث تنبيهات واتساب؛ الحالة غير مؤكدة." : `تنبيهات واتساب: ${counts?.total} حادثة مفتوحة`}
      {!unavailable && counts?.stale ? <span className="block text-xs text-muted-foreground">{counts.stale} منها تحتاج إعادة التحقق من آخر فحص.</span> : null}
    </div>
    <Link className="font-bold underline" href="/admin/whatsapp">مراجعة الأعطال</Link>
  </div>;
}
