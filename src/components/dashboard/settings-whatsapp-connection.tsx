"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { mapUserFacingError } from "@/lib/ui/user-errors";

type RuntimeState = "NOT_CONNECTED" | "STARTING" | "QR_REQUIRED" | "CONNECTING"
  | "READY" | "DISCONNECTED" | "LOGGED_OUT" | "ERROR" | "RUNTIME_DISABLED";
type ConnectionView = {
  uiState: RuntimeState;
  connection?: { maskedPhone?: string | null } | null;
  runtime?: {
    inboundDelivery?: { health?: "healthy" | "degraded" | "unknown" } | null;
  } | null;
  code?: string;
  error?: string;
  message?: string | null;
};
type QrView = { qrImageDataUrl?: string | null; uiState?: RuntimeState; error?: string; code?: string };

export function SettingsWhatsAppConnection({ openInitially = false }: { openInitially?: boolean }) {
  const [view, setView] = useState<ConnectionView | null>(null);
  const [expanded, setExpanded] = useState(openInitially);
  const [qr, setQr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);
  const lock = useRef(false);
  const shouldPoll = view?.uiState === "QR_REQUIRED" || view?.uiState === "STARTING" || view?.uiState === "CONNECTING";

  const refresh = useCallback(async () => {
    if (lock.current) return;
    lock.current = true;
    try {
      const res = await fetch("/api/channels/whatsapp/status", { cache: "no-store" });
      const data = (await res.json().catch(() => ({}))) as ConnectionView;
      if (!res.ok || !data.uiState) throw new Error(mapUserFacingError(data, "تعذر التحقق من اتصال واتساب."));
      if (alive.current) {
        setView(data);
        setError(null);
        if (data.uiState === "READY") { setQr(null); setExpanded(false); }
      }
    } catch {
      if (alive.current) {
        setError("مش قادرين نتحقق من حالة واتساب حاليًا.");
        // Do not display previous READY as a confirmed online state when verification fails.
        setView(null);
      }
    } finally {
      lock.current = false;
      if (alive.current) setLoading(false);
    }
  }, []);

  const refreshQr = useCallback(async () => {
    const res = await fetch("/api/channels/whatsapp/qr", { cache: "no-store" });
    const data = (await res.json().catch(() => ({}))) as QrView;
    if (!res.ok) throw new Error(mapUserFacingError(data, "تعذر تحميل QR."));
    if (!alive.current) return;
    if (data.uiState === "READY") {
      setQr(null);
      await refresh();
    } else if (data.qrImageDataUrl) {
      setQr(data.qrImageDataUrl);
    }
  }, [refresh]);

  useEffect(() => {
    alive.current = true;
    void refresh();
    return () => { alive.current = false; };
  }, [refresh]);

  useEffect(() => {
    // Short polling only while pairing. Slow health refresh while connected, with no live status fabrication.
    const timer = window.setInterval(() => {
      void refresh();
      if (shouldPoll) void refreshQr().catch(() => {});
    }, shouldPoll ? 2500 : 20_000);
    return () => window.clearInterval(timer);
  }, [refresh, refreshQr, shouldPoll]);

  async function connect() {
    setError(null); setBusy(true); setExpanded(true);
    try {
      const res = await fetch("/api/channels/whatsapp/connect", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as ConnectionView;
      if (!res.ok && !data.uiState) throw new Error(mapUserFacingError(data, "تعذر بدء ربط واتساب."));
      if (alive.current) setView(data);
      if (data.uiState === "QR_REQUIRED" || data.uiState === "STARTING" || data.uiState === "CONNECTING") {
        await refreshQr();
      } else if (data.uiState === "READY") await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر بدء ربط واتساب.");
    } finally { if (alive.current) setBusy(false); }
  }

  async function disconnect() {
    if (!window.confirm("عايز تفصل رقم واتساب ده؟ البوت مش هيستقبل رسائل جديدة لحد ما توصّله تاني.")) return;
    setError(null); setBusy(true);
    try {
      const res = await fetch("/api/channels/whatsapp/disconnect", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as ConnectionView;
      if (!res.ok) throw new Error(mapUserFacingError(data, "تعذر قطع الاتصال."));
      if (alive.current) { setView(data); setQr(null); setExpanded(false); }
    } catch (e) { setError(e instanceof Error ? e.message : "تعذر قطع الاتصال."); }
    finally { if (alive.current) setBusy(false); }
  }

  const ready = view?.uiState === "READY";
  const degraded = ready && view?.runtime?.inboundDelivery?.health === "degraded";
  const connecting = view?.uiState === "CONNECTING" || view?.uiState === "STARTING";
  const pairing = view?.uiState === "QR_REQUIRED";
  const hasError = Boolean(error);
  const heading = hasError || loading || !view ? "جاري التحقق من واتساب" :
    ready ? (degraded ? "واتساب متصل، والاستقبال محتاج مراجعة" : "واتساب متصل") :
    pairing ? "امسح QR لربط واتساب" :
    connecting ? "جاري ربط واتساب" : "واتساب غير متصل";
  return (
    <section className="rounded-2xl border border-border bg-card px-4 py-3 sm:px-5" aria-label="اتصال واتساب">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span aria-hidden className={"h-2.5 w-2.5 shrink-0 rounded-full " +
            (ready && !degraded && !hasError ? "bg-success" : "bg-warning")} />
          <div>
            <h2 className="text-sm font-black">{heading}</h2>
            {view?.connection?.maskedPhone && ready ? (
              <p dir="ltr" className="mt-1 text-xs text-muted-foreground">{view.connection.maskedPhone}</p>
            ) : null}
            {degraded ? <p className="mt-1 text-xs text-warning">في مشكلة في استقبال الرسائل؛ الاتصال وحده مش ضمان وصولها.</p> : null}
          </div>
        </div>
        {!loading && !hasError && ready ? (
          <Button type="button" variant="outline" size="sm" onClick={() => void disconnect()} disabled={busy}>قطع الاتصال</Button>
        ) : !loading && !hasError && !connecting && !pairing && view?.uiState !== "RUNTIME_DISABLED" ? (
          <Button type="button" size="sm" onClick={() => void connect()} disabled={busy}>{busy ? "جاري الربط..." : "ربط واتساب"}</Button>
        ) : !loading && (hasError || view?.uiState === "RUNTIME_DISABLED") ? (
          <Button type="button" variant="outline" size="sm" onClick={() => void refresh()} disabled={busy}>إعادة التحقق</Button>
        ) : null}
      </div>
      {connecting || pairing ? (
        <div className="mt-4 border-t border-border pt-4">
          <p className="text-xs text-muted-foreground">{pairing ? "من واتساب: الأجهزة المرتبطة ← ربط جهاز، وبعدها امسح الكود." : "بنتأكد من الاتصال..."}</p>
          {pairing && qr ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qr} alt="QR ربط واتساب" className="mx-auto mt-3 h-56 w-56 rounded-xl border bg-white p-2" />
          ) : pairing ? <p className="mt-3 text-sm text-muted-foreground">بنجهز رمز QR…</p> : null}
          <button type="button" className="mt-3 text-xs text-muted-foreground underline hover:text-foreground"
            onClick={() => setExpanded(!expanded)}> {expanded ? "إخفاء تفاصيل الربط" : "تفاصيل الربط"} </button>
          {expanded ? <p className="mt-2 text-xs text-muted-foreground">سيب الصفحة مفتوحة أثناء الربط. الرمز بيتجدد تلقائيًا.</p> : null}
        </div>
      ) : null}
      {error ? <div className="mt-3"><Alert variant="warning">{error}</Alert></div> : null}
    </section>
  );
}
