"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { mapUserFacingError } from "@/lib/ui/user-errors";
import type { PulseReview } from "@/modules/pulse/report";

type ChatMessage = {
  messageId: string;
  direction: "INBOUND" | "OUTBOUND";
  origin: "CUSTOMER" | "AI" | "HUMAN" | "SYSTEM" | "UNKNOWN";
  contentType: string;
  textContent: string | null;
  providerTimestampUtc: string | null;
  receivedAtUtc: string;
  actorName: string | null;
};

const clock = (date: string | null) => {
  if (!date) return "";
  const value = new Date(date);
  return Number.isNaN(value.getTime()) ? "" : new Intl.DateTimeFormat("ar-EG", {
    hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Africa/Cairo",
  }).format(value);
};
const briefError = (data: {error?: string;code?: string}, fallback: string) =>
  mapUserFacingError(data, fallback);

function messageText(m: ChatMessage): string {
  if (m.textContent?.trim()) return m.textContent;
  const names: Record<string, string> = {
    IMAGE: "صورة", AUDIO: "رسالة صوتية", VIDEO: "فيديو",
    DOCUMENT: "مستند", STICKER: "ملصق",
  };
  return names[m.contentType] || "محتوى غير نصّي — اعرضه في صندوق المحادثات";
}

export function ReviewChatPopup({
  item, onClose, onHandled, onResolved,
}: {
  item: PulseReview;
  onClose: () => void;
  onHandled: (item: PulseReview) => void;
  onResolved: (item: PulseReview) => void;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [delivered, setDelivered] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [quotaBlocked, setQuotaBlocked] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const handledRef = useRef(false);
  const pendingSendRef = useRef<{text:string;key:string}|null>(null);
  const originRef = useRef<HTMLButtonElement | null>(null);

  // The outbound observation engine also sees staff replies made on the
  // WhatsApp phone. Only a verified HUMAN message newer than the request
  // removes the review from the needs-reply queue.
  const load = useCallback(async (initial = false) => {
    try {
      const response = await fetch(
        "/api/inbox/conversations/" + encodeURIComponent(item.conversationId) + "/messages?limit=60",
        { credentials: "same-origin", cache: "no-store" },
      );
      const data = await response.json() as { messages?: ChatMessage[]; error?: string };
      if (!response.ok) throw new Error(data.error || "تعذر تحميل الرسائل");
      const next = data.messages ?? [];
      setMessages(next);
      if (!handledRef.current && next.some(m =>
        m.direction === "OUTBOUND" && m.origin === "HUMAN" &&
        new Date(m.providerTimestampUtc || m.receivedAtUtc).getTime() >= new Date(item.at).getTime()
      )) {
        handledRef.current = true;
        setDelivered(true);
        onHandled(item);
      }
      // An outbound phone observation can update the follow-up even before
      // the phone's sent message is mirrored into the DRVO message table.
      // Consult the persisted action state, not just chat bubbles.
      if (!handledRef.current) {
        const params = new URLSearchParams({
          conversationId: item.conversationId,
          kind: item.kind,
          ...(item.kind === "SIGNAL" ? { intent: item.intent } : {}),
        });
        try {
          const stateResponse = await fetch("/api/pulse/review-state?" + params.toString(), {
            credentials: "same-origin", cache: "no-store",
          });
          if (stateResponse.ok) {
            const state = await stateResponse.json() as {needsReply?:boolean;inProgress?:boolean};
            if (state.inProgress && !state.needsReply && !handledRef.current) {
              handledRef.current = true;
              setDelivered(true);
              onHandled(item);
            }
          }
        } catch { /* Unavailable status checks never alter server-side state. */ }
      }
      if (initial) requestAnimationFrame(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      });
    } catch (e) {
      if (initial) setError(e instanceof Error ? e.message : "تعذر تحميل المحادثة");
    } finally {
      if (initial) setLoading(false);
    }
  }, [item, onHandled]);

  useEffect(() => {
    originRef.current = document.activeElement instanceof HTMLButtonElement
      ? document.activeElement : null;
    void load(true);
    inputRef.current?.focus();
    const timer = window.setInterval(() => {
      if (!document.hidden) void load();
    }, 6000);
    return () => { window.clearInterval(timer); originRef.current?.focus(); };
  }, [load]);

  useEffect(() => {
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (confirmClose) setConfirmClose(false);
        else setConfirmClose(true);
      }
    };
    window.addEventListener("keydown", onEscape, true);
    return () => window.removeEventListener("keydown", onEscape, true);
  }, [confirmClose]);

  async function sendReply() {
    const text = draft.trim();
    if (!text || sending || uncertain) return;
    const pending = pendingSendRef.current;
    const key = pending && pending.text === text ? pending.key : crypto.randomUUID();
    pendingSendRef.current = { text, key };
    setSending(true);
    setError("");
    setQuotaBlocked(false);
    try {
      const response = await fetch(
        "/api/inbox/conversations/" + encodeURIComponent(item.conversationId) + "/messages",
        {
          method: "POST", credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, idempotencyKey: key }),
        },
      );
      const data = await response.json() as {status?:string;code?:string;error?:string};
      if (data.status === "AMBIGUOUS") {
        setUncertain(true);
        throw new Error("نتيجة إرسال الرسالة غير مؤكدة. افتح المحادثة الكاملة وتأكد قبل إعادة الإرسال.");
      }
      if (!response.ok || !["SENT","DUPLICATE"].includes(data.status ?? "")) {
        if (data.code?.includes("QUOTA_EXCEEDED")) setQuotaBlocked(true);
        throw new Error(briefError(data, "تعذر إرسال الرد. الرسالة محفوظة في المسودة."));
      }
      pendingSendRef.current = null;
      setDraft("");
      setDelivered(true);
      if (!handledRef.current) {
        handledRef.current = true;
        onHandled(item);
      }
      await load();
      if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر إرسال الرد");
    } finally { setSending(false); }
  }

  async function resolveCase() {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const url = item.kind === "ESCALATION"
        ? "/api/inbox/conversations/" + encodeURIComponent(item.conversationId) + "/escalation"
        : "/api/pulse/review";
      const response = await fetch(url, {
        method: item.kind === "ESCALATION" ? "PATCH" : "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item.kind === "ESCALATION"
          ? {status: "RESOLVED"}
          : {conversationId: item.conversationId, intent: item.intent}),
      });
      const data = await response.json() as {error?:string;code?:string};
      if (!response.ok) throw new Error(briefError(data, "تعذر تأكيد حل المشكلة. راجع صلاحيات الحساب."));
      onResolved(item);
      setConfirmClose(false);
      router.refresh();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر حفظ حالة المتابعة");
    } finally { setSaving(false); }
  }

  const inboxUrl = "/dashboard/inbox?conversationId=" + encodeURIComponent(item.conversationId);
  return (
    <div className="pointer-events-none fixed inset-0 z-[130]" dir="rtl">
      <div className="pointer-events-auto absolute inset-0 bg-black/45 sm:hidden"
        onClick={() => setConfirmClose(true)} aria-hidden="true" />
      <section role="dialog" aria-modal="false" aria-label={"محادثة " + item.name}
        className="pointer-events-auto absolute inset-x-0 bottom-0 top-0 flex flex-col overflow-hidden border border-border bg-card shadow-[0_24px_80px_-20px_rgba(0,0,0,.42)] sm:inset-x-auto sm:top-auto sm:bottom-5 sm:left-5 sm:h-[min(670px,calc(100dvh-45px))] sm:w-[410px] sm:rounded-[22px]">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/10 text-base font-black text-primary">
              {item.name.trim().charAt(0).toUpperCase() || "؟"}
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-sm font-black" dir="auto">{item.name}</h2>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {delivered ? "رد الفريق اتسجل · جاري المتابعة" : "محتاج رد من الفريق"}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Link href={inboxUrl} title="افتح في صندوق المحادثات"
              className="rounded-lg px-2.5 py-2 text-[11px] font-black text-primary hover:bg-primary/10">الشات الكامل ↗</Link>
            <button type="button" onClick={() => setConfirmClose(true)} aria-label="إغلاق المحادثة"
              className="grid h-9 w-9 place-items-center rounded-full bg-surface text-xl text-muted-foreground hover:text-foreground">×</button>
          </div>
        </header>
        <div className="shrink-0 border-b border-border/60 bg-surface/60 px-4 py-2 text-xs text-muted-foreground">
          {delivered ? "تم الرد. الحالة خارج قائمة «محتاجة رد» لكن لسه مفتوحة للمتابعة." :
            "اقرأ طلب العميل، ورد عليه من هنا. الرد الناجح بيحدث المتابعة تلقائيًا."}
        </div>
        <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-background/65 px-3 py-4"
          aria-live="polite" aria-label="رسائل المحادثة">
          {loading ? <p className="py-10 text-center text-sm text-muted-foreground">بنحمّل المحادثة...</p> : null}
          {!loading && !messages.length ? <p className="py-10 text-center text-xs text-muted-foreground">مفيش رسائل محفوظة للعرض. ممكن تراجع الشات الكامل.</p> : null}
          {messages.map(m => (
            <div key={m.messageId} className={"flex " + (m.direction === "OUTBOUND" ? "justify-start" : "justify-end")}>
              <div className={"max-w-[88%] rounded-2xl px-3 py-2 shadow-sm " +
                (m.direction === "OUTBOUND"
                  ? "rounded-tr-sm bg-primary/10 text-foreground"
                  : "rounded-tl-sm border border-border bg-card")}>
                <p dir="auto" className="whitespace-pre-wrap break-words text-[13px] leading-6">{messageText(m)}</p>
                <p className="mt-1 text-[10px] text-muted-foreground" dir="rtl">
                  {m.origin === "HUMAN" ? "الفريق · " : m.origin === "AI" ? "الموظف الذكي · " : ""}
                  {clock(m.providerTimestampUtc || m.receivedAtUtc)}
                </p>
              </div>
            </div>
          ))}
        </div>
        <div className="shrink-0 border-t border-border bg-card p-3">
          {error ? <p role="alert" className="mb-2 rounded-lg bg-warning-soft p-2 text-xs leading-6 text-warning">{error}{quotaBlocked ? <Link href="/dashboard/billing" className="mr-2 font-black underline underline-offset-2">راجع حدود الباقة</Link> : null}</p> : null}
          <div className="flex items-end gap-2">
            <textarea ref={inputRef} rows={2} maxLength={4000} value={draft}
              onChange={e => {
                setDraft(e.target.value);
                if (pendingSendRef.current?.text !== e.target.value.trim()) pendingSendRef.current = null;
              }}
              onKeyDown={e => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void sendReply();
                }
              }}
              placeholder="اكتب ردك للعميل..." aria-label="اكتب ردك للعميل"
              className="min-h-[48px] max-h-32 min-w-0 flex-1 resize-none rounded-xl border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-primary"
            />
            <button type="button" disabled={sending || !draft.trim() || uncertain}
              onClick={() => void sendReply()}
              className="min-h-11 shrink-0 rounded-xl bg-primary px-4 text-xs font-black text-primary-foreground disabled:opacity-50">
              {sending ? "جارٍ الإرسال..." : "إرسال"}
            </button>
          </div>
          <p className="mt-2 text-[10px] text-muted-foreground">Enter للإرسال · Shift + Enter لسطر جديد · بنحتفظ بمسودتك لو الإرسال فشل</p>
        </div>
      </section>

      {confirmClose ? (
        <div className="pointer-events-auto absolute inset-0 z-10 flex items-center justify-center bg-black/50 p-4">
          <div role="alertdialog" aria-modal="true" aria-label="تأكيد حل المشكلة"
            className="w-full max-w-sm rounded-[22px] border border-border bg-card p-5 shadow-2xl">
            <h3 className="text-base font-black">هل تم حل مشكلة العميل؟</h3>
            <p className="mt-2 text-xs leading-6 text-muted-foreground">
              الرد على العميل بيشيل طلب الرد الجديد تلقائيًا، لكنه مش معناه إن المشكلة اتحلت. اختار حالة المتابعة قبل ما تقفل الشات.
            </p>
            {error ? <p role="alert" className="mt-3 text-xs text-warning">{error}</p> : null}
            <div className="mt-5 flex flex-wrap gap-2">
              <button type="button" onClick={() => void resolveCase()} disabled={saving}
                className="rounded-xl bg-primary px-4 py-2.5 text-xs font-black text-primary-foreground disabled:opacity-50">
                {saving ? "جارٍ الحفظ..." : "أيوه، اتحلت"}
              </button>
              <button type="button" onClick={() => {setConfirmClose(false);onClose();}} disabled={saving}
                className="rounded-xl border border-border px-3 py-2.5 text-xs font-bold">لسه متابعة · إغلاق</button>
              <button type="button" onClick={() => {setConfirmClose(false);setError("");}} disabled={saving}
                className="rounded-xl px-3 py-2.5 text-xs text-muted-foreground hover:bg-surface">رجوع للشات</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
