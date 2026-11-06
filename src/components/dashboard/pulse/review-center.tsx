"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { PulseIntent } from "@/modules/pulse/classifier";
import type { PulseReview, PulseSnapshot } from "@/modules/pulse/report";
import { ReviewButton } from "./review-button";

const card = "min-w-0 rounded-[22px] border border-border bg-card shadow-[0_16px_40px_-32px_rgba(5,43,58,.36)]";
const PREVIEW_LIMIT = 3;

function ReviewItem({ item, businessId }: { item: PulseReview; businessId: string }) {
  return (
    <article className="flex min-w-0 gap-3 py-3.5">
      <span
        aria-hidden="true"
        className={"mt-1 h-2.5 w-2.5 shrink-0 rounded-full " +
          (item.priority === "URGENT" ? "bg-warning" : "bg-primary/50")}
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-black" dir="auto">{item.name}</span>
          <span className="rounded-full bg-surface px-2 py-1 text-[10px] font-bold text-muted-foreground">{item.label}</span>
          {item.actionType === "OPPORTUNITY"
            ? <span className="text-[10px] text-primary">فرصة محتملة</span>
            : null}
        </div>
        <p className="mt-1 line-clamp-2 break-words text-xs leading-6 text-muted-foreground" dir="auto">{item.evidence}</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Link
            href={"/dashboard/inbox?businessId=" + encodeURIComponent(businessId) +
              "&conversationId=" + encodeURIComponent(item.conversationId)}
            className="text-xs font-black text-primary hover:underline"
          >
            افتح المحادثة ←
          </Link>
          {item.kind === "SIGNAL"
            ? <ReviewButton conversationId={item.conversationId} intent={item.intent as PulseIntent} />
            : <span className="text-[11px] text-muted-foreground">إدارة المتابعة من الشات</span>}
        </div>
      </div>
    </article>
  );
}

function ReviewRows({ reviews, businessId }: { reviews: PulseReview[]; businessId: string }) {
  return (
    <div className="divide-y divide-border/65">
      {reviews.map((item, i) => (
        <ReviewItem key={item.kind + item.conversationId + item.intent + i} item={item} businessId={businessId} />
      ))}
    </div>
  );
}

export function PulseReviewCenter({
  data,
  businessId,
  periodLabel,
  allReviews = false,
}: {
  data: PulseSnapshot | null;
  businessId: string;
  periodLabel: string;
  allReviews?: boolean;
}) {
  const [open, setOpen] = useState(allReviews);
  const openButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const handling = (data?.handlingFollowups ?? 0) + (data?.handlingSignals ?? 0);
  const actionable = (data?.needsAttentionFollowups ?? 0) + (data?.pendingSignals ?? 0);
  const reviews = data?.reviews ?? [];
  const showMore = reviews.length > PREVIEW_LIMIT || actionable > PREVIEW_LIMIT;

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
      openButtonRef.current?.focus();
    };
  }, [open]);

  const trapFocus = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Tab" || !dialogRef.current) return;
    const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ));
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <section className={card + " p-4 sm:p-5"} aria-label="مركز الطلبات">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-black sm:text-lg">الطلبات اللي تحتاج مراجعة</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            الطلبات اللي لسه محتاجة رد أو إجراء، ووصلت أو اتجدد طلبها خلال {periodLabel}
          </p>
        </div>
        {showMore ? (
          <button
            ref={openButtonRef}
            type="button"
            onClick={() => setOpen(true)}
            className="shrink-0 rounded-lg px-2 py-1 text-xs font-black text-primary transition hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            عرض الكل ({actionable.toLocaleString("ar-EG")})
          </button>
        ) : null}
      </div>

      {handling > 0 ? (
        <p className="mb-3 text-[11px] text-muted-foreground">
          {handling.toLocaleString("ar-EG")} متابعة بدأ التعامل معها (مش ضمن القائمة)
        </p>
      ) : null}

      {data && data.quotaBlockedFollowups > 0 ? (
        <div className="mb-3 rounded-xl border border-warning/25 bg-warning-soft/25 px-3 py-3 text-xs leading-6">
          <span className="font-bold">
            {data.quotaBlockedFollowups.toLocaleString("ar-EG")} محادثة لسه محتاجة رد يدوي لأن رصيد ردود الموظف الذكي انتهى خلال الفترة.
          </span>
          <Link href="/dashboard/billing" className="ms-2 font-black text-primary underline underline-offset-2">راجع الباقة</Link>
        </div>
      ) : null}

      {!data ? (
        <p className="rounded-xl bg-surface p-4 text-sm text-muted-foreground">تعذر تحميل الحالات المصنفة.</p>
      ) : reviews.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-7 text-center">
          <p className="font-bold">مفيش طلبات محتاجة مراجعة خلال {periodLabel}</p>
          <p className="mt-2 text-xs leading-6 text-muted-foreground">
            الحالات الجاري التعامل معها منفصلة عن الطلبات اللي مستنية رد جديد. راجع معدل تغطية التحليل فوق.
          </p>
        </div>
      ) : (
        <ReviewRows reviews={reviews.slice(0, PREVIEW_LIMIT)} businessId={businessId} />
      )}

      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-3 backdrop-blur-[3px] sm:p-6"
          onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false); }}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="pulse-reviews-dialog-title"
            aria-describedby="pulse-reviews-dialog-description"
            dir="rtl"
            onKeyDown={trapFocus}
            className="flex max-h-[90dvh] w-full max-w-2xl flex-col overflow-hidden rounded-[24px] border border-border bg-card shadow-2xl"
          >
            <div className="flex shrink-0 items-start justify-between gap-4 border-b border-border px-4 py-4 sm:px-6">
              <div className="min-w-0">
                <h2 id="pulse-reviews-dialog-title" className="text-base font-black sm:text-lg">
                  الطلبات اللي تحتاج مراجعة
                </h2>
                <p id="pulse-reviews-dialog-description" className="mt-1 text-xs leading-6 text-muted-foreground">
                  {actionable.toLocaleString("ar-EG")} طلب خلال {periodLabel} • اضغط على أي محادثة للتعامل معها
                </p>
              </div>
              <button
                ref={closeButtonRef}
                type="button"
                aria-label="إغلاق"
                onClick={() => setOpen(false)}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface text-xl text-muted-foreground transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                ×
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 sm:px-6">
              <ReviewRows reviews={reviews} businessId={businessId} />
              {actionable > reviews.length ? (
                <p className="border-t border-border py-4 text-xs leading-6 text-muted-foreground">
                  القائمة تعرض أحدث {reviews.length.toLocaleString("ar-EG")} حالة مصنفة من إجمالي الحالات المفتوحة.
                  باقي الحالات متاحة في صندوق المحادثات.
                </p>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border bg-surface/40 px-4 py-3 sm:px-6">
              <span className="text-[11px] text-muted-foreground">الحالات الأحدث والأعلى أولوية أولًا</span>
              <button type="button" onClick={() => setOpen(false)} className="rounded-xl border border-border px-4 py-2 text-xs font-black hover:bg-surface">
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
