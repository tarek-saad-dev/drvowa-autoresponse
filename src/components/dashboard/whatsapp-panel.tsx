"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { mapUserFacingError } from "@/lib/ui/user-errors";

type UiState =
  | "NOT_CONNECTED"
  | "STARTING"
  | "QR_REQUIRED"
  | "CONNECTING"
  | "READY"
  | "DISCONNECTED"
  | "LOGGED_OUT"
  | "ERROR"
  | "RUNTIME_DISABLED";

type InboundDeliveryPayload = {
  running: boolean;
  pending: number;
  quarantined: number;
  lastDeliveryAt: string | null;
  lastErrorCode: string | null;
  health: "healthy" | "degraded" | "unknown";
};

type ConnectionPayload = {
  uiState: UiState;
  message?: string | null;
  connection: {
    channelConnectionId: string;
    status: string;
    isActive: boolean;
    displayName?: string | null;
    maskedPhone?: string | null;
  } | null;
  runtime: {
    state: string | null;
    ready: boolean;
    qrAvailable: boolean;
    lastErrorCode: string | null;
    inboundDelivery?: InboundDeliveryPayload | null;
  } | null;
  /** Customer-safe only — never includes Baileys technical counters. */
  compatibility?: {
    status: "UNKNOWN" | "HEALTHY" | "SUSPECT" | "DEGRADED_CRYPTO" | null;
    messageAr: string | null;
  } | null;
};

const ACTIVE_POLL_STATES: UiState[] = [
  "STARTING",
  "QR_REQUIRED",
  "CONNECTING",
];

function stateLabel(state: UiState): string {
  switch (state) {
    case "NOT_CONNECTED":
      return "غير مربوط";
    case "STARTING":
      return "جاري البدء";
    case "QR_REQUIRED":
      return "امسح رمز QR";
    case "CONNECTING":
      return "جارٍ الاتصال";
    case "READY":
      return "متصل";
    case "DISCONNECTED":
      return "انقطع الاتصال";
    case "LOGGED_OUT":
      return "انتهت الجلسة";
    case "RUNTIME_DISABLED":
      return "الربط غير متاح مؤقتاً";
    case "ERROR":
      return "خطأ في الاتصال";
    default:
      return "حالة غير معروفة";
  }
}

function stateExplanation(
  state: UiState,
  compatibilityMessageAr?: string | null,
): string {
  if (state === "READY" && compatibilityMessageAr) {
    return compatibilityMessageAr;
  }
  switch (state) {
    case "NOT_CONNECTED":
      return "لم يتم ربط رقم واتساب بعد لهذه المساحة.";
    case "STARTING":
      return "نجهّز الاتصال. انتظر لحظات دون إغلاق الصفحة.";
    case "QR_REQUIRED":
      return "امسح الرمز من هاتفك لإكمال الربط. الرمز يتجدد تلقائياً إذا انتهت صلاحيته.";
    case "CONNECTING":
      return "تم مسح الرمز وجارٍ تأكيد الاتصال.";
    case "READY":
      return "واتساب متصل وجاهز لاستقبال وإرسال الرسائل.";
    case "DISCONNECTED":
      return "انقطع الاتصال. يمكنك إعادة الربط بأمان.";
    case "LOGGED_OUT":
      return "انتهت جلسة واتساب من الهاتف. يلزم ربط جديد يدوياً.";
    case "RUNTIME_DISABLED":
      return "الربط غير متاح مؤقتاً. بيانات مساحتك محفوظة.";
    case "ERROR":
      return "حدث خطأ أثناء الاتصال. يمكنك المحاولة مرة أخرى.";
    default:
      return "";
  }
}

function inboundErrorLabelAr(code: string | null | undefined): string | null {
  if (!code?.trim()) return null;
  switch (code.trim()) {
    case "CONFIG_MISSING":
      return "إعدادات استقبال الرسائل غير مكتملة";
    case "AUTH_CONFIG":
      return "مشكلة مصادقة مع خادم الاستقبال";
    case "MAPPING_CONFIG":
      return "ربط رقم واتساب غير متطابق";
    case "NETWORK_ERROR":
      return "مشكلة شبكة مؤقتة أثناء التسليم";
    default:
      return null;
  }
}

function formatRelativeAr(iso: string | null | undefined, nowMs: number): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const diffSec = Math.max(0, Math.floor((nowMs - t) / 1000));
  if (diffSec < 60) return "الآن";
  const mins = Math.floor(diffSec / 60);
  if (mins < 60) return `منذ ${mins} دقيقة`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `منذ ${hours} ساعة`;
  const days = Math.floor(hours / 24);
  return `منذ ${days} يوم`;
}

function badgeVariant(
  state: UiState,
  inboundDegraded: boolean,
): "default" | "success" | "warning" | "muted" {
  if (state === "READY" && inboundDegraded) return "warning";
  if (state === "READY") return "success";
  if (state === "QR_REQUIRED" || state === "STARTING" || state === "CONNECTING") {
    return "warning";
  }
  if (state === "ERROR" || state === "LOGGED_OUT") return "muted";
  return "default";
}

function sanitizePanelMessage(message: string | null | undefined): string | null {
  if (!message?.trim()) return null;
  return mapUserFacingError({ error: message }, message);
}

export function WhatsAppConnectionPanel({
  initial,
}: {
  initial: ConnectionPayload;
}) {
  const [view, setView] = useState<ConnectionPayload>(initial);
  const [qrImageDataUrl, setQrImageDataUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const refreshStatus = useCallback(async () => {
    const res = await fetch("/api/channels/whatsapp/status", {
      cache: "no-store",
    });
    const data = (await res.json()) as ConnectionPayload & {
      error?: string;
      code?: string;
    };
    if (!res.ok) {
      throw new Error(
        mapUserFacingError(data, "تعذر تحديث حالة واتساب."),
      );
    }
    if (mounted.current) {
      setView(data);
      if (data.uiState === "READY") {
        setQrImageDataUrl(null);
      }
    }
    return data;
  }, []);

  const refreshQr = useCallback(async () => {
    const res = await fetch("/api/channels/whatsapp/qr", { cache: "no-store" });
    const data = (await res.json()) as {
      uiState: UiState;
      qrImageDataUrl?: string | null;
      qrAvailable?: boolean;
      error?: string;
      code?: string;
      message?: string | null;
    };
    if (!res.ok) {
      throw new Error(mapUserFacingError(data, "تعذر جلب رمز QR."));
    }
    if (!mounted.current) return data;
    if (data.uiState === "READY") {
      setQrImageDataUrl(null);
      setView((prev) => ({ ...prev, uiState: "READY" }));
      return data;
    }
    if (data.qrImageDataUrl) {
      setQrImageDataUrl(data.qrImageDataUrl);
    }
    setView((prev) => ({
      ...prev,
      uiState: data.uiState,
      message: data.message ?? prev.message,
    }));
    return data;
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const status = await refreshStatus();
        if (status.uiState === "QR_REQUIRED") {
          await refreshQr();
        }
      } catch {
        // Keep SSR initial state if refresh fails.
      }
    })();
  }, [refreshStatus, refreshQr]);

  useEffect(() => {
    if (!ACTIVE_POLL_STATES.includes(view.uiState)) {
      return;
    }
    const id = window.setInterval(() => {
      void (async () => {
        try {
          const status = await refreshStatus();
          if (status.uiState === "QR_REQUIRED") {
            await refreshQr();
          }
          if (status.uiState === "READY") {
            setQrImageDataUrl(null);
          }
        } catch {
          // Keep UI stable; next poll retries.
        }
      })();
    }, 1500);
    return () => window.clearInterval(id);
  }, [view.uiState, refreshStatus, refreshQr]);

  async function connect() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/channels/whatsapp/connect", {
        method: "POST",
      });
      const data = (await res.json()) as ConnectionPayload & {
        error?: string;
        code?: string;
      };
      if (!res.ok && !data.uiState) {
        throw new Error(mapUserFacingError(data, "تعذر بدء الربط."));
      }
      setView(data.uiState ? data : { ...view, ...data });
      if (data.uiState === "QR_REQUIRED" || data.runtime?.qrAvailable) {
        await refreshQr();
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? mapUserFacingError({ error: err.message }, "تعذر بدء الربط.")
          : "تعذر بدء الربط.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/channels/whatsapp/disconnect", {
        method: "POST",
      });
      const data = (await res.json()) as ConnectionPayload & {
        error?: string;
        code?: string;
      };
      if (!res.ok) {
        throw new Error(mapUserFacingError(data, "تعذر إيقاف الاتصال."));
      }
      setView(data);
      setQrImageDataUrl(null);
    } catch (err) {
      setError(
        err instanceof Error
          ? mapUserFacingError({ error: err.message }, "تعذر إيقاف الاتصال.")
          : "تعذر إيقاف الاتصال.",
      );
    } finally {
      setBusy(false);
    }
  }

  const state = view.uiState;
  const panelMessage = sanitizePanelMessage(view.message);
  const inbound = view.runtime?.inboundDelivery ?? null;
  const socketConnected = state === "READY";
  const inboundDegraded = socketConnected && inbound?.health === "degraded";
  const inboundLabel = (() => {
    if (!socketConnected) return null;
    if (!inbound || inbound.health === "unknown") return "يعمل";
    return inbound.health === "healthy" ? "يعمل" : "توجد مشكلة";
  })();
  const inboundDetail = inboundDegraded
    ? inboundErrorLabelAr(inbound?.lastErrorCode)
    : null;
  const lastDeliveryRelative = formatRelativeAr(
    inbound?.lastDeliveryAt ?? null,
    nowMs,
  );
  const compatibilityMessageAr = view.compatibility?.messageAr ?? null;
  const explanation = stateExplanation(state, compatibilityMessageAr);

  return (
    <div className="space-y-5">
      <section
        className={`rounded-[28px] border p-5 shadow-sm sm:p-6 ${
          state === "READY" && !inboundDegraded
            ? "border-success/20 bg-success-soft/35"
            : state === "READY"
              ? "border-warning/20 bg-warning-soft/35"
              : "border-border bg-card"
        }`}
      >
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={badgeVariant(state, inboundDegraded)}>
                {stateLabel(state)}
              </Badge>
              {view.connection?.maskedPhone ? (
                <span className="text-xs font-bold text-muted-foreground" dir="ltr">
                  {view.connection.maskedPhone}
                </span>
              ) : null}
            </div>
            <h2 className="mt-3 text-2xl font-black tracking-[-0.03em]">
              {state === "READY"
                ? inboundDegraded
                  ? "واتساب متصل، بس محتاج مراجعة"
                  : "واتساب شغال وجاهز"
                : state === "QR_REQUIRED"
                  ? "امسح QR من موبايلك"
                  : state === "CONNECTING" || state === "STARTING"
                    ? "بنكمل الربط"
                    : "وصّل رقم واتساب"}
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-7 text-muted-foreground">
              {inboundDegraded && !compatibilityMessageAr
                ? "الاتصال موجود، لكن استقبال الرسائل محتاج مراجعة بسيطة."
                : explanation}
            </p>
          </div>

          <div className="grid h-20 w-20 shrink-0 place-items-center rounded-[24px] border border-white/70 bg-white/80 text-3xl shadow-sm">
            {state === "READY" ? "✓" : state === "QR_REQUIRED" ? "▦" : "◉"}
          </div>
        </div>
      </section>

      {error ? (
        <Alert variant="error" aria-live="polite">
          {error}
        </Alert>
      ) : null}
      {panelMessage && state !== "READY" ? (
        <Alert variant={state === "RUNTIME_DISABLED" ? "warning" : "error"}>
          {panelMessage}
        </Alert>
      ) : null}

      {state === "NOT_CONNECTED" || state === "DISCONNECTED" ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">الربط بياخد أقل من دقيقة</CardTitle>
            <CardDescription>
              مش محتاج API أو إعدادات تقنية. كل اللي هتعمله إنك تمسح QR من واتساب.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                ["1", "افتح واتساب", "من موبايل رقم البيزنس"],
                ["2", "الأجهزة المرتبطة", "اختار ربط جهاز جديد"],
                ["3", "امسح QR", "وخلي الصفحة مفتوحة لحظات"],
              ].map(([number, title, description]) => (
                <div key={number} className="rounded-2xl border border-border bg-surface/45 p-4">
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-primary text-xs font-black text-primary-foreground">
                    {number}
                  </span>
                  <p className="mt-3 text-sm font-black">{title}</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
                </div>
              ))}
            </div>
            <Button
              size="lg"
              className="mt-5 w-full sm:w-auto sm:min-w-44"
              onClick={() => void connect()}
              disabled={busy}
            >
              {busy
                ? "بنجهز الربط..."
                : state === "DISCONNECTED"
                  ? "اربط واتساب تاني"
                  : "ابدأ ربط واتساب"}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {state === "STARTING" || state === "CONNECTING" ? (
        <Card>
          <CardContent className="py-10 text-center">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-2xl text-primary">
              …
            </div>
            <p className="mt-4 text-lg font-black">ثواني وبنكون جاهزين</p>
            <p className="mt-2 text-sm text-muted-foreground">{explanation}</p>
          </CardContent>
        </Card>
      ) : null}

      {state === "QR_REQUIRED" ? (
        <Card className="overflow-hidden">
          <CardContent className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <p className="text-xs font-black text-primary">الخطوة الأخيرة</p>
              <h3 className="mt-1 text-xl font-black">امسح الكود من واتساب</h3>
              <div className="mt-4 space-y-2 text-sm leading-7 text-muted-foreground">
                <p>1. افتح واتساب على الموبايل.</p>
                <p>2. ادخل على الأجهزة المرتبطة.</p>
                <p>3. اضغط ربط جهاز ووجّه الكاميرا للكود.</p>
              </div>
              <p className="mt-4 text-xs leading-5 text-muted-foreground">
                لو الكود انتهت صلاحيته هيتجدد تلقائيًا. متقفلش الصفحة أثناء المسح.
              </p>
              <Button
                variant="ghost"
                className="mt-4"
                onClick={() => void disconnect()}
                disabled={busy}
              >
                إلغاء الربط
              </Button>
            </div>

            <div className="rounded-[26px] border border-border bg-white p-4 shadow-lg">
              {qrImageDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={qrImageDataUrl}
                  alt="رمز QR لربط واتساب"
                  className="h-64 w-64 rounded-2xl bg-white"
                />
              ) : (
                <div className="grid h-64 w-64 place-items-center rounded-2xl bg-surface text-sm font-bold text-muted-foreground">
                  بنجهز QR…
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {state === "READY" ? (
        <div className="grid gap-4 lg:grid-cols-[1fr_.7fr]">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">حالة الاستقبال</CardTitle>
              <CardDescription>
                أهم حاجة تعرفها: هل الرسائل داخلة للسيستم بشكل طبيعي؟
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-surface/45 p-4">
                <div>
                  <p className="text-xs font-bold text-muted-foreground">استقبال الرسائل</p>
                  <p className="mt-1 text-sm font-black">
                    {inboundDegraded ? "محتاج مراجعة" : "شغال"}
                  </p>
                </div>
                <span className={`h-3 w-3 rounded-full ${inboundDegraded ? "bg-warning" : "bg-success"}`} />
              </div>

              {lastDeliveryRelative ? (
                <div className="rounded-2xl border border-border bg-surface/45 p-4">
                  <p className="text-xs font-bold text-muted-foreground">آخر رسالة وصلت</p>
                  <p className="mt-1 text-sm font-black">{lastDeliveryRelative}</p>
                </div>
              ) : null}

              {inboundDegraded ? (
                <Alert variant="warning">
                  استقبال الرسائل محتاج مراجعة.
                  {inboundDetail ? ` ${inboundDetail}.` : null}
                </Alert>
              ) : (
                <Alert variant="success">
                  كل شيء جاهز — الرسائل الجديدة هتظهر في المحادثات تلقائيًا.
                </Alert>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">إدارة الاتصال</CardTitle>
              <CardDescription>
                مش محتاج تعمل حاجة طول ما الحالة فوق شغالة.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                variant="outline"
                onClick={() => void disconnect()}
                disabled={busy}
                className="w-full"
              >
                {busy ? "جاري التنفيذ..." : "قطع الاتصال"}
              </Button>
              <p className="mt-3 text-center text-[11px] leading-5 text-muted-foreground">
                استخدمها فقط لو ناوي تربط رقم مختلف أو تعيد الجلسة.
              </p>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {state === "LOGGED_OUT" ? (
        <Card>
          <CardContent className="space-y-4 py-6">
            <Alert variant="error">{explanation}</Alert>
            <Button onClick={() => void connect()} disabled={busy}>
              اربط واتساب من جديد
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {state === "RUNTIME_DISABLED" ? (
        <Alert variant="warning">{explanation}</Alert>
      ) : null}

      {state === "ERROR" ? (
        <Card>
          <CardContent className="space-y-4 py-6">
            <Alert variant="error">{explanation}</Alert>
            <Button onClick={() => void connect()} disabled={busy}>
              جرّب الربط تاني
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
