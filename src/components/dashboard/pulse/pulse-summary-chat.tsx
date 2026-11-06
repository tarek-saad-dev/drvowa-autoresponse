"use client";

import { useEffect, useRef, useState } from "react";
import type { PulseSnapshot } from "@/modules/pulse/report";

type Period = PulseSnapshot["period"];
type SummaryCopy = { question: string; summary: string; handling: string | null; coverage: string | null };

export function getPulseSummaryCopy(data: PulseSnapshot | null, period: Period): SummaryCopy {
  const periodLabel = period === "month" ? "الشهر الحالي" : period === "yesterday" ? "أمس" : "اليوم";
  const question = "✦ إيه اللي حصل " +
    (period === "month" ? "الشهر ده" : period === "yesterday" ? "أمس" : "النهارده") + "؟";
  if (!data) {
    return {
      question,
      summary: "ملخص Pulse غير متاح حاليًا. المحادثات والمتابعة ما زالوا متاحين في قائمة المحادثات.",
      handling: null,
      coverage: null,
    };
  }

  const pending = Math.max(0, data.eligible - data.analyzed);
  const actionable = data.needsAttentionFollowups + data.pendingSignals;
  const handling = data.handlingFollowups + data.handlingSignals;
  const summary = data.messages === 0
    ? "مفيش رسائل واردة جديدة خلال الفترة المختارة. طلبات المراجعة المعروضة مرتبطة بالفترة دي بس."
    : "خلال " + periodLabel + " وصلتك " + data.messages.toLocaleString("ar-EG") +
      " رسالة واردة ضمن " + data.conversations.toLocaleString("ar-EG") + " محادثة. " +
      (actionable > 0
        ? "عندك " + actionable.toLocaleString("ar-EG") + " متابعة أو إشارة محتاجة مراجعة."
        : "مفيش طلبات مراجعة مفتوحة مصنفة حتى الآن.") +
      (pending > 0 ? " ولسه بيتم تحليل بعض الرسائل." : "");

  return {
    question,
    summary,
    handling: handling > 0
      ? "وفيه " + handling.toLocaleString("ar-EG") +
        " متابعة بدأ الفريق التعامل معاها بالفعل؛ مش محسوبة كطلبات محتاجة رد جديد."
      : null,
    coverage: "التصنيف المبدئي: " + data.analyzed.toLocaleString("en-US") +
      " من " + data.eligible.toLocaleString("en-US") +
      " رسالة نصية متاحة في الفترة • الحجوزات والمشتريات المعروضة استفسارات، وليست عمليات مؤكدة.",
  };
}

/**
 * A non-modal, support-chat-style summary: keeps the dashboard clean without
 * hiding activity details. Mobile launcher sits ABOVE the fixed bottom nav.
 * Desktop is pinned to the left to stay clear of the RTL sidebar on the right.
 */
export function PulseSummaryChat({
  data,
  period,
  businessName,
}: {
  data: PulseSnapshot | null;
  period: Period;
  businessName: string;
}) {
  const [open, setOpen] = useState(false);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const copy = getPulseSummaryCopy(data, period);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return;
      if (!panelRef.current?.contains(event.target) &&
          !launcherRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  const close = () => {
    setOpen(false);
    launcherRef.current?.focus();
  };

  return (
    <div dir="rtl" className="pointer-events-none fixed inset-0 z-50" aria-label="ملخص نبض النشاط">
      {open ? (
        <div
          id="pulse-summary-chat-panel"
          ref={panelRef}
          role="dialog"
          aria-modal="false"
          aria-labelledby="pulse-summary-chat-title"
          aria-describedby="pulse-summary-chat-description"
          className="pointer-events-auto fixed bottom-[calc(10.75rem+env(safe-area-inset-bottom))] right-3 flex max-h-[calc(100dvh-12.25rem-env(safe-area-inset-bottom))] w-[min(24.5rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-[22px] border border-border bg-card shadow-[0_24px_70px_-18px_rgba(5,43,58,.42)] sm:right-6 md:bottom-[6rem] md:left-6 md:right-auto md:max-h-[min(35rem,calc(100dvh-7.5rem))]"
        >
          <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border/70 px-4 py-3.5">
            <div className="flex min-w-0 items-center gap-2.5">
              <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-primary/10 text-xl text-primary">✦</span>
              <div className="min-w-0">
                <p className="text-[10px] font-black tracking-wider text-primary">DRVO / PULSE</p>
                <h2 id="pulse-summary-chat-title" className="text-sm font-black">نبض نشاطك</h2>
                <p className="truncate text-[11px] text-muted-foreground">كل المهم عن {businessName}، من غير زحمة.</p>
              </div>
            </div>
            <button
              ref={closeRef}
              type="button"
              aria-label="إغلاق ملخص النشاط"
              onClick={close}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-surface text-lg text-muted-foreground transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              ×
            </button>
          </header>
          <div id="pulse-summary-chat-description" className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain bg-surface/30 px-4 py-4">
            <div className="flex justify-start">
              <p className="max-w-[90%] rounded-2xl rounded-tr-md bg-primary px-3.5 py-2.5 text-xs font-bold leading-6 text-primary-foreground">
                {copy.question}
              </p>
            </div>
            <div className="flex items-end gap-2">
              <span aria-hidden="true" className="mb-1 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary/10 text-sm text-primary">✦</span>
              <div className="min-w-0 flex-1 space-y-3 rounded-2xl rounded-tl-md border border-border bg-card px-3.5 py-3 text-xs leading-7 text-foreground">
                <p>{copy.summary}</p>
                {copy.handling ? <p className="text-muted-foreground">{copy.handling}</p> : null}
              </div>
            </div>
            {copy.coverage ? (
              <p className="pe-9 text-[11px] leading-6 text-muted-foreground">{copy.coverage}</p>
            ) : null}
          </div>
          <footer className="shrink-0 border-t border-border/70 bg-card px-4 py-2.5 text-[10px] text-muted-foreground">
            ملخص مبني على بيانات الفترة المختارة
          </footer>
        </div>
      ) : null}
      <button
        ref={launcherRef}
        type="button"
        aria-controls="pulse-summary-chat-panel"
        aria-expanded={open}
        aria-label={copy.question}
        onClick={() => setOpen(value => !value)}
        className="pointer-events-auto fixed bottom-[calc(6.25rem+env(safe-area-inset-bottom))] right-3 flex max-w-[calc(100vw-1.5rem)] items-center gap-2.5 rounded-2xl border border-primary/20 bg-card px-3 py-2.5 text-start shadow-[0_16px_48px_-16px_rgba(5,43,58,.42)] transition duration-200 hover:-translate-y-0.5 hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transform-none sm:right-6 md:bottom-6 md:left-6 md:right-auto"
      >
        <span aria-hidden="true" className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary text-lg text-primary-foreground">✦</span>
        <span className="min-w-0 text-[13px] font-black text-foreground">{copy.question.slice(2)}</span>
        <span aria-hidden="true" className="text-muted-foreground">{open ? "⌄" : "⌃"}</span>
      </button>
    </div>
  );
}
