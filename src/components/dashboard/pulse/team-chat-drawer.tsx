"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { mapUserFacingError } from "@/lib/ui/user-errors";
import type { HumanOwnedChat } from "@/modules/ai/human-ownership";

type TeamMessage = {
  messageId: string;
  direction: "INBOUND" | "OUTBOUND";
  origin: "CUSTOMER" | "AI" | "HUMAN" | "SYSTEM" | "UNKNOWN";
  contentType: string;
  textContent: string | null;
  receivedAtUtc: string;
  providerTimestampUtc: string | null;
  actorName: string | null;
};
type AiState = { mode: "AUTO" | "HUMAN_PAUSED" | "SAFETY_PAUSED"; pauseReason: string | null };
type Escalation = { id: string; status: string; reason: string; phase: string; lastHumanReplyAtUtc: string | null };
type ReplyResult = { status?: string; code?: string; error?: string };
type ResumeResult = {
  state?: AiState;
  catchUp?: { scheduled: boolean; pendingCount: number; reason?: string };
  error?: string;
};

function friendly(data: { error?: string; code?: string }, fallback: string) {
  return mapUserFacingError(data, fallback);
}

function messageContent(message: TeamMessage) {
  if (message.textContent?.trim()) return message.textContent;
  const labels: Record<string, string> = {
    IMAGE: "صورة", AUDIO: "رسالة صوتية", VIDEO: "فيديو", DOCUMENT: "مستند",
    STICKER: "ملصق", LOCATION: "موقع", CONTACT: "جهة اتصال",
  };
  return labels[message.contentType] ?? "رسالة غير نصية — افتح الشات الكامل لعرضها";
}

function timeOf(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("ar-EG", {
    hour: "numeric", minute: "2-digit", timeZone: "Africa/Cairo",
  });
}

export function TeamChatDrawer({
  chat, businessId, onClose, onChanged,
}: {
  chat: HumanOwnedChat;
  businessId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [messages, setMessages] = useState<TeamMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusReady, setStatusReady] = useState(false);
  const [aiState, setAiState] = useState<AiState | null>(null);
  const [escalation, setEscalation] = useState<Escalation | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [showResolveConfirmation, setShowResolveConfirmation] = useState(false);
  const [handoffDone, setHandoffDone] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const pendingSend = useRef<{ text: string; key: string } | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const alive = useRef(true);
  const savingRef = useRef(false);

  const base = "/api/inbox/conversations/" + encodeURIComponent(chat.conversationId);
  const fullChat = "/dashboard/inbox?businessId=" + encodeURIComponent(businessId)
    + "&conversationId=" + encodeURIComponent(chat.conversationId);

  const fetchStatus = useCallback(async () => {
    const [aiResponse, escalationResponse] = await Promise.all([
      fetch(base + "/ai", { credentials: "same-origin", cache: "no-store" }),
      fetch(base + "/escalation", { credentials: "same-origin", cache: "no-store" }),
    ]);
    const aiBody = await aiResponse.json() as { state?: AiState; error?: string };
    const escalationBody = await escalationResponse.json() as { escalation?: Escalation | null; error?: string };
    if (!aiResponse.ok || !aiBody.state || !escalationResponse.ok) {
      throw new Error(friendly(
        { error: aiBody.error || escalationBody.error },
        "تعذر التحقق من ملكية المحادثة. مش هنرجّع البوت قبل التأكد من الحالة.",
      ));
    }
    if (alive.current) {
      setAiState(aiBody.state);
      setEscalation(escalationBody.escalation ?? null);
      setStatusReady(true);
    }
    return { ai: aiBody.state, escalation: escalationBody.escalation ?? null };
  }, [base]);

  const fetchMessages = useCallback(async (initial = false) => {
    const response = await fetch(base + "/messages?limit=60", {
      credentials: "same-origin", cache: "no-store",
    });
    const body = await response.json() as { messages?: TeamMessage[]; error?: string };
    if (!response.ok) throw new Error(friendly(body, "تعذر تحميل رسائل العميل"));
    if (!alive.current) return;
    setMessages(body.messages ?? []);
    if (initial) requestAnimationFrame(() => {
      if (alive.current && scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    });
  }, [base]);

  useEffect(() => {
    alive.current = true;
    triggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    void Promise.allSettled([fetchMessages(true), fetchStatus()]).then(results => {
      if (!alive.current) return;
      for (const result of results) {
        if (result.status === "rejected") setError(result.reason instanceof Error ? result.reason.message : "تعذر تحديث المحادثة");
      }
      setLoading(false);
    });
    const timer = window.setInterval(() => {
      if (document.hidden || !alive.current || savingRef.current) return;
      void fetchMessages().catch(() => undefined);
      void fetchStatus().catch(() => {
        if (alive.current) setStatusReady(false);
      });
    }, 8_000);
    return () => {
      alive.current = false;
      window.clearInterval(timer);
      document.body.style.overflow = previousOverflow;
      triggerRef.current?.focus();
    };
  }, [fetchMessages, fetchStatus]);

  const dismiss = useCallback(() => {
    if ((draft.trim() || uncertain) && !window.confirm(
      "فيه رسالة لسه مش متأكدين إنها اتبعت. تقفل الشات وتحتفظ بالمتابعة مع الفريق؟",
    )) return;
    onClose();
  }, [draft, uncertain, onClose]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (showResolveConfirmation) setShowResolveConfirmation(false);
      else dismiss();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [showResolveConfirmation, dismiss]);

  async function send() {
    const text = draft.trim();
    if (!text || sending || saving || uncertain || handoffDone) return;
    const kept = pendingSend.current;
    const key = kept?.text === text ? kept.key : crypto.randomUUID();
    pendingSend.current = { text, key };
    setSending(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(base + "/messages", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, idempotencyKey: key }),
      });
      const result = await response.json() as ReplyResult;
      if (result.status === "AMBIGUOUS") {
        setUncertain(true);
        throw new Error("حالة إرسال الرسالة غير مؤكدة. افتح الشات الكامل واتأكد قبل أي إعادة إرسال.");
      }
      if (!response.ok || !["SENT", "DUPLICATE"].includes(result.status ?? "")) {
        throw new Error(friendly(result, "الإرسال فشل. الرسالة لسه في المسودة."));
      }
      pendingSend.current = null;
      setDraft("");
      setNotice("الرد اتسجل. المحادثة لسه مع الفريق لحد ما تأكد إن الموضوع اتحل.");
      // Message delivery is already confirmed. A refresh failure must not
      // re-label the successfully sent message as a failed send.
      onChanged();
      void Promise.allSettled([fetchMessages(), fetchStatus()]);
      requestAnimationFrame(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر إرسال الرسالة");
    } finally {
      if (alive.current) setSending(false);
    }
  }

  async function resolveAndReturnToAi() {
    if (saving || sending || !statusReady || handoffDone) return;
    savingRef.current = true;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      // Re-check authoritative state, not the Home preview or an old popup snapshot.
      const fresh = await fetchStatus();
      if (fresh.ai.mode === "SAFETY_PAUSED") {
        throw new Error("المحادثة متوقفة لأسباب أمان. راجعها من صندوق المحادثات قبل إعادة تشغيل البوت.");
      }

      if (fresh.escalation) {
        const response = await fetch(base + "/escalation", {
          method: "PATCH", credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "RESOLVED" }),
        });
        const data = await response.json() as { error?: string; code?: string };
        if (!response.ok) throw new Error(friendly(data,
          "تعذر إغلاق التصعيد. لازم صاحب البيزنس أو الأدمن يأكد الحل."));
        setEscalation(null);
      }

      // These are deliberately separate server actions. If resume fails after
      // resolving the escalation, do not claim that AI is active.
      const resume = await fetch(base + "/ai/resume", {
        method: "POST", credentials: "same-origin",
      });
      const result = await resume.json() as ResumeResult;
      if (!resume.ok || result.state?.mode !== "AUTO") {
        throw new Error(friendly(result, "تم تحديث المتابعة لكن إرجاع البوت لم يتأكد. راجع حالة الشات."));
      }
      const verified = await fetchStatus();
      if (verified.ai.mode !== "AUTO" || verified.escalation) {
        throw new Error("البوت اتطلب تشغيله لكن ظهر تصعيد جديد أو الحالة اتغيرت. راجع آخر رسالة قبل تسليمه.");
      }
      setAiState(result.state);
      setHandoffDone(true);
      setShowResolveConfirmation(false);
      setNotice(result.catchUp?.scheduled
        ? "تم إرجاع الشات للبوت. فيه رد على رسالة معلّقة اتجدول ولسه بننتظر تأكيد إرساله."
        : result.catchUp?.reason === "AI_DISABLED"
          ? "تم تسليم المحادثة للبوت، لكن الردود التلقائية مقفولة من إعدادات الرقم."
          : "تم إغلاق المتابعة وإرجاع المحادثة للبوت. هيتعامل مع الرسائل الجديدة حسب إعداداتك.");
      onChanged();
    } catch (cause) {
      setShowResolveConfirmation(false);
      setError(cause instanceof Error ? cause.message : "تعذر إكمال التسليم للبوت");
      // Re-fetch real state so UI can safely retry if resolution partially succeeded.
      void fetchStatus().catch(() => setStatusReady(false));
      onChanged();
    } finally {
      savingRef.current = false;
      if (alive.current) setSaving(false);
    }
  }

  const ownedByTeam = aiState?.mode === "HUMAN_PAUSED";
  const needsAttention = chat.waitingForTeam;
  const botBlockedForSafety = aiState?.mode === "SAFETY_PAUSED";

  return (
    <div className="fixed inset-0 z-[130] pointer-events-none" dir="rtl">
      <div className="pointer-events-auto absolute inset-0 bg-black/45 sm:bg-black/20"
        aria-hidden="true" onClick={dismiss} />
      <section role="dialog" aria-modal="true" aria-label={"محادثة " + chat.name}
        className="pointer-events-auto absolute inset-y-0 right-0 flex w-full max-w-[480px] flex-col overflow-hidden border-l border-border bg-card shadow-2xl sm:inset-y-auto sm:bottom-5 sm:right-5 sm:h-[min(760px,calc(100dvh-40px))] sm:rounded-[24px] sm:border">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-full bg-primary/10 text-base font-bold text-primary">
              {chat.name.trim().charAt(0).toUpperCase() || "؟"}
            </span>
            <div className="min-w-0">
              <h2 dir="auto" className="truncate text-sm font-bold">{chat.name}</h2>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {handoffDone || (!ownedByTeam && !escalation && statusReady) ? "الموظف الذكي استلم المحادثة"
                  : botBlockedForSafety ? "متوقف لأسباب أمان"
                    : needsAttention ? "مستني رد من الفريق" : "مع الفريق · متابعة جارية"}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Link href={fullChat} title="افتح الشات الكامل"
              className="rounded-xl px-2 py-2 text-[11px] font-bold text-primary hover:bg-primary/10">
              الشات الكامل ↗
            </Link>
            <button ref={closeRef} type="button" aria-label="إغلاق الشات"
              onClick={dismiss} className="grid size-10 place-items-center rounded-full bg-surface text-xl text-muted-foreground hover:text-foreground">×</button>
          </div>
        </header>
        <div className="shrink-0 border-b border-border bg-surface/60 px-4 py-2.5 text-[11px] leading-5 text-muted-foreground">
          {escalation ? "فيه حالة تدخل بشري مفتوحة" :
            botBlockedForSafety ? "إيقاف الأمان يمنع التسليم التلقائي" :
              ownedByTeam ? "البوت متوقف عن الرد على المحادثة دي لحد التسليم" :
                "حالة ملكية المحادثة بتتحدث مباشرة من النظام"}
        </div>
        <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-background/70 px-4 py-4" aria-live="polite" aria-label="رسائل العميل">
          {loading ? <p className="py-10 text-center text-xs text-muted-foreground">بنحمّل المحادثة...</p> : null}
          {!loading && messages.length === 0 ? <p className="py-10 text-center text-xs text-muted-foreground">مفيش رسائل متاحة. افتح الشات الكامل للمراجعة.</p> : null}
          {messages.map(message => (
            <div key={message.messageId} className={"flex " + (message.direction === "OUTBOUND" ? "justify-start" : "justify-end")}>
              <div className={"max-w-[88%] rounded-2xl px-3 py-2 shadow-sm " + (message.direction === "OUTBOUND"
                ? "rounded-tr-sm bg-primary/10 text-foreground" : "rounded-tl-sm border border-border bg-card")}>
                <p dir="auto" className="whitespace-pre-wrap break-words text-[13px] leading-6">{messageContent(message)}</p>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  {message.origin === "HUMAN" ? "الفريق · " : message.origin === "AI" ? "الموظف الذكي · " : ""}
                  {timeOf(message.providerTimestampUtc || message.receivedAtUtc)}
                </p>
              </div>
            </div>
          ))}
        </div>
        <footer className="shrink-0 space-y-3 border-t border-border bg-card px-3 py-3 sm:px-4">
          {error ? <p role="alert" className="rounded-xl bg-warning-soft px-3 py-2 text-xs leading-6 text-warning">{error}</p> : null}
          {notice ? <p role="status" className="rounded-xl bg-success-soft px-3 py-2 text-xs leading-6 text-success">{notice}</p> : null}
          {!handoffDone ? (
            <>
              <div className="flex items-end gap-2">
                <textarea aria-label="اكتب ردك للعميل" placeholder="اكتب ردك للعميل..." rows={2} maxLength={4000}
                  value={draft} onChange={event => {
                    setDraft(event.target.value);
                    if (pendingSend.current?.text !== event.target.value.trim()) pendingSend.current = null;
                  }}
                  onKeyDown={event => {
                    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                      event.preventDefault();
                      void send();
                    }
                  }}
                  className="min-h-12 min-w-0 flex-1 resize-none rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20"
                />
                <button type="button" onClick={() => void send()} disabled={!draft.trim() || sending || saving || uncertain}
                  className="min-h-11 shrink-0 rounded-xl bg-primary px-4 text-xs font-bold text-primary-foreground disabled:opacity-45">
                  {sending ? "جارٍ الإرسال..." : "إرسال"}
                </button>
              </div>
              <div className="border-t border-border/70 pt-3">
                <p className="mb-2 text-xs font-bold">هل موضوع العميل اتحل؟</p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={dismiss} disabled={saving || sending}
                    className="min-h-11 flex-1 rounded-xl border border-border px-3 text-xs font-semibold text-foreground hover:bg-surface">
                    لسه محتاجة متابعة
                  </button>
                  <button type="button" onClick={() => setShowResolveConfirmation(true)}
                    disabled={!statusReady || saving || sending || botBlockedForSafety || Boolean(draft.trim()) || uncertain}
                    className="min-h-11 flex-1 rounded-xl bg-primary px-3 text-xs font-bold text-primary-foreground disabled:opacity-45">
                    اتحلت · رجّع للبوت
                  </button>
                </div>
                {draft.trim() ? <p className="mt-2 text-[10px] text-muted-foreground">ابعت المسودة أو امسحها قبل تسليم المحادثة.</p> : null}
                {botBlockedForSafety ? <p className="mt-2 text-[10px] text-warning">محتاج مراجعة إيقاف الأمان من الشات الكامل.</p> : null}
              </div>
            </>
          ) : (
            <button type="button" onClick={onClose}
              className="w-full min-h-11 rounded-xl bg-primary text-xs font-bold text-primary-foreground">تمام، إغلاق</button>
          )}
        </footer>
      </section>
      {showResolveConfirmation ? (
        <div className="pointer-events-auto absolute inset-0 z-10 grid place-items-center bg-black/60 p-4">
          <section role="alertdialog" aria-modal="true" aria-label="تأكيد حل المشكلة وإرجاع البوت"
            className="w-full max-w-sm rounded-[24px] border border-border bg-card p-5 shadow-2xl">
            <h3 className="text-base font-bold">اتأكدت إن مشكلة العميل اتحلت؟</h3>
            <p className="mt-3 text-xs leading-7 text-muted-foreground">
              هنقفل حالة التدخل البشري لو مفتوحة، وبعدها نسلّم الشات للموظف الذكي.
              ممكن البوت يرد على رسالة عميل معلّقة بعد التسليم، مش مجرد الرسائل الجديدة.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <button type="button" disabled={saving} onClick={() => void resolveAndReturnToAi()}
                className="min-h-11 flex-1 rounded-xl bg-primary px-4 text-xs font-bold text-primary-foreground disabled:opacity-50">
                {saving ? "جارٍ تأكيد التسليم..." : "أيوه، اتحلت ورجّع البوت"}
              </button>
              <button type="button" disabled={saving} onClick={() => setShowResolveConfirmation(false)}
                className="min-h-11 rounded-xl border border-border px-4 text-xs font-bold">لسه متابعة</button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
