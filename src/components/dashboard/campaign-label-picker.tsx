"use client";

import { useCallback, useEffect, useState } from "react";
import { CampaignLocalListManager } from "@/components/dashboard/campaign-local-list-manager";

export type MirroredWhatsAppLabel = {
  channelConnectionId: string;
  id: string;
  source?: "DRVO" | "WHATSAPP";
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
  labels, onPick,
}: {
  labels: MirroredWhatsAppLabel[];
  onPick: (label: MirroredWhatsAppLabel) => void;
}) {
  const active = labels.filter(label => !label.deleted && Boolean(label.name?.trim()));
  if (!active.length) return null;
  return (
    <div className="grid gap-2 sm:grid-cols-2" role="group" aria-label="اختار قائمة العملاء">
      {active.map(label => (
        <button key={label.channelConnectionId + ":" + label.id}
          type="button" onClick={() => onPick(label)}
          aria-label={"جهز رسالة لقائمة " + label.name}
          className="group flex min-w-0 items-center gap-3 rounded-xl border border-border bg-card px-4 py-3.5 text-start transition-colors hover:border-primary/60 hover:bg-primary/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
          <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-lg text-primary">◎</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-bold text-foreground">{label.name}</span>
            <span className="mt-0.5 block text-[11px] text-muted-foreground">
              {label.source === "DRVO" ? "قائمة DRVO" : "قائمة واتساب"} · {label.observedContacts.toLocaleString("ar-EG")} عميل{label.source === "DRVO" ? "" : " مرصود"}
            </span>
          </span>
          <span aria-hidden="true" className="text-lg text-muted-foreground group-hover:text-primary">‹</span>
        </button>
      ))}
    </div>
  );
}

/** Two separate surfaces: simple selection or list management, never both stacked. */
export function CampaignLabelPicker({
  onPick, onManage, mode = "choose", onBack,
}: {
  onPick: (label: MirroredWhatsAppLabel) => void;
  onManage?: () => void;
  mode?: "choose" | "manage";
  onBack?: () => void;
}) {
  const [labels, setLabels] = useState<MirroredWhatsAppLabel[]>([]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true); setError(false);
    try {
      const response = await fetch("/api/whatsapp/labels", { cache: "no-store" });
      if (!response.ok) throw new Error("LABELS_READ_FAILED");
      const data = await response.json() as LabelResponse;
      if (!Array.isArray(data.labels) || data.syncCoverage !== "EVENT_DRIVEN_PARTIAL"
        || data.audienceReady !== false) throw new Error("INVALID_LABEL_MIRROR");
      setLabels(data.labels);
      setLoaded(true);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const active = labels.filter(label => !label.deleted && Boolean(label.name?.trim()));
  const filtered = active.filter(label =>
    label.name!.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));

  if (mode === "manage") {
    return (
      <section aria-label="إدارة قوائم عملاء DRVO" className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-black">قوائم العملاء</h2>
            <p className="mt-1 text-sm text-muted-foreground">اعمل قائمة، واضف عملاءها، وارجع للحملة.</p>
          </div>
          <button type="button" onClick={onBack}
            className="rounded-xl border border-border px-4 py-2 text-sm font-bold hover:bg-surface">
            رجوع للحملة
          </button>
        </div>
        <CampaignLocalListManager labels={active} onChanged={refresh} />
        <details className="rounded-xl border border-border px-4 py-3">
          <summary className="cursor-pointer text-sm font-semibold">عندك Labels على WhatsApp Business؟</summary>
          <div className="space-y-2 pt-3 text-xs leading-6 text-muted-foreground">
            <p>Android: من WhatsApp Business افتح قائمة Labels وأضف العملاء.</p>
            <p>iPhone: من WhatsApp Business افتح Tools ثم Lists.</p>
            <p>قوائم واتساب القديمة ممكن لا تظهر كلها في DRVO بسبب محدودية المزامنة. قوائم DRVO مستقلة عن تطبيق واتساب.</p>
            <a href="https://faq.whatsapp.com/3398508707096369/"
              target="_blank" rel="noopener noreferrer" className="font-bold text-primary underline">
              مساعدة WhatsApp Business
            </a>
          </div>
        </details>
      </section>
    );
  }

  return (
    <section aria-label="قوائم العملاء في واتساب" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-black">اختار القائمة اللي هتبعت لها</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {loaded ? active.length.toLocaleString("ar-EG") + " قوائم متاحة" : "قوائمك من واتساب وDRVO"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button type="button" aria-label="تحديث القوائم" onClick={() => void refresh()} disabled={loading}
            className="text-xs font-bold text-muted-foreground hover:text-foreground disabled:opacity-50">
            {loading ? "بنحدّث…" : "تحديث"}
          </button>
          <button type="button" onClick={onManage}
            className="rounded-xl border border-primary/25 px-3 py-2 text-xs font-bold text-primary hover:bg-primary/5">
            + إدارة القوائم
          </button>
        </div>
      </div>
      {error ? (
        <div role="alert" className="rounded-xl bg-warning-soft/30 p-3 text-sm text-foreground">
          تعذر تحميل القوائم. اتأكد من اتصال واتساب واضغط تحديث.
        </div>
      ) : loading && !loaded ? (
        <div role="status" className="rounded-xl bg-surface px-4 py-6 text-sm text-muted-foreground">
          بنحمّل قوائم العملاء…
        </div>
      ) : active.length ? (
        <>
          {active.length > 5 ? (
            <input aria-label="ابحث عن قائمة" value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="ابحث باسم القائمة…"
              className="h-11 w-full rounded-xl border border-border bg-card px-4 text-sm outline-none focus:border-primary" />
          ) : null}
          <div className="max-h-72 overflow-y-auto pr-0.5">
            <CampaignLabelChoices labels={filtered} onPick={onPick} />
            {!filtered.length ? <p className="py-6 text-center text-sm text-muted-foreground">مفيش قائمة بالاسم ده.</p> : null}
          </div>
          {active.some(label => label.source !== "DRVO") ? (
            <p className="text-[11px] text-muted-foreground">
              أعداد قوائم واتساب المرصودة قد تكون جزئية. اختيار القائمة لا يرسل رسائل.
            </p>
          ) : null}
        </>
      ) : (
        <div className="rounded-2xl bg-surface px-5 py-8 text-center">
          <p className="text-sm font-bold">لسه ماعندكش قائمة هنا</p>
          <p className="mx-auto mt-2 max-w-sm text-xs leading-6 text-muted-foreground">
            اعمل أول قائمة في DRVO وأضف أرقام عملائك، وبعدها اختارها للحملة.
          </p>
          <button type="button" onClick={onManage}
            className="mt-4 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground">
            + إنشاء أول قائمة
          </button>
        </div>
      )}
    </section>
  );
}
