"use client";

import { useCallback, useState, useTransition } from "react";

export type ConversationAiMode = "AUTO" | "HUMAN_PAUSED" | "SAFETY_PAUSED";

export type ConversationRow = {
  conversationId: string;
  contactExternalKey: string;
  contactDisplayName: string | null;
  contactPhoneNormalized: string | null;
  lastMessagePreview: string | null;
  lastMessageDirection: "INBOUND" | "OUTBOUND" | null;
  lastMessageAtUtc: string | null;
  status: string;
  aiMode: ConversationAiMode;
  aiPauseReason: string | null;
};

type MessageRow = {
  messageId: string;
  direction: "INBOUND" | "OUTBOUND";
  contentType: string;
  textContent: string | null;
  providerTimestampUtc: string | null;
  receivedAtUtc: string;
  createdAtUtc: string;
};

function contactLabel(c: ConversationRow): string {
  if (c.contactDisplayName?.trim()) return c.contactDisplayName.trim();
  if (c.contactPhoneNormalized) return c.contactPhoneNormalized;
  const key = c.contactExternalKey;
  const jid = /^(\d+)@/i.exec(key);
  if (jid) return jid[1];
  return key.length > 24 ? `${key.slice(0, 20)}…` : key;
}

function formatTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("ar-SA", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(d);
}

function previewText(c: ConversationRow): string {
  if (c.lastMessagePreview?.trim()) return c.lastMessagePreview.trim();
  return "بدون نص";
}

function aiStatusLabel(mode: ConversationAiMode): string {
  if (mode === "HUMAN_PAUSED") return "متوقف — تدخل موظف";
  if (mode === "SAFETY_PAUSED") {
    return "متوقف للأمان — حالة إرسال غير مؤكدة";
  }
  return "AI نشط";
}

function serializeConversations(
  rows: Array<{
    conversationId: string;
    contactExternalKey: string;
    contactDisplayName: string | null;
    contactPhoneNormalized: string | null;
    lastMessagePreview: string | null;
    lastMessageDirection: "INBOUND" | "OUTBOUND" | null;
    lastMessageAtUtc: Date | null;
    status: string;
    aiMode?: ConversationAiMode | null;
    aiPauseReason?: string | null;
  }>,
): ConversationRow[] {
  return rows.map((c) => ({
    conversationId: c.conversationId,
    contactExternalKey: c.contactExternalKey,
    contactDisplayName: c.contactDisplayName,
    contactPhoneNormalized: c.contactPhoneNormalized,
    lastMessagePreview: c.lastMessagePreview,
    lastMessageDirection: c.lastMessageDirection,
    lastMessageAtUtc: c.lastMessageAtUtc
      ? new Date(c.lastMessageAtUtc).toISOString()
      : null,
    status: c.status,
    aiMode: c.aiMode ?? "AUTO",
    aiPauseReason: c.aiPauseReason ?? null,
  }));
}

export function InboxPanel({
  initialConversations,
}: {
  initialConversations: ConversationRow[];
}) {
  const [conversations, setConversations] = useState(initialConversations);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, startRefresh] = useTransition();
  const [resuming, setResuming] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const loadConversations = useCallback(() => {
    startRefresh(async () => {
      setError(null);
      try {
        const res = await fetch("/api/inbox/conversations?limit=50", {
          credentials: "same-origin",
          cache: "no-store",
        });
        const data = (await res.json()) as {
          conversations?: Array<{
            conversationId: string;
            contactExternalKey: string;
            contactDisplayName: string | null;
            contactPhoneNormalized: string | null;
            lastMessagePreview: string | null;
            lastMessageDirection: "INBOUND" | "OUTBOUND" | null;
            lastMessageAtUtc: string | Date | null;
            status: string;
            aiMode?: ConversationAiMode | null;
            aiPauseReason?: string | null;
          }>;
          error?: string;
        };
        if (!res.ok) {
          throw new Error(data.error || "تعذر تحميل المحادثات");
        }
        setConversations(
          serializeConversations(
            (data.conversations ?? []).map((c) => ({
              ...c,
              lastMessageAtUtc: c.lastMessageAtUtc
                ? new Date(c.lastMessageAtUtc)
                : null,
              aiMode: c.aiMode ?? "AUTO",
              aiPauseReason: c.aiPauseReason ?? null,
            })),
          ),
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "تعذر تحميل المحادثات");
      }
    });
  }, []);

  const selectConversation = useCallback((conversationId: string) => {
    setSelectedId(conversationId);
    setMessages([]);
    setLoadingMessages(true);
    setError(null);
    void (async () => {
      try {
        const res = await fetch(
          `/api/inbox/conversations/${encodeURIComponent(conversationId)}/messages?limit=100`,
          { credentials: "same-origin", cache: "no-store" },
        );
        const data = (await res.json()) as {
          messages?: MessageRow[];
          error?: string;
        };
        if (!res.ok) {
          throw new Error(data.error || "تعذر تحميل الرسائل");
        }
        setMessages(data.messages ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "تعذر تحميل الرسائل");
        setMessages([]);
      } finally {
        setLoadingMessages(false);
      }
    })();
  }, []);

  const resumeAi = useCallback(async () => {
    if (!selectedId) return;
    setResuming(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/inbox/conversations/${encodeURIComponent(selectedId)}/ai/resume`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: { Accept: "application/json" },
        },
      );
      const data = (await res.json()) as {
        state?: { mode: ConversationAiMode; pauseReason: string | null };
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error || "تعذر استئناف الذكاء الاصطناعي");
      }
      const mode = data.state?.mode ?? "AUTO";
      setConversations((prev) =>
        prev.map((c) =>
          c.conversationId === selectedId
            ? { ...c, aiMode: mode, aiPauseReason: data.state?.pauseReason ?? null }
            : c,
        ),
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "تعذر استئناف الذكاء الاصطناعي",
      );
    } finally {
      setResuming(false);
    }
  }, [selectedId]);

  const sendManual = useCallback(async () => {
    if (!selectedId || !draft.trim() || sending) return;
    setSending(true);
    setError(null);
    const text = draft.trim();
    const idempotencyKey = crypto.randomUUID();
    try {
      const res = await fetch(
        `/api/inbox/conversations/${encodeURIComponent(selectedId)}/messages`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ text, idempotencyKey }),
        },
      );
      const data = (await res.json()) as {
        status?: string;
        error?: string;
        errorCode?: string;
        messageId?: string;
      };
      if (res.status === 202 || data.status === "AMBIGUOUS") {
        setError(
          "أُرسل الطلب لكن النتيجة غير مؤكدة. لا تعِد الإرسال تلقائياً — راجع المحادثة.",
        );
        return;
      }
      if (!res.ok) {
        throw new Error(data.error || data.errorCode || "تعذر إرسال الرسالة");
      }
      setDraft("");
      setConversations((prev) =>
        prev.map((c) =>
          c.conversationId === selectedId
            ? {
                ...c,
                aiMode: "HUMAN_PAUSED",
                aiPauseReason: "HUMAN_TAKEOVER",
                lastMessagePreview: text,
                lastMessageDirection: "OUTBOUND",
                lastMessageAtUtc: new Date().toISOString(),
              }
            : c,
        ),
      );
      // Reload thread for authoritative message list
      const thread = await fetch(
        `/api/inbox/conversations/${encodeURIComponent(selectedId)}/messages?limit=100`,
        { credentials: "same-origin", cache: "no-store" },
      );
      const threadData = (await thread.json()) as { messages?: MessageRow[] };
      if (thread.ok) {
        setMessages(threadData.messages ?? []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر إرسال الرسالة");
    } finally {
      setSending(false);
    }
  }, [selectedId, draft, sending]);

  const selected = conversations.find((c) => c.conversationId === selectedId);

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="grid min-h-[28rem] md:grid-cols-[minmax(16rem,22rem)_1fr]">
        <aside className="border-b border-border md:border-b-0 md:border-e">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold">المحادثات</h2>
            <button
              type="button"
              onClick={loadConversations}
              disabled={refreshing}
              className="text-xs text-primary hover:underline disabled:opacity-50"
            >
              {refreshing ? "جاري التحديث…" : "تحديث"}
            </button>
          </div>
          {conversations.length === 0 ? (
            <p className="px-4 py-8 text-sm text-muted-foreground">
              لا توجد محادثات بعد. ستظهر هنا بعد استلام رسائل واتساب.
            </p>
          ) : (
            <ul className="max-h-[28rem] overflow-y-auto">
              {conversations.map((c) => {
                const active = c.conversationId === selectedId;
                return (
                  <li key={c.conversationId}>
                    <button
                      type="button"
                      onClick={() => selectConversation(c.conversationId)}
                      className={`flex w-full flex-col gap-1 px-4 py-3 text-start transition-colors ${
                        active ? "bg-primary/10" : "hover:bg-surface"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium">
                          {contactLabel(c)}
                        </span>
                        <span className="shrink-0 text-[11px] text-muted-foreground">
                          {formatTime(c.lastMessageAtUtc)}
                        </span>
                      </div>
                      <span className="truncate text-xs text-muted-foreground">
                        {previewText(c)}
                      </span>
                      {c.aiMode !== "AUTO" ? (
                        <span className="truncate text-[11px] text-amber-700">
                          {aiStatusLabel(c.aiMode)}
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>

        <section className="flex min-h-[20rem] flex-col">
          <div className="border-b border-border px-4 py-3">
            {selected ? (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-sm font-semibold">{contactLabel(selected)}</h2>
                  <p className="text-xs text-muted-foreground">
                    رد يدوي من الموظف — يوقف الرد الآلي تلقائياً
                  </p>
                  <p className="mt-1 text-xs font-medium text-foreground">
                    {aiStatusLabel(selected.aiMode)}
                  </p>
                  {selected.aiMode === "SAFETY_PAUSED" ? (
                    <p className="mt-1 text-xs text-amber-800">
                      توقف الأمان بسبب نتيجة إرسال غير مؤكدة. راجع المحادثة قبل
                      الاستئناف.
                    </p>
                  ) : null}
                </div>
                {selected.aiMode === "HUMAN_PAUSED" ? (
                  <button
                    type="button"
                    onClick={() => void resumeAi()}
                    disabled={resuming}
                    className="shrink-0 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
                  >
                    {resuming ? "جاري الاستئناف…" : "استئناف الذكاء الاصطناعي"}
                  </button>
                ) : null}
                {selected.aiMode === "SAFETY_PAUSED" ? (
                  <button
                    type="button"
                    onClick={() => void resumeAi()}
                    disabled={resuming}
                    className="shrink-0 rounded-md border border-amber-700 px-3 py-1.5 text-xs font-medium text-amber-900 disabled:opacity-50"
                  >
                    {resuming ? "جاري الاستئناف…" : "استئناف بعد المراجعة"}
                  </button>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">اختر محادثة لعرض الرسائل</p>
            )}
          </div>

          {error ? (
            <p className="px-4 py-3 text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}

          <div className="flex flex-1 flex-col gap-3 overflow-y-auto bg-surface/60 px-4 py-4">
            {!selectedId ? null : loadingMessages ? (
              <p className="text-sm text-muted-foreground">جاري تحميل الرسائل…</p>
            ) : messages.length === 0 ? (
              <p className="text-sm text-muted-foreground">لا توجد رسائل</p>
            ) : (
              messages.map((m) => (
                <div
                  key={m.messageId}
                  className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                    m.direction === "OUTBOUND"
                      ? "ms-auto bg-primary/15"
                      : "me-auto bg-card border border-border"
                  }`}
                >
                  <p className="whitespace-pre-wrap break-words">
                    {m.textContent || `[${m.contentType}]`}
                  </p>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {formatTime(m.providerTimestampUtc || m.receivedAtUtc)}
                  </p>
                </div>
              ))
            )}
          </div>

          {selectedId ? (
            <div className="border-t border-border p-3">
              <label className="sr-only" htmlFor="inbox-manual-reply">
                رسالة يدوية
              </label>
              <textarea
                id="inbox-manual-reply"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={2}
                maxLength={4000}
                placeholder="اكتب ردك هنا…"
                className="w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
              <div className="mt-2 flex items-center justify-between gap-2">
                <p className="text-[11px] text-muted-foreground">
                  الإرسال يوقف الذكاء الاصطناعي لهذه المحادثة.
                </p>
                <button
                  type="button"
                  onClick={() => void sendManual()}
                  disabled={sending || !draft.trim()}
                  className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
                >
                  {sending ? "جاري الإرسال…" : "إرسال"}
                </button>
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}

export { serializeConversations };
