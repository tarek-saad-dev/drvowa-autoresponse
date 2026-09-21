"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { messageBodyDisplay } from "@/lib/ui/labels";
import { mapUserFacingError } from "@/lib/ui/user-errors";

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
  if (mode === "HUMAN_PAUSED") return "الرد الآلي متوقف — تدخل موظف";
  if (mode === "SAFETY_PAUSED") {
    return "الرد الآلي متوقف للأمان";
  }
  return "الرد الآلي نشط";
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

const LIST_POLL_MS = 10_000;
const THREAD_POLL_MS = 6_000;

export function InboxPanel({
  initialConversations,
}: {
  initialConversations: ConversationRow[];
}) {
  const [conversations, setConversations] = useState(initialConversations);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileShowThread, setMobileShowThread] = useState(false);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, startRefresh] = useTransition();
  const [resuming, setResuming] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [query, setQuery] = useState("");
  const threadEndRef = useRef<HTMLDivElement | null>(null);
  const selectedIdRef = useRef<string | null>(null);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, selectedId]);

  const loadConversations = useCallback((silent = false) => {
    startRefresh(async () => {
      if (!silent) setError(null);
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
          code?: string;
        };
        if (!res.ok) {
          throw new Error(
            mapUserFacingError(data, "تعذر تحميل المحادثات"),
          );
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
        if (!silent) {
          setError(
            mapUserFacingError(
              { error: err instanceof Error ? err.message : null },
              "تعذر تحميل المحادثات",
            ),
          );
        }
      }
    });
  }, []);

  const loadMessages = useCallback(
    async (conversationId: string, silent = false) => {
      if (!silent) setLoadingMessages(true);
      try {
        const res = await fetch(
          `/api/inbox/conversations/${encodeURIComponent(conversationId)}/messages?limit=100`,
          { credentials: "same-origin", cache: "no-store" },
        );
        const data = (await res.json()) as {
          messages?: MessageRow[];
          error?: string;
          code?: string;
        };
        if (!res.ok) {
          throw new Error(mapUserFacingError(data, "تعذر تحميل الرسائل"));
        }
        if (selectedIdRef.current === conversationId) {
          setMessages(data.messages ?? []);
        }
      } catch (err) {
        if (!silent) {
          setError(
            mapUserFacingError(
              { error: err instanceof Error ? err.message : null },
              "تعذر تحميل الرسائل",
            ),
          );
          setMessages([]);
        }
      } finally {
        if (!silent) setLoadingMessages(false);
      }
    },
    [],
  );

  const selectConversation = useCallback(
    (conversationId: string) => {
      setSelectedId(conversationId);
      setMobileShowThread(true);
      setMessages([]);
      setError(null);
      void loadMessages(conversationId, false);
    },
    [loadMessages],
  );

  useEffect(() => {
    const tick = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      loadConversations(true);
      const id = selectedIdRef.current;
      if (id) void loadMessages(id, true);
    };
    const listTimer = window.setInterval(tick, LIST_POLL_MS);
    const threadTimer = window.setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      const id = selectedIdRef.current;
      if (id) void loadMessages(id, true);
    }, THREAD_POLL_MS);
    return () => {
      window.clearInterval(listTimer);
      window.clearInterval(threadTimer);
    };
  }, [loadConversations, loadMessages]);

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
        code?: string;
      };
      if (!res.ok) {
        throw new Error(mapUserFacingError(data, "تعذر استئناف الرد الآلي"));
      }
      const mode = data.state?.mode ?? "AUTO";
      setConversations((prev) =>
        prev.map((c) =>
          c.conversationId === selectedId
            ? {
                ...c,
                aiMode: mode,
                aiPauseReason: data.state?.pauseReason ?? null,
              }
            : c,
        ),
      );
    } catch (err) {
      setError(
        mapUserFacingError(
          { error: err instanceof Error ? err.message : null },
          "تعذر استئناف الرد الآلي",
        ),
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
        code?: string;
      };
      if (res.status === 202 || data.status === "AMBIGUOUS") {
        setError(
          mapUserFacingError(
            data,
            "أُرسل الطلب لكن النتيجة غير مؤكدة. لا تعِد الإرسال تلقائياً — راجع المحادثة.",
          ),
        );
        return;
      }
      if (!res.ok) {
        throw new Error(mapUserFacingError(data, "تعذر إرسال الرسالة"));
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
      await loadMessages(selectedId, true);
    } catch (err) {
      setError(
        mapUserFacingError(
          { error: err instanceof Error ? err.message : null },
          "تعذر إرسال الرسالة",
        ),
      );
    } finally {
      setSending(false);
    }
  }, [selectedId, draft, sending, loadMessages]);

  const selected = conversations.find((c) => c.conversationId === selectedId);
  const filtered = conversations.filter((c) => {
    const q = query.trim();
    if (!q) return true;
    const hay = `${contactLabel(c)} ${previewText(c)}`.toLowerCase();
    return hay.includes(q.toLowerCase());
  });

  const listPane = (
    <aside className="flex h-full min-h-[24rem] flex-col border-b border-border md:border-b-0 md:border-e">
      <div className="space-y-2 border-b border-border px-3 py-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">المحادثات</h2>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => loadConversations(false)}
            disabled={refreshing}
            className="h-8 px-2 text-xs"
          >
            {refreshing ? "تحديث…" : "تحديث"}
          </Button>
        </div>
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="بحث بالاسم أو الرقم…"
          aria-label="بحث في المحادثات"
          className="h-9"
        />
      </div>
      {filtered.length === 0 ? (
        <EmptyState
          className="m-3 border-0 bg-transparent px-2 py-6"
          title="لا توجد محادثات"
          description="ستظهر هنا بعد استلام رسائل واتساب من العملاء."
        />
      ) : (
        <ul className="flex-1 overflow-y-auto">
          {filtered.map((c) => {
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
                    {c.lastMessageDirection === "OUTBOUND" ? "↗ " : "↙ "}
                    {previewText(c)}
                  </span>
                  {c.aiMode !== "AUTO" ? (
                    <span className="truncate text-[11px] text-amber-800">
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
  );

  const threadPane = (composerId: string) => (
    <section className="flex min-h-[24rem] flex-1 flex-col">
      <div className="border-b border-border px-4 py-3">
        {selected ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2 md:hidden"
                    onClick={() => setMobileShowThread(false)}
                  >
                    رجوع
                  </Button>
                  <h2 className="truncate text-sm font-semibold">
                    {contactLabel(selected)}
                  </h2>
                </div>
                <p className="mt-1 text-xs font-medium">
                  {aiStatusLabel(selected.aiMode)}
                </p>
              </div>
            </div>

            {selected.aiMode === "HUMAN_PAUSED" ? (
              <Alert variant="warning" title="الرد الآلي متوقف مؤقتاً لهذه المحادثة">
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="text-sm">
                    يمكنك الرد يدوياً، ثم استئناف الرد الآلي عند الانتهاء.
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => void resumeAi()}
                    disabled={resuming}
                  >
                    {resuming ? "جاري الاستئناف…" : "استئناف الرد الآلي"}
                  </Button>
                </div>
              </Alert>
            ) : null}

            {selected.aiMode === "SAFETY_PAUSED" ? (
              <Alert
                variant="error"
                title="توقف أمان — راجع المحادثة قبل الاستئناف"
              >
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="text-sm">
                    توقّف الرد الآلي بسبب حالة إرسال غير مؤكدة. تأكد من عدم تكرار
                    الرسالة قبل الاستئناف.
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (
                        window.confirm(
                          "هل راجعت المحادثة وتريد استئناف الرد الآلي؟",
                        )
                      ) {
                        void resumeAi();
                      }
                    }}
                    disabled={resuming}
                  >
                    {resuming ? "جاري الاستئناف…" : "استئناف بعد المراجعة"}
                  </Button>
                </div>
              </Alert>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            اختر محادثة لعرض الرسائل والرد.
          </p>
        )}
      </div>

      {error ? (
        <p className="px-4 py-3 text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex flex-1 flex-col gap-3 overflow-y-auto bg-surface/60 px-4 py-4">
        {!selectedId ? (
          <EmptyState
            className="my-auto border-0 bg-transparent"
            title="اختر محادثة"
            description="من القائمة لعرض الرسائل والرد على العميل."
          />
        ) : loadingMessages ? (
          <p className="text-sm text-muted-foreground">جاري تحميل الرسائل…</p>
        ) : messages.length === 0 ? (
          <p className="text-sm text-muted-foreground">لا توجد رسائل بعد</p>
        ) : (
          messages.map((m) => (
            <div
              key={m.messageId}
              className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                m.direction === "OUTBOUND"
                  ? "ms-auto bg-primary/15"
                  : "me-auto border border-border bg-card"
              }`}
            >
              <p className="whitespace-pre-wrap break-words">
                {messageBodyDisplay({
                  textContent: m.textContent,
                  contentType: m.contentType,
                })}
              </p>
              <p className="mt-1 text-[10px] text-muted-foreground">
                {formatTime(m.providerTimestampUtc || m.receivedAtUtc)}
              </p>
            </div>
          ))
        )}
        <div ref={threadEndRef} />
      </div>

      {selectedId ? (
        <div className="border-t border-border p-3">
          <label className="sr-only" htmlFor={composerId}>
            رسالة يدوية
          </label>
          <Textarea
            id={composerId}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={2}
            maxLength={4000}
            placeholder="اكتب ردك هنا… (Enter للإرسال، Shift+Enter لسطر جديد)"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void sendManual();
              }
            }}
          />
          <div className="mt-2 flex items-center justify-between gap-2">
            <p className="text-[11px] text-muted-foreground">
              الإرسال يوقف الرد الآلي لهذه المحادثة تلقائياً.
            </p>
            <Button
              type="button"
              size="sm"
              onClick={() => void sendManual()}
              disabled={sending || !draft.trim()}
            >
              {sending ? "جاري الإرسال…" : "إرسال"}
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="hidden min-h-[32rem] md:grid md:grid-cols-[minmax(16rem,22rem)_1fr]">
        {listPane}
        {threadPane("inbox-manual-reply-desktop")}
      </div>
      <div className="md:hidden">
        {mobileShowThread && selectedId
          ? threadPane("inbox-manual-reply-mobile")
          : listPane}
      </div>
    </div>
  );
}

export { serializeConversations };
