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
      return "غير متصل";
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
      return "التشغيل غير مفعّل";
    case "ERROR":
      return "خطأ";
    default:
      return state;
  }
}

function badgeVariant(
  state: UiState,
): "default" | "success" | "warning" | "muted" {
  if (state === "READY") return "success";
  if (state === "QR_REQUIRED" || state === "STARTING" || state === "CONNECTING") {
    return "warning";
  }
  if (state === "ERROR" || state === "LOGGED_OUT") return "muted";
  return "default";
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
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refreshStatus = useCallback(async () => {
    const res = await fetch("/api/channels/whatsapp/status", {
      cache: "no-store",
    });
    const data = (await res.json()) as ConnectionPayload & { error?: string };
    if (!res.ok) {
      throw new Error(data.error || "تعذر تحديث الحالة");
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
      message?: string | null;
    };
    if (!res.ok) {
      throw new Error(data.error || "تعذر جلب رمز QR");
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
      if (!res.ok && data.code !== "MULTI_ACCOUNT_DISABLED") {
        // Runtime-disabled still returns a structured body from service path
        // via 200 in startWhatsAppPairing — handle both shapes.
      }
      if (!res.ok && !data.uiState) {
        throw new Error(data.error || "تعذر بدء الربط");
      }
      setView(data.uiState ? data : { ...view, ...data });
      if (data.uiState === "QR_REQUIRED" || data.runtime?.qrAvailable) {
        await refreshQr();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر بدء الربط");
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
      const data = (await res.json()) as ConnectionPayload & { error?: string };
      if (!res.ok) {
        throw new Error(data.error || "تعذر إيقاف الاتصال");
      }
      setView(data);
      setQrImageDataUrl(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر إيقاف الاتصال");
    } finally {
      setBusy(false);
    }
  }

  const state = view.uiState;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>اتصال واتساب</CardTitle>
            <Badge variant={badgeVariant(state)}>{stateLabel(state)}</Badge>
          </div>
          <CardDescription>
            اربط رقم واتساب بنشاطك عبر رمز QR. افتح واتساب على هاتفك ← الأجهزة
            المرتبطة ← ربط جهاز، ثم امسح الرمز الظاهر هنا.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error ? <Alert variant="error">{error}</Alert> : null}
          {view.message && state !== "READY" ? (
            <Alert variant={state === "RUNTIME_DISABLED" ? "warning" : "error"}>
              {view.message}
            </Alert>
          ) : null}

          {state === "NOT_CONNECTED" || state === "DISCONNECTED" ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                اضغط للبدء. سيتم إنشاء اتصال آمن لمساحة العمل الحالية فقط.
              </p>
              <Button onClick={() => void connect()} disabled={busy}>
                {busy ? "جاري الربط…" : "ربط واتساب"}
              </Button>
            </div>
          ) : null}

          {state === "STARTING" || state === "CONNECTING" ? (
            <p className="text-sm text-muted-foreground">
              جاري تجهيز الاتصال… يرجى الانتظار.
            </p>
          ) : null}

          {state === "QR_REQUIRED" ? (
            <div className="space-y-4">
              <p className="text-sm leading-7 text-foreground">
                افتح واتساب → الأجهزة المرتبطة → ربط جهاز
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
              <Alert variant="success">واتساب متصل وجاهز لهذه المساحة.</Alert>
              {view.connection?.maskedPhone ? (
                <p className="text-sm text-muted-foreground">
                  الرقم: {view.connection.maskedPhone}
                </p>
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
              <Alert variant="error">
                انتهت جلسة واتساب. يلزم ربط جديد يدوياً — لن تتم إعادة الاتصال
                تلقائياً.
              </Alert>
              <Button onClick={() => void connect()} disabled={busy}>
                ربط من جديد
              </Button>
            </div>
          ) : null}

          {state === "RUNTIME_DISABLED" ? (
            <Alert variant="warning">
              ربط واتساب غير متاح مؤقتاً. بيانات مساحتك محفوظة ويمكنك المحاولة
              مرة أخرى بعد قليل دون فقدان الإعدادات.
            </Alert>
          ) : null}

          {state === "ERROR" ? (
            <div className="space-y-3">
              <Alert variant="error">
                حدث خطأ أثناء الاتصال. يمكنك المحاولة مرة أخرى.
              </Alert>
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
