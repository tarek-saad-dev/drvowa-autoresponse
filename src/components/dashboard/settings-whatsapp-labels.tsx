"use client";

import { useCallback, useState } from "react";

type MirroredLabel = {
  channelConnectionId: string;
  id: string;
  name: string | null;
  color: number | null;
  deleted: boolean;
  observedContacts: number;
};
type LabelsResponse = {
  labels?: MirroredLabel[];
  syncCoverage?: string;
  audienceReady?: boolean;
};

/**
 * Lightweight, read-only diagnostic surface. It must not imply that membership
 * history is complete or that a label is authorized for campaign delivery.
 */
export function SettingsWhatsAppLabels() {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [labels, setLabels] = useState<MirroredLabel[]>([]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const response = await fetch("/api/whatsapp/labels", { cache: "no-store" });
      if (!response.ok) throw new Error("LABELS_UNAVAILABLE");
      const data = await response.json() as LabelsResponse;
      if (!Array.isArray(data.labels) || data.syncCoverage !== "EVENT_DRIVEN_PARTIAL"
        || data.audienceReady !== false) {
        throw new Error("LABELS_INVALID_RESPONSE");
      }
      setLabels(data.labels);
      setLoaded(true);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  const visible = labels.filter(label => !label.deleted);
  const unnamedCount = visible.filter(label => !label.name).length;

  return (
    <section className="rounded-2xl border border-border bg-card px-4 py-3 sm:px-5"
      aria-label="قوائم واتساب">
      <button type="button" aria-expanded={open}
        onClick={() => {
          setOpen(value => !value);
          if (!open && !loaded && !loading) void refresh();
        }}
        className="flex w-full items-center justify-between gap-3 text-right">
        <span className="text-sm font-black">قوائم واتساب (Labels)</span>
        <span className="text-xs font-bold text-muted-foreground" aria-hidden>
          {open ? "إخفاء" : "عرض"}
        </span>
      </button>
      {open ? (
        <div className="mt-3 space-y-3 border-t border-border pt-3">
          <p className="text-xs leading-6 text-muted-foreground">
            بنعرض التغييرات اللي رصدناها من واتساب. الأعداد جزئية ومش تأكيد
            إن كل العملاء اتزامنوا، ومش معناها إنهم وافقوا على رسائل تسويقية.
          </p>
          {loading ? (
            <p className="text-xs text-muted-foreground" role="status">بنقرأ القوائم…</p>
          ) : error ? (
            <p className="text-xs text-warning" role="alert">
              مش قادرين نقرأ القوائم حاليًا. راجع الاتصال وحاول تاني.
            </p>
          ) : !loaded ? null : visible.length === 0 ? (
            <p className="rounded-xl bg-surface p-3 text-xs text-muted-foreground">
              لسه ما رصدناش قوائم. لو عندك Labels قديمة، لازم نتحقق من مزامنتها
              قبل ما نستخدمها.
            </p>
          ) : (
            <ul className="divide-y divide-border rounded-xl border border-border">
              {visible.map(label => (
                <li key={label.channelConnectionId + ":" + label.id}
                  className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold">
                      {label.name || "قائمة غير معروفة الاسم"}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {label.name ? "مزامنة جزئية" : "الاسم لم يصل من واتساب"}
                    </p>
                  </div>
                  <p className="shrink-0 text-xs font-semibold text-muted-foreground">
                    {label.observedContacts.toLocaleString("ar-EG")} مرصود
                  </p>
                </li>
              ))}
            </ul>
          )}
          {loaded && unnamedCount > 0 ? (
            <p className="text-[11px] text-warning">
              بعض القوائم وصلنا ارتباط عملائها، لكن أسماءها لسه مش متاحة.
            </p>
          ) : null}
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-medium text-muted-foreground">
              للاستعراض فقط — الإرسال الجماعي غير مفعّل
            </span>
            <button type="button" onClick={() => void refresh()}
              disabled={loading}
              className="text-xs font-bold text-primary disabled:opacity-50">
              {loading ? "بنحدّث…" : "تحديث"}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
