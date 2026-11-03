"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

export type MirroredWhatsAppLabel = {
  channelConnectionId: string;
  id: string;
  name: string | null;
  color: number | null;
  deleted: boolean;
  observedContacts: number;
};

type LabelResponse = {
  labels?: MirroredWhatsAppLabel[];
  syncCoverage?: string;
  audienceReady?: boolean;
};

export function CampaignLabelChoices({
  labels,
  onPick,
}: {
  labels: MirroredWhatsAppLabel[];
  onPick: (label: MirroredWhatsAppLabel) => void;
}) {
  // The command parser cannot resolve identically named labels on two different
  // WhatsApp accounts. Do not silently target one of them.
  const counts = new Map<string, number>();
  for (const label of labels) {
    if (label.deleted || !label.name?.trim()) continue;
    const key = label.name.trim().toLocaleLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const active = labels.filter(label => !label.deleted && Boolean(label.name?.trim()));

  if (!active.length) return null;

  return (
    <div className="grid max-h-52 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2"
      role="group" aria-label="اختار قائمة واتساب">
      {active.map(label => {
        const name = label.name!.trim();
        const ambiguous = (counts.get(name.toLocaleLowerCase()) ?? 0) > 1;
        return (
          <button key={label.channelConnectionId + ":" + label.id}
            type="button" disabled={ambiguous}
            onClick={() => onPick(label)}
            aria-label={"جهز رسالة لقائمة " + name}
            className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-border bg-card px-3 py-3 text-start transition hover:border-primary hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-60">
            <span className="flex min-w-0 items-center gap-2">
              <span className="size-2 shrink-0 rounded-full bg-primary/65" aria-hidden="true" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-bold">{name}</span>
                <span className="block text-[11px] text-muted-foreground">
                  {ambiguous ? "الاسم مكرر على أكثر من رقم" : "اضغط لتجهيز رسالة"}
                </span>
              </span>
            </span>
            <span className="shrink-0 text-xs font-semibold text-muted-foreground">
              {label.observedContacts.toLocaleString("ar-EG")} مرصود
            </span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * This surfaces only server-mirrored WhatsApp labels.
 * It never creates remote labels, starts a send or claims historical completeness.
 */
export function CampaignLabelPicker({ onPick }: { onPick: (label: MirroredWhatsAppLabel) => void }) {
  const [expanded, setExpanded] = useState(true);
  const [labels, setLabels] = useState<MirroredWhatsAppLabel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const response = await fetch("/api/whatsapp/labels", { cache: "no-store" });
      if (!response.ok) throw new Error("LABELS_READ_FAILED");
      const data = (await response.json()) as LabelResponse;
      if (!Array.isArray(data.labels)
        || data.syncCoverage !== "EVENT_DRIVEN_PARTIAL"
        || data.audienceReady !== false) {
        throw new Error("INVALID_LABEL_MIRROR");
      }
      setLabels(data.labels);
      setLoaded(true);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const activeCount = useMemo(() =>
    labels.filter(label => !label.deleted && Boolean(label.name?.trim())).length,
    [labels],
  );
  const unnamedCount = labels.filter(label => !label.deleted && !label.name?.trim()).length;

  return (
    <section aria-label="قوائم العملاء في واتساب"
      className="space-y-3 rounded-2xl border border-border bg-card p-3 sm:p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-black">قوائم عملائك على واتساب</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {loaded ? activeCount.toLocaleString("ar-EG") + " قائمة ظهرت عندنا" : "اختار قائمة عشان تبدأ"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <button type="button" onClick={() => void refresh()}
            disabled={loading} className="text-xs font-bold text-primary disabled:opacity-50">
            {loading ? "بنحدّث…" : "تحديث"}
          </button>
          <button type="button" aria-expanded={expanded}
            onClick={() => setExpanded(value => !value)}
            className="text-xs font-bold text-muted-foreground">
            {expanded ? "إخفاء" : "عرض"}
          </button>
        </div>
      </div>

      {expanded ? (
        <div className="space-y-3 border-t border-border pt-3">
          {loading && !loaded ? (
            <p role="status" className="text-xs text-muted-foreground">بنقرأ قوائم واتساب…</p>
          ) : error ? (
            <p role="alert" className="text-xs text-warning">
              مش قادرين نقرأ القوائم حاليًا. اتأكد من اتصال واتساب واضغط تحديث.
            </p>
          ) : activeCount ? (
            <CampaignLabelChoices labels={labels} onPick={label => {
              onPick(label);
              setExpanded(false);
            }} />
          ) : loaded ? (
            <div className="rounded-xl bg-surface px-3 py-3">
              <p className="text-sm font-bold">لسه مفيش قوائم ظاهرة في DRVO</p>
              <p className="mt-1 text-xs leading-6 text-muted-foreground">
                اعمل قائمة في WhatsApp Business وضيف لها محادثات عملائك.
                بعد كده ارجع هنا واضغط تحديث. القوائم القديمة ممكن لسه ما تكونش اتزامنت.
              </p>
            </div>
          ) : null}

          {unnamedCount > 0 ? (
            <p className="text-xs text-warning">
              فيه {unnamedCount.toLocaleString("ar-EG")} قائمة وصلت من واتساب من غير اسم، ومش ممكن نختارها قبل ما الاسم يوصل.
            </p>
          ) : null}

          <details className="group rounded-xl border border-border px-3 py-2.5">
            <summary className="cursor-pointer text-xs font-bold text-foreground">
              إزاي أعمل قائمة جديدة أو أضيف لها عملاء؟
            </summary>
            <div className="space-y-2 pt-3 text-xs leading-6 text-muted-foreground">
              <p><strong className="text-foreground">Android:</strong> افتح WhatsApp Business، ومن المحادثات افتح الثلاث نقط ← Labels، واعمل قائمة جديدة.</p>
              <p><strong className="text-foreground">iPhone:</strong> افتح WhatsApp Business ← Tools ← Lists ← New list.</p>
              <p>لإضافة عميل: اضغط مطولًا على محادثته، واختار Label أو Add to list، وحدد القائمة.</p>
              <a href="https://faq.whatsapp.com/3398508707096369/"
                target="_blank" rel="noopener noreferrer"
                className="inline-block font-bold text-primary underline underline-offset-2">
                خطوات واتساب الرسمية
              </a>
            </div>
          </details>

          <p className="text-[11px] leading-5 text-muted-foreground">
            بنعرض القوائم والعملاء اللي وصلتنا من مزامنة واتساب؛ العدد ممكن يكون جزئي.
            تحديث هنا بيعيد قراءة بيانات DRVO، مش مزامنة كاملة من الموبايل.
          </p>
        </div>
      ) : null}
    </section>
  );
}
