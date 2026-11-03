"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { LabelCampaignAudiencePreview } from "@/components/dashboard/label-campaign-audience-preview";
import { LabelCampaignPreflight } from "@/components/dashboard/label-campaign-preflight";
import { CampaignLabelPicker, type MirroredWhatsAppLabel } from "@/components/dashboard/campaign-label-picker";
import { Button } from "@/components/ui/button";
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
type ChatTurn = { role: "owner" | "agent"; text: string };
type ApiPayload = {
  drafts?: CampaignDraft[];
  draft?: CampaignDraft;
  error?: string;
  code?: string;
  sendingEnabled?: false;
};

const NEW_GREETING =
  "اختار قائمة العملاء من فوق واكتب رسالتك، أو اكتب طلب كامل بطريقتك. مفيش أي إرسال قبل التأكيد.";

export function LabelCampaignChat() {
  const [turns, setTurns] = useState<ChatTurn[]>([{ role: "agent", text: NEW_GREETING }]);
  const [input, setInput] = useState("");
  const [selectedLabel, setSelectedLabel] = useState<MirroredWhatsAppLabel | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const [drafts, setDrafts] = useState<CampaignDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);
  const logRef = useRef<HTMLDivElement | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/whatsapp/label-campaigns", { cache: "no-store" });
    const data = (await res.json().catch(() => ({}))) as ApiPayload;
    if (!res.ok || !Array.isArray(data.drafts) || data.sendingEnabled !== false) {
      throw new Error(mapUserFacingError(data, "مش قادرين نعرض مسودات الحملات حاليًا."));
    }
    if (alive.current) setDrafts(data.drafts);
  }, []);

  useEffect(() => {
    alive.current = true;
    void refresh().catch(() => {
      if (alive.current) setError("مش قادرين نعرض المسودات حاليًا. تقدر تعيد المحاولة.");
    }).finally(() => { if (alive.current) setLoading(false); });
    return () => { alive.current = false; };
  }, [refresh]);

  useEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTo({ top: log.scrollHeight, behavior: "smooth" });
  }, [turns, drafts, busy]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = input.trim();
    if (busy || (selectedLabel ? text.length < 4 : text.length < 12)) return;
    const payload = selectedLabel ? {
      channelConnectionId: selectedLabel.channelConnectionId,
      labelId: selectedLabel.id,
      messageText: text,
    } : { text };
    setBusy(true);
    setError(null);
    setInput("");
    setTurns(previous => [...previous, { role: "owner", text: selectedLabel ? `إلى ${selectedLabel.name}: ${text}` : text }]);
    try {
      const res = await fetch("/api/whatsapp/label-campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as ApiPayload;
      if (!res.ok || !Array.isArray(data.drafts)) {
        throw new Error(mapUserFacingError(data, "مش قادر أجهز المسودة. وضّح اسم القائمة ونص الرسالة."));
      }
      setDrafts(previous => [...data.drafts!, ...previous].slice(0, 25));
      setSelectedLabel(null);
      setTurns(previous => [...previous, {
        role: "agent",
        text: data.drafts!.length === 1
          ? "جهزت مسودة للقائمة. راجع الرسالة تحت، ولو حابب عدّلها أو اعتمد صياغتها."
          : `جهزت ${data.drafts!.length} مسودات للقوائم اللي ذكرتها. راجع كل رسالة قبل الاعتماد.`,
      }]);
    } catch (err) {
      const message = err instanceof Error ? err.message : "تعذر تجهيز المسودة.";
      setInput(text);
      setTurns(previous => [...previous, { role: "agent", text: message }]);
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
    try {
      const res = await fetch("/api/whatsapp/label-campaigns/" + draft.draftId, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action === "cancel" ? { action } : { action, messageText }),
      });
      const data = (await res.json().catch(() => ({}))) as ApiPayload;
      if (!res.ok || !data.draft || data.sendingEnabled !== false) {
        throw new Error(mapUserFacingError(data, "تعذر تحديث المسودة. حدّث الصفحة وحاول تاني."));
      }
      setDrafts(previous => previous.map(item =>
        item.draftId === draft.draftId ? data.draft! : item));
      setEditId(null);
      setTurns(previous => [...previous, {
        role: "agent",
        text: action === "approve_copy"
          ? `اعتمدت صياغة رسالة ${draft.labelName} ✅ ده اعتماد للنص فقط، ومفيش رسائل اتبعتت.`
          : action === "cancel" ? `لغيت مسودة ${draft.labelName}.`
            : `حفظت تعديل رسالة ${draft.labelName}. تقدر تراجعها دلوقتي.`,
      }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "حصل خطأ أثناء تحديث المسودة.");
    } finally {
      if (alive.current) setBusy(false);
    }
  }

  return (
    <section aria-label="محادثة حملات القوائم"
      className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <header className="shrink-0 border-b border-border px-4 py-3">
        <h2 className="text-sm font-black">رسائل قوائم واتساب</h2>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          اختار قائمة عملائك، اكتب الرسالة، وراجعها قبل تأكيد الإرسال.
        </p>
      </header>

      <div className="shrink-0 px-3 pt-3 sm:px-4">
        <CampaignLabelPicker onPick={label => {
          setSelectedLabel(label);
          composerRef.current?.focus();
        }} />
      </div>

      <div ref={logRef} role="log" aria-label="رسائل تجهيز الحملات"
        className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain bg-surface/25 px-3 py-4 sm:px-5">
        {turns.map((turn, i) => (
          <div key={i} className={"flex " + (turn.role === "owner" ? "justify-end" : "justify-start")}>
            <p dir="auto" className={"max-w-[90%] whitespace-pre-wrap break-words rounded-2xl px-4 py-3 text-sm leading-7 sm:max-w-[78%] " +
              (turn.role === "owner" ? "rounded-tr-md bg-primary/10" : "rounded-tl-md border border-border bg-card")}>
              {turn.text}
            </p>
          </div>
        ))}

        {loading ? <p role="status" className="text-xs text-muted-foreground">بنراجع المسودات السابقة…</p> : null}
        {drafts.filter(d => d.status !== "CANCELLED").length > 0 ? (
          <div className="space-y-2 pt-2">
            <p className="px-1 text-xs font-bold text-muted-foreground">المسودات المحفوظة</p>
            {drafts.filter(d => d.status !== "CANCELLED").map(draft => (
              <article key={draft.draftId}
                className="space-y-3 rounded-2xl border border-border bg-card p-3 sm:p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-black">{draft.labelName}</h3>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {draft.observedContacts.toLocaleString("ar-EG")} عميل مرصود • العدد قد يكون جزئيًا
                    </p>
                  </div>
                  <span className="rounded-full bg-surface px-2 py-1 text-[11px] font-bold text-muted-foreground">
                    {draft.status === "COPY_APPROVED" ? "الصياغة معتمدة" : "مسودة"}
                  </span>
                </div>
                {editId === draft.draftId ? (
                  <div className="space-y-2">
                    <textarea aria-label={"تعديل رسالة " + draft.labelName}
                      value={editText} maxLength={3000} rows={4}
                      onChange={event => setEditText(event.target.value)}
                      className="w-full resize-y rounded-xl border border-border bg-surface px-3 py-2 text-sm leading-7 outline-none focus:border-primary" />
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" disabled={busy || editText.trim().length < 4}
                        onClick={() => void updateDraft(draft, "update")}>حفظ التعديل</Button>
                      <Button size="sm" variant="outline" disabled={busy}
                        onClick={() => setEditId(null)}>إلغاء</Button>
                    </div>
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap break-words rounded-xl bg-surface/65 p-3 text-sm leading-7">
                    {draft.messageText}
                  </p>
                )}
                <p className="text-[11px] leading-5 text-muted-foreground">
                  القائمة متزامنة جزئيًا. اعتماد الصياغة لا يرسل أي رسالة.
                </p>
                {editId !== draft.draftId ? (
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" disabled={busy}
                      onClick={() => setPreviewId(previous => previous === draft.draftId ? null : draft.draftId)}>
                      {previewId === draft.draftId ? "إخفاء الجمهور" : "معاينة الجمهور"}
                    </Button>
                    {draft.status !== "COPY_APPROVED" ? (
                      <Button size="sm" disabled={busy} onClick={() => void updateDraft(draft, "approve_copy")}>
                        اعتماد الصياغة
                      </Button>
                    ) : null}
                    <Button size="sm" variant="outline" disabled={busy}
                      onClick={() => { setEditId(draft.draftId); setEditText(draft.messageText); }}>
                      تعديل
                    </Button>
                    <Button size="sm" variant="ghost" disabled={busy}
                      onClick={() => void updateDraft(draft, "cancel")}>إلغاء المسودة</Button>
                  </div>
                ) : null}
                {previewId === draft.draftId ? <LabelCampaignAudiencePreview draftId={draft.draftId} /> : null}
                {draft.status === "COPY_APPROVED" && editId !== draft.draftId
                  ? <LabelCampaignPreflight draftId={draft.draftId} messageText={draft.messageText} />
                  : null}
              </article>
            ))}
          </div>
        ) : !loading ? (
          <p className="text-xs text-muted-foreground">مفيش مسودات محفوظة لسه.</p>
        ) : null}

        {busy ? <p role="status" className="text-xs text-muted-foreground">براجع طلبك…</p> : null}
      </div>
      {error ? <div className="px-3 pt-2"><Alert variant="warning">{error}</Alert></div> : null}
      <form onSubmit={event => void submit(event)} className="shrink-0 border-t border-border p-3">
        {selectedLabel ? (
          <div className="mb-2 flex items-center gap-2 text-xs">
            <span className="rounded-full bg-primary/10 px-3 py-1.5 font-bold text-primary">إلى قائمة: {selectedLabel.name}</span>
            <button type="button" onClick={() => setSelectedLabel(null)}
              className="font-semibold text-muted-foreground underline">تغيير القائمة</button>
          </div>
        ) : null}
        <div className="flex items-end gap-2">
          <textarea ref={composerRef} aria-label={selectedLabel ? "اكتب رسالة القائمة" : "اكتب طلب الحملة"}
            value={input} maxLength={selectedLabel ? 3000 : 4000} rows={2}
            placeholder={selectedLabel ? "اكتب الرسالة اللي عايز تبعتها لعملاء القائمة…" : "أو اكتب طلب زي: ابعت للناس اللي في VIP إن فيه عرض جديد…"}
            onChange={event => setInput(event.target.value)}
            className="min-h-[62px] flex-1 resize-none rounded-xl border border-border bg-surface px-3 py-2 text-sm leading-6 outline-none focus:border-primary" />
          <Button type="submit" disabled={busy || input.trim().length < (selectedLabel ? 4 : 12)}>تجهيز</Button>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          تقدر تختار قائمة من فوق أو تكتب طلبك بطريقتك. مفيش إرسال إلا بعد مراجعة الرسالة وتأكيد الحملة.
        </p>
      </form>
    </section>
  );
}
