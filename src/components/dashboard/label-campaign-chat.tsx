"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CampaignLabelPicker, type MirroredWhatsAppLabel } from "@/components/dashboard/campaign-label-picker";
import { LabelCampaignAudiencePreview } from "@/components/dashboard/label-campaign-audience-preview";
import { LabelCampaignPreflight } from "@/components/dashboard/label-campaign-preflight";
import { mapUserFacingError } from "@/lib/ui/user-errors";

type CampaignDraft = {
  draftId: string;
  labelName: string;
  messageText: string;
  observedContacts: number;
  eligibleContacts: 0;
  status: "DRAFT" | "COPY_APPROVED" | "CANCELLED";
  createdAtUtc: string;
  sendEnabled: false;
  audienceReady: false;
};
type ApiPayload = {
  drafts?: CampaignDraft[];
  draft?: CampaignDraft;
  error?: string;
  code?: string;
  sendingEnabled?: false;
};
type View = "compose" | "manage" | "review" | "history";

export function LabelCampaignChat() {
  const [view, setView] = useState<View>("compose");
  const [selectedLabel, setSelectedLabel] = useState<MirroredWhatsAppLabel | null>(null);
  const [input, setInput] = useState("");
  const [drafts, setDrafts] = useState<CampaignDraft[]>([]);
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const activeDraft = drafts.find(draft => draft.draftId === activeDraftId);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/whatsapp/label-campaigns", { cache: "no-store" });
    const data = await res.json().catch(() => ({})) as ApiPayload;
    if (!res.ok || !Array.isArray(data.drafts) || data.sendingEnabled !== false) {
      throw new Error(mapUserFacingError(data, "تعذر تحميل الحملات السابقة."));
    }
    if (alive.current) setDrafts(data.drafts);
  }, []);

  useEffect(() => {
    alive.current = true;
    void refresh().catch(() => {
      if (alive.current) setError("مش قادرين نحمّل المسودات السابقة. جرّب تاني.");
    }).finally(() => { if (alive.current) setLoading(false); });
    return () => { alive.current = false; };
  }, [refresh]);

  function navigate(next: View) {
    setView(next);
    setError(null);
    setNotice(null);
    setPreviewId(null);
    setEditId(null);
  }
  function newCampaign() {
    setSelectedLabel(null);
    setInput("");
    setActiveDraftId(null);
    navigate("compose");
  }
  function openDraft(draft: CampaignDraft) {
    setActiveDraftId(draft.draftId);
    navigate("review");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = input.trim();
    if (busy || text.length < (selectedLabel ? 4 : 12)) return;
    const payload = selectedLabel ? {
      channelConnectionId: selectedLabel.channelConnectionId,
      labelId: selectedLabel.id,
      messageText: text,
    } : { text };
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/whatsapp/label-campaigns", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({})) as ApiPayload;
      if (!res.ok || !Array.isArray(data.drafts) || data.drafts.length === 0) {
        throw new Error(mapUserFacingError(data, "مش قادرين نجهز الرسالة. حاول تاني."));
      }
      setDrafts(previous => [...data.drafts!, ...previous].slice(0, 25));
      setActiveDraftId(data.drafts[0].draftId);
      setSelectedLabel(null);
      setInput("");
      navigate("review");
      setNotice(data.drafts.length > 1
        ? "جهزنا أكتر من مسودة. هتلاقي الباقي في الحملات السابقة."
        : "اتجهزت الرسالة. راجعها قبل اعتماد الإرسال.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر تجهيز الرسالة.");
    } finally {
      if (alive.current) setBusy(false);
    }
  }

  async function updateDraft(draft: CampaignDraft, action: "update" | "approve_copy" | "cancel") {
    if (busy) return;
    const messageText = action === "update" ? editText.trim() : draft.messageText;
    if (action === "update" && messageText.length < 4) {
      setError("اكتب رسالة أطول شوية قبل الحفظ.");
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/whatsapp/label-campaigns/" + draft.draftId, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action === "cancel" ? { action } : { action, messageText }),
      });
      const data = await res.json().catch(() => ({})) as ApiPayload;
      if (!res.ok || !data.draft || data.sendingEnabled !== false) {
        throw new Error(mapUserFacingError(data, "تعذر حفظ التغيير. جرّب تاني."));
      }
      setDrafts(previous => previous.map(item =>
        item.draftId === draft.draftId ? data.draft! : item));
      setEditId(null);
      setPreviewId(null);
      if (action === "cancel") {
        newCampaign();
        setNotice("المسودة اتلغت.");
      } else {
        setNotice(action === "approve_copy"
          ? "الرسالة اتعتمدت. دلوقتي راجع المستلمين قبل الإرسال."
          : "اتحفظ تعديل الرسالة. راجعها واعتمدها.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر تحديث الرسالة.");
    } finally {
      if (alive.current) setBusy(false);
    }
  }

  return (
    <section aria-label="محادثة حملات القوائم" className="mx-auto w-full max-w-[780px] pb-10">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-5">
        <div>
          <h2 className="text-lg font-black tracking-tight sm:text-xl">
            {view === "manage" ? "إدارة القوائم" : view === "history" ? "الحملات السابقة"
              : view === "review" ? "مراجعة الحملة" : "حملة جديدة"}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {view === "compose" ? "رسالة واحدة، للجمهور اللي تختاره." :
              view === "review" ? "راجع الرسالة والمستلمين قبل بدء الإرسال." :
                view === "history" ? "مسودات ورسائل جهزتها قبل كده." :
                  "أضف العملاء واختبر الأرقام في مكان واحد."}
          </p>
        </div>
        {view === "compose" ? (
          <button type="button" onClick={() => navigate("history")}
            className="rounded-xl border border-border px-3 py-2 text-xs font-bold text-muted-foreground hover:bg-card hover:text-foreground">
            الحملات السابقة {drafts.filter(draft => draft.status !== "CANCELLED").length
              ? "(" + drafts.filter(draft => draft.status !== "CANCELLED").length.toLocaleString("ar-EG") + ")" : ""}
          </button>
        ) : (
          <button type="button" onClick={newCampaign}
            className="rounded-xl border border-border px-3 py-2 text-xs font-bold hover:bg-card">
            + حملة جديدة
          </button>
        )}
      </div>

      {view === "compose" || view === "review" ? (
        <div className="mb-5 grid grid-cols-3 gap-2" aria-label="خطوات الحملة">
          {[
            {name:"١ · الجمهور", active: view === "compose" && !selectedLabel, done: Boolean(selectedLabel) || view === "review"},
            {name:"٢ · الرسالة", active: view === "compose" && Boolean(selectedLabel), done: view === "review"},
            {name:"٣ · المراجعة", active: view === "review", done: false},
          ].map(step => (
            <div key={step.name}
              className={"rounded-lg px-2 py-2 text-center text-[11px] font-bold sm:text-xs " +
                (step.active ? "bg-primary/10 text-primary" :
                  step.done ? "bg-surface text-foreground" : "bg-surface/55 text-muted-foreground")}>
              {step.name}
            </div>
          ))}
        </div>
      ) : null}

      {error ? <div className="mb-4"><Alert variant="warning">{error}</Alert></div> : null}
      {notice ? <p role="status" className="mb-4 rounded-xl bg-primary/5 px-4 py-3 text-xs font-semibold text-foreground">{notice}</p> : null}

      {view === "manage" ? (
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-6">
          <CampaignLabelPicker mode="manage" onPick={label => {
            setSelectedLabel(label);
            navigate("compose");
          }} onBack={() => navigate("compose")} />
        </div>
      ) : null}

      {view === "compose" ? (
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          {!selectedLabel ? (
            <div className="p-4 sm:p-6">
              <CampaignLabelPicker onPick={label => {
                setSelectedLabel(label);
                setError(null);
                requestAnimationFrame(() => composerRef.current?.focus());
              }} onManage={() => navigate("manage")} />
            </div>
          ) : (
            <div className="space-y-5 p-4 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-5">
                <div>
                  <p className="text-[11px] font-bold text-muted-foreground">إلى قائمة</p>
                  <p className="mt-1 text-base font-black">{selectedLabel.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {selectedLabel.observedContacts.toLocaleString("ar-EG")} عميل{selectedLabel.source === "WHATSAPP" ? " مرصود" : ""} · {selectedLabel.source === "DRVO" ? "قائمة DRVO" : "قائمة واتساب"}
                  </p>
                </div>
                <button type="button" onClick={() => setSelectedLabel(null)}
                  className="rounded-xl border border-border px-3 py-2 text-xs font-bold text-muted-foreground hover:text-foreground">
                  تغيير القائمة
                </button>
              </div>
              <form onSubmit={event => void submit(event)} className="space-y-3">
                <label htmlFor="campaign-composer" className="block text-sm font-black">رسالتك للعملاء</label>
                <textarea id="campaign-composer" ref={composerRef} aria-label="اكتب رسالة القائمة"
                  value={input} maxLength={3000} rows={5}
                  placeholder="مثال: عندنا عرض جديد الأسبوع ده، للحجز ابعتلنا رسالة…"
                  onChange={event => setInput(event.target.value)}
                  className="min-h-36 w-full resize-y rounded-xl border border-border bg-surface/40 px-4 py-3 text-sm leading-7 outline-none focus:border-primary" />
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="text-[11px] text-muted-foreground">مش هيتم إرسال أي رسالة دلوقتي.</span>
                  <Button type="submit" disabled={busy || input.trim().length < 4}>
                    {busy ? "بنجهز…" : "مراجعة الرسالة"}
                  </Button>
                </div>
              </form>
            </div>
          )}
          {!selectedLabel ? (
            <details className="border-t border-border px-4 py-4 sm:px-6">
              <summary className="cursor-pointer text-xs font-semibold text-muted-foreground">
                أو اكتب طلبك بطريقتك بدل اختيار قائمة
              </summary>
              <form onSubmit={event => void submit(event)} className="mt-3 space-y-3">
                <textarea aria-label="اكتب طلب الحملة" value={input} maxLength={4000} rows={3}
                  placeholder="ابعت للناس اللي في VIP إن عندنا عرض جديد…"
                  onChange={event => setInput(event.target.value)}
                  className="w-full rounded-xl border border-border bg-surface/40 p-3 text-sm leading-7 outline-none focus:border-primary"/>
                <div className="flex justify-end">
                  <Button type="submit" disabled={busy || input.trim().length < 12}>
                    {busy ? "بنجهز…" : "تجهيز الطلب"}
                  </Button>
                </div>
              </form>
            </details>
          ) : null}
        </div>
      ) : null}

      {view === "review" ? activeDraft ? (
        <div className="space-y-4">
          <div className="space-y-4 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs text-muted-foreground">الجمهور</p>
                <h3 className="mt-1 text-base font-black">{activeDraft.labelName}</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {activeDraft.observedContacts.toLocaleString("ar-EG")} رقم مرصود
                </p>
              </div>
              <span className={"rounded-full px-3 py-1.5 text-xs font-bold " +
                (activeDraft.status === "COPY_APPROVED"
                  ? "bg-primary/10 text-primary" : "bg-surface text-muted-foreground")}>
                {activeDraft.status === "COPY_APPROVED" ? "الرسالة معتمدة" : "مسودة"}
              </span>
            </div>
            {editId === activeDraft.draftId ? (
              <div className="space-y-3">
                <textarea aria-label={"تعديل رسالة " + activeDraft.labelName}
                  value={editText} maxLength={3000} rows={5}
                  onChange={event => setEditText(event.target.value)}
                  className="min-h-32 w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm leading-7 outline-none focus:border-primary" />
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" disabled={busy || editText.trim().length < 4}
                    onClick={() => void updateDraft(activeDraft, "update")}>حفظ الرسالة</Button>
                  <Button size="sm" variant="outline" disabled={busy}
                    onClick={() => setEditId(null)}>رجوع</Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs font-bold text-muted-foreground">نص الرسالة</p>
                <div dir="auto" className="whitespace-pre-wrap break-words rounded-2xl rounded-tr-md bg-primary/10 p-4 text-sm leading-7">
                  {activeDraft.messageText}
                </div>
                <div className="flex flex-wrap gap-3">
                  <button type="button" disabled={busy} className="text-xs font-semibold text-primary"
                    onClick={() => {setEditId(activeDraft.draftId);setEditText(activeDraft.messageText);}}>
                    تعديل الرسالة
                  </button>
                  <button type="button" className="text-xs font-semibold text-muted-foreground"
                    onClick={() => setPreviewId(previous =>
                      previous === activeDraft.draftId ? null : activeDraft.draftId)}>
                    {previewId === activeDraft.draftId ? "إخفاء معاينة الأرقام" : "معاينة الأرقام"}
                  </button>
                  <button type="button" disabled={busy}
                    className="text-xs font-semibold text-muted-foreground"
                    onClick={() => void updateDraft(activeDraft, "cancel")}>
                    إلغاء المسودة
                  </button>
                </div>
              </div>
            )}
            {previewId === activeDraft.draftId ? (
              <LabelCampaignAudiencePreview draftId={activeDraft.draftId} />
            ) : null}
            {activeDraft.status === "DRAFT" && editId !== activeDraft.draftId ? (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                <p className="text-xs text-muted-foreground">اعتماد النص لا يبدأ الإرسال.</p>
                <Button disabled={busy} onClick={() => void updateDraft(activeDraft, "approve_copy")}>
                  اعتماد الرسالة والمتابعة
                </Button>
              </div>
            ) : null}
          </div>
          {activeDraft.status === "COPY_APPROVED" && editId !== activeDraft.draftId ? (
            <div className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-6">
              <h3 className="mb-3 text-sm font-black">إرسال الحملة</h3>
              <LabelCampaignPreflight
                key={activeDraft.draftId} openByDefault draftId={activeDraft.draftId}
                messageText={activeDraft.messageText} />
            </div>
          ) : null}
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-card p-6 text-sm">
          المسودة مش موجودة هنا. افتح الحملات السابقة وحددها.
          <button type="button" onClick={() => navigate("history")} className="mr-2 font-bold text-primary">الحملات السابقة</button>
        </div>
      ) : null}

      {view === "history" ? (
        <div className="space-y-3">
          {loading ? <p role="status" className="py-5 text-sm text-muted-foreground">بنحمّل الحملات…</p> : null}
          {!loading && !drafts.some(draft => draft.status !== "CANCELLED") ? (
            <div className="rounded-2xl border border-border bg-card px-5 py-8 text-center">
              <p className="text-sm font-bold">مفيش حملات سابقة لسه.</p>
              <Button size="sm" onClick={newCampaign}>إنشاء أول حملة</Button>
            </div>
          ) : null}
          {drafts.filter(draft => draft.status !== "CANCELLED").map(draft => (
            <button key={draft.draftId} type="button" onClick={() => openDraft(draft)}
              className="flex w-full items-center justify-between gap-4 rounded-xl border border-border bg-card px-4 py-4 text-start transition hover:border-primary/40 hover:bg-primary/5">
              <span className="min-w-0">
                <span className="block truncate text-sm font-bold">{draft.labelName}</span>
                <span className="mt-1 block truncate text-xs text-muted-foreground">{draft.messageText}</span>
              </span>
              <span className="shrink-0 text-xs font-bold text-muted-foreground">
                {draft.status === "COPY_APPROVED" ? "معتمدة" : "مسودة"} ‹
              </span>
            </button>
          ))}
          {drafts.length > 0 ? <p className="text-[11px] text-muted-foreground">آخر 25 مسودة محفوظة فقط.</p> : null}
        </div>
      ) : null}
    </section>
  );
}
