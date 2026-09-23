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

function stateExplanation(state: UiState): string {
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

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>اتصال واتساب</CardTitle>
            <Badge variant={badgeVariant(state, inboundDegraded)}>
              {stateLabel(state)}
            </Badge>
          </div>
          <CardDescription>
            {inboundDegraded
              ? "واتساب متصل، لكن استقبال الرسائل يحتاج مراجعة."
              : stateExplanation(state)}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
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

          {view.connection?.maskedPhone ? (
            <div className="space-y-1 text-sm" dir="rtl">
              <p className="text-muted-foreground">رقم واتساب المتصل</p>
              <p className="font-medium tracking-wide" dir="ltr">
                {view.connection.maskedPhone}
              </p>
            </div>
          ) : null}

          {state === "READY" || state === "DISCONNECTED" || state === "LOGGED_OUT" ? (
            <div className="space-y-2 text-sm" dir="rtl">
              <p>
                اتصال واتساب:{" "}
                <span
                  className={
                    socketConnected
                      ? "font-medium text-emerald-700"
                      : "font-medium text-amber-800"
                  }
                >
                  {socketConnected ? "متصل" : "غير متصل"}
                </span>
              </p>
              {inboundLabel ? (
                <p>
                  استقبال الرسائل:{" "}
                  <span
                    className={
                      inboundDegraded
                        ? "font-medium text-amber-700"
                        : "font-medium text-emerald-700"
                    }
                  >
                    {inboundLabel}
                  </span>
                </p>
              ) : null}
              {inboundDegraded ? (
                <Alert variant="warning">
                  واتساب متصل، لكن استقبال الرسائل يحتاج مراجعة.
                  {inboundDetail ? ` ${inboundDetail}.` : null}
                </Alert>
              ) : null}
              {socketConnected && lastDeliveryRelative ? (
                <p className="text-muted-foreground">
                  آخر رسالة مستلمة: {lastDeliveryRelative}
                </p>
              ) : null}
            </div>
          ) : null}

          {state === "NOT_CONNECTED" || state === "DISCONNECTED" ? (
            <div className="space-y-3">
              <Button onClick={() => void connect()} disabled={busy}>
                {busy
                  ? "جاري الربط…"
                  : state === "DISCONNECTED"
                    ? "إعادة ربط واتساب"
                    : "ربط واتساب"}
              </Button>
            </div>
          ) : null}

          {state === "STARTING" || state === "CONNECTING" ? (
            <p className="text-sm text-muted-foreground">{stateExplanation(state)}</p>
          ) : null}

          {state === "QR_REQUIRED" ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                افتح واتساب على هاتفك ← الأجهزة المرتبطة ← ربط جهاز، ثم امسح الرمز.
                إذا انتهت صلاحية الرمز سيظهر رمز جديد تلقائياً — لا تغلق هذه
                الصفحة أثناء المسح.
              </p>
              {qrImageDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={qrImageDataUrl}
                  alt="رمز QR لربط واتساب"
                  className="mx-auto h-64 w-64 rounded-lg border border-border bg-white p-3"
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  جاري تحميل رمز QR…
                </p>
              )}
              <Button
                variant="outline"
                onClick={() => void disconnect()}
                disabled={busy}
              >
                إلغاء
              </Button>
            </div>
          ) : null}

          {state === "READY" ? (
            <div className="space-y-3">
              {!inboundDegraded ? (
                <Alert variant="success">واتساب متصل وجاهز لهذه المساحة.</Alert>
              ) : null}
              <Button
                variant="outline"
                onClick={() => void disconnect()}
                disabled={busy}
              >
                قطع الاتصال
              </Button>
            </div>
          ) : null}

          {state === "LOGGED_OUT" ? (
            <div className="space-y-3">
              <Alert variant="error">{stateExplanation(state)}</Alert>
              <Button onClick={() => void connect()} disabled={busy}>
                إعادة ربط واتساب
              </Button>
            </div>
          ) : null}

          {state === "RUNTIME_DISABLED" ? (
            <Alert variant="warning">{stateExplanation(state)}</Alert>
          ) : null}

          {state === "ERROR" ? (
            <div className="space-y-3">
              <Alert variant="error">{stateExplanation(state)}</Alert>
              <Button onClick={() => void connect()} disabled={busy}>
                إعادة المحاولة
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
