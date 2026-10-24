"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  describeOverviewConnection,
  type OverviewInboundHealth,
  type OverviewWhatsAppState,
} from "@/lib/dashboard/connection-state";
import type { ReceptionistStatus } from "@/lib/dashboard/receptionist-status";
import { cn } from "@/lib/utils/cn";

type ConnectionSnapshot = {
  uiState: OverviewWhatsAppState | null;
  inboundHealth: OverviewInboundHealth;
};

const toneClasses = {
  success: "border-success/20 bg-success-soft/20",
  warning: "border-warning/25 bg-warning-soft/30",
  danger: "border-destructive/25 bg-destructive-soft/30",
  neutral: "border-border bg-card",
};
const dotClasses = {
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-destructive",
  neutral: "bg-muted-foreground",
};

export function ConnectionHealthStrip({
  initialUiState,
  initialInboundHealth,
  status,
}: {
  initialUiState: string | null;
  initialInboundHealth: OverviewInboundHealth;
  status: ReceptionistStatus;
}) {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState<ConnectionSnapshot>({
    uiState: (initialUiState as OverviewWhatsAppState | null) ?? null,
    inboundHealth: initialInboundHealth,
  });
  const [refreshing, setRefreshing] = useState(false);
  const lastUiState = useRef(snapshot.uiState);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => {
    setSnapshot({
      uiState: (initialUiState as OverviewWhatsAppState | null) ?? null,
      inboundHealth: initialInboundHealth,
    });
    lastUiState.current = (initialUiState as OverviewWhatsAppState | null) ?? null;
  }, [initialUiState, initialInboundHealth]);

  const refresh = useCallback(async (manual = false) => {
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    if (manual) setRefreshing(true);
    try {
      const response = await fetch("/api/channels/whatsapp/status", {
        cache: "no-store",
        signal: abort.signal,
      });
      if (!response.ok) throw new Error("status unavailable");
      const data = await response.json() as {
        uiState?: OverviewWhatsAppState;
        runtime?: { inboundDelivery?: { health?: OverviewInboundHealth } | null } | null;
      };
      if (abort.signal.aborted) return;
      const nextState = data.uiState ?? null;
      setSnapshot({
        uiState: nextState,
        inboundHealth: data.runtime?.inboundDelivery?.health ?? null,
      });
      if (lastUiState.current !== nextState) {
        lastUiState.current = nextState;
        router.refresh();
      }
      if (manual) router.refresh();
    } catch {
      if (abort.signal.aborted) return;
      // Fail closed: never keep an old green "connected" state after a failed probe.
      setSnapshot({ uiState: null, inboundHealth: null });
    } finally {
      if (!abort.signal.aborted) setRefreshing(false);
    }
  }, [router]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 20_000);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      controller.current?.abort();
    };
  }, [refresh]);

  const connection = describeOverviewConnection(
    snapshot.uiState,
    snapshot.inboundHealth,
  );
  const aiWorking = connection.canSend && status.kind === "working"
    && snapshot.inboundHealth === "healthy";
  const aiLabel = !connection.canSend
    ? "الرد التلقائي غير متاح"
    : aiWorking
      ? "الموظف الذكي نشط"
      : status.kind === "checking"
        ? "جاري فحص الموظف"
        : status.kind === "ai_paused"
          ? "الموظف متوقف مؤقتًا"
          : "الموظف محتاج مراجعة";
  const needsAttention = connection.tone !== "success" || !aiWorking;
  const primaryAction = !connection.canSend || snapshot.inboundHealth === "degraded"
    ? { href: "/dashboard/whatsapp", label: connection.actionLabel ?? "راجع واتساب" }
    : status.action;

  return (
    <section
      aria-label="حالة تشغيل النظام"
      aria-live="polite"
      className={cn(
        "rounded-[22px] border px-4 py-4 shadow-[0_12px_32px_-27px_rgba(5,50,69,.45)] sm:px-5",
        toneClasses[connection.tone],
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span aria-hidden className={cn(
            "mt-2 h-2.5 w-2.5 shrink-0 rounded-full",
            dotClasses[connection.tone],
          )} />
          <div className="min-w-0">
            <h2 className="text-sm font-black sm:text-base">
              {aiWorking ? "كل الأنظمة تعمل بشكل طبيعي" : connection.title}
            </h2>
            <p className="mt-1 text-xs leading-6 text-muted-foreground sm:text-sm">
              {aiWorking ? "واتساب متصل، والموظف الذكي جاهز للرد على العملاء." : connection.detail}
            </p>
            {connection.canSend && !aiWorking && status.kind !== "checking" ? (
              <p className="mt-1 text-xs font-semibold text-foreground/80">
                {status.detail}
              </p>
            ) : null}
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] font-semibold text-muted-foreground">
              <span className="rounded-full border border-border/70 bg-card/70 px-2.5 py-1">
                واتساب: {connection.canSend ? "متصل" : "غير متاح للإرسال"}
              </span>
              <span className="rounded-full border border-border/70 bg-card/70 px-2.5 py-1">
                {aiLabel}
              </span>
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => void refresh(true)}
            disabled={refreshing}
            className="rounded-xl border border-border bg-card px-3 py-2 text-xs font-bold text-muted-foreground transition hover:text-foreground disabled:opacity-50"
            aria-label="تحديث حالة الاتصال"
          >
            {refreshing ? "جاري التحديث…" : "تحديث ↻"}
          </button>
          {needsAttention && primaryAction ? (
            <Link
              href={primaryAction.href}
              className="rounded-xl bg-primary px-3 py-2 text-xs font-black text-primary-foreground transition hover:bg-primary-hover"
            >
              {primaryAction.label} ←
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  );
}
