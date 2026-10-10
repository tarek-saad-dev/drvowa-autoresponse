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
import type { AiReplyHealth, AiReplyHealthReason } from "@/types/domain";

export type ConversationAiMode = "AUTO" | "HUMAN_PAUSED" | "SAFETY_PAUSED";
type InboxFilter = "ALL" | "AUTO" | "ATTENTION";

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
  aiReplyHealth: AiReplyHealth | null;
};

type MessageRow = {
  messageId: string;
  direction: "INBOUND" | "OUTBOUND";
  contentType: string;
  textContent: string | null;
  origin: "CUSTOMER" | "AI" | "HUMAN" | "SYSTEM" | "UNKNOWN";
  actorUserId: string | null;
  actorName: string | null;
  providerTimestampUtc: string | null;
  receivedAtUtc: string;
  createdAtUtc: string;
};

type MessageCursor = {
  beforeAt: string;
  beforeCreatedAt: string;
  beforeMessageId: string;
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

  const diffMs = Date.now() - d.getTime();
  const minutes = Math.max(0, Math.floor(diffMs / 60_000));
  if (minutes < 1) return "دلوقتي";
  if (minutes < 60) return `منذ ${minutes} د`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `منذ ${hours} س`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "أمس";
  if (days < 7) return `منذ ${days} أيام`;

  return new Intl.DateTimeFormat("ar-EG", {
    day: "numeric",
    month: "short",
  }).format(d);
}

function previewText(c: ConversationRow): string {
  if (c.lastMessagePreview?.trim()) return c.lastMessagePreview.trim();
  return "بدون نص";
}

const AI_FAILURE_TEXT: Record<AiReplyHealthReason, string> = {
  AI_DISABLED: "الرد التلقائي مقفول لرقم الواتساب ده. شغّله من صفحة الموظف أو رد بنفسك.",
  WORKER_STALLED: "خدمة الرد التلقائي مش بتشتغل دلوقتي، والرسالة مستنية من غير رد.",
  NOT_SCHEDULED: "الموظف الذكي مش هيرد على آخر رسالة من العميل.",
  UNSUPPORTED_CONTENT: "العميل بعت مرفق، والموظف الذكي بيرد على الرسائل النصية بس.",
  AI_GENERATION_FAILED: "خدمة الذكاء الاصطناعي فشلت في تجهيز الرد.",
  WHATSAPP_SEND_FAILED: "الرد اتجهز لكن إرساله على واتساب فشل. اتأكد إن الرقم متصل.",
  QUOTA_EXCEEDED: "وصلت لحد الردود في باقتك، فالموظف الذكي وقف الرد.",
  AGENT_UNAVAILABLE: "الموظف الذكي متوقف أو مش متاح.",
  DESTINATION_UNAVAILABLE: "رقم العميل مش متاح للرد.",
  LOOP_GUARD: "الرد التلقائي اتوقف مؤقتًا لحماية المحادثة من التكرار.",
  UNKNOWN: "الموظف الذكي مقدرش يرد على آخر رسالة.",
};

type AiStatusTone = "success" | "warning" | "destructive";

type AiStatusView = {
  short: string;
  label: string;
  tone: AiStatusTone;
  stripTitle: string;
  stripHint: string;
  detail: string;
  failure: string | null;
  needsAttention: boolean;
};

function aiStatusView(c: ConversationRow): AiStatusView {
  if (c.aiMode === "HUMAN_PAUSED") {
    return {
      short: "معاك دلوقتي",
      label: "أنت بترد دلوقتي",
      tone: "warning",
      stripTitle: "المحادثة معاك دلوقتي",
      stripHint: "لما تخلص، رجّع المحادثة للموظف.",
      detail: "المحادثة معاك أو مع حد من الفريق لحد ما ترجع الرد التلقائي.",
      failure: null,
      needsAttention: true,
    };
  }
  if (c.aiMode === "SAFETY_PAUSED") {
    return {
      short: "محتاج مراجعة",
      label: "محتاج مراجعة",
      tone: "destructive",
      stripTitle: "المحادثة محتاجة مراجعة",
      stripHint: "راجع آخر الرسائل قبل ما تشغّل الرد التلقائي.",
      detail: "الرد متوقف مؤقتًا لحد مراجعة المحادثة.",
      failure: null,
      needsAttention: true,
    };
  }

  const health = c.aiReplyHealth;
  if (health?.state === "DISABLED") {
    return {
      short: "الرد التلقائي مقفول",
      label: "الرد التلقائي مقفول",
      tone: "destructive",
      stripTitle: "الموظف الذكي مش بيرد",
      stripHint: "الرد التلقائي مقفول، فلازم ترد بنفسك.",
      detail: AI_FAILURE_TEXT.AI_DISABLED,
      failure: AI_FAILURE_TEXT.AI_DISABLED,
      needsAttention: true,
    };
  }
  if (health?.state === "FAILED") {
    const failure = AI_FAILURE_TEXT[health.reason ?? "UNKNOWN"];
    return {
      short: "الرد متعطل",
      label: "الموظف الذكي ماردش",
      tone: "destructive",
      stripTitle: "آخر رسالة من العميل من غير رد",
      stripHint: "رد بنفسك على العميل دلوقتي.",
      detail: failure,
      failure,
      needsAttention: true,
    };
  }
  if (health?.state === "REPLYING") {
    return {
      short: "بيجهّز الرد",
      label: "الموظف بيجهّز الرد",
      tone: "success",
      stripTitle: "الموظف بيجهّز الرد",
      stripHint: "الرد هيوصل للعميل خلال ثواني.",
      detail: "موظف الاستقبال الذكي بيجهّز الرد على آخر رسالة.",
      failure: null,
      needsAttention: false,
    };
  }
  return {
    short: "AI شغال",
    label: "الموظف بيرد تلقائيًا",
    tone: "success",
    stripTitle: "الموظف بيتابع المحادثة",
    stripHint: "سيبه يكمل، أو رد بنفسك في أي وقت.",
    detail: "موظف الاستقبال الذكي بيتابع المحادثة تلقائيًا.",
    failure: null,
    needsAttention: false,
  };
}

const TONE_BADGE: Record<AiStatusTone, string> = {
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  destructive: "bg-destructive/10 text-destructive",
};

const TONE_DOT: Record<AiStatusTone, string> = {
  success: "bg-success",
  warning: "bg-warning",
  destructive: "bg-destructive",
};

function contactInitial(c: ConversationRow): string {
  return contactLabel(c).slice(0, 1).toUpperCase();
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
    aiReplyHealth?: AiReplyHealth | null;
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
    aiReplyHealth: c.aiReplyHealth ?? null,
  }));
}

const LIST_POLL_MS = 10_000;
const THREAD_POLL_MS = 6_000;
const MESSAGE_PAGE_SIZE = 100;

function messageActorLabel(message: MessageRow): string | null {
  if (message.origin === "CUSTOMER") return null;
  if (message.origin === "AI") return "🤖 AI";
  if (message.origin === "HUMAN") {
    return `👤 ${message.actorName?.trim() || "موظف"}`;
  }
  if (message.origin === "SYSTEM") return "⚙ النظام";
  if (message.direction === "OUTBOUND") return "رسالة صادرة قديمة";
  return null;
}

function messageDayKey(message: MessageRow): string {
  const raw = message.providerTimestampUtc || message.receivedAtUtc || message.createdAtUtc;
  return new Date(raw).toISOString().slice(0, 10);
}

function messageDayLabel(message: MessageRow): string {
  const raw = message.providerTimestampUtc || message.receivedAtUtc || message.createdAtUtc;
  const date = new Date(raw);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return "اليوم";
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "أمس";
  return new Intl.DateTimeFormat("ar-EG", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(date);
}

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
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [olderCursor, setOlderCursor] = useState<MessageCursor | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, startRefresh] = useTransition();
  const [resuming, setResuming] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<InboxFilter>("ALL");
  const [showDetails, setShowDetails] = useState(false);
  const threadEndRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const selectedIdRef = useRef<string | null>(null);

  const draft = selectedId ? drafts[selectedId] ?? "" : "";
  const setDraft = useCallback((value: string) => {
    if (!selectedId) return;
    setDrafts((prev) => ({ ...prev, [selectedId]: value }));
  }, [selectedId]);

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
        const res = await fetch("/api/inbox/conversations?limit=500", {
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
            aiReplyHealth?: AiReplyHealth | null;
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
              aiReplyHealth: c.aiReplyHealth ?? null,
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
          `/api/inbox/conversations/${encodeURIComponent(conversationId)}/messages?limit=${MESSAGE_PAGE_SIZE}`,
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
          const next = data.messages ?? [];
          if (silent) {
            setMessages((prev) => {
              const byId = new Map(prev.map((message) => [message.messageId, message]));
              for (const message of next) byId.set(message.messageId, message);
              return [...byId.values()].sort((a, b) => {
                const at = new Date(a.providerTimestampUtc || a.receivedAtUtc || a.createdAtUtc).getTime();
                const bt = new Date(b.providerTimestampUtc || b.receivedAtUtc || b.createdAtUtc).getTime();
                return at - bt;
              });
            });
          } else {
            setMessages(next);
            setHasMoreMessages(next.length === MESSAGE_PAGE_SIZE);
            const first = next[0];
            setOlderCursor(
              first
                ? {
                    beforeAt: first.providerTimestampUtc || first.createdAtUtc,
                    beforeCreatedAt: first.createdAtUtc,
                    beforeMessageId: first.messageId,
                  }
                : null,
            );
          }
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

  const loadOlderMessages = useCallback(async () => {
    if (!selectedId || !olderCursor || !hasMoreMessages || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const params = new URLSearchParams({
        limit: String(MESSAGE_PAGE_SIZE),
        beforeAt: olderCursor.beforeAt,
        beforeCreatedAt: olderCursor.beforeCreatedAt,
        beforeMessageId: olderCursor.beforeMessageId,
      });
      const res = await fetch(
        `/api/inbox/conversations/${encodeURIComponent(selectedId)}/messages?${params.toString()}`,
        { credentials: "same-origin", cache: "no-store" },
      );
      const data = (await res.json()) as { messages?: MessageRow[]; error?: string };
      if (!res.ok) throw new Error(mapUserFacingError(data, "تعذر تحميل الرسائل الأقدم"));
      const older = data.messages ?? [];
      setMessages((prev) => {
        const known = new Set(prev.map((message) => message.messageId));
        return [...older.filter((message) => !known.has(message.messageId)), ...prev];
      });
      setHasMoreMessages(older.length === MESSAGE_PAGE_SIZE);
      const first = older[0];
      setOlderCursor(
        first
          ? {
              beforeAt: first.providerTimestampUtc || first.createdAtUtc,
              beforeCreatedAt: first.createdAtUtc,
              beforeMessageId: first.messageId,
            }
          : null,
      );
    } catch (err) {
      setError(
        mapUserFacingError(
          { error: err instanceof Error ? err.message : null },
          "تعذر تحميل الرسائل الأقدم",
        ),
      );
    } finally {
      setLoadingOlder(false);
    }
  }, [selectedId, olderCursor, hasMoreMessages, loadingOlder]);

  useEffect(() => {
    if (selectedId || conversations.length === 0) return;
    if (typeof window === "undefined") return;
    if (!window.matchMedia("(min-width: 768px)").matches) return;

    const first = conversations.find((item) => aiStatusView(item).needsAttention)
      ?? conversations[0];
    setSelectedId(first.conversationId);
    selectedIdRef.current = first.conversationId;
    void loadMessages(first.conversationId, false);
  }, [conversations, loadMessages, selectedId]);

  const selectConversation = useCallback(
    (conversationId: string) => {
      setSelectedId(conversationId);
      setMobileShowThread(true);
      setShowDetails(false);
      setMessages([]);
      setHasMoreMessages(false);
      setOlderCursor(null);
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
                aiReplyHealth: null,
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
  const selectedView = selected ? aiStatusView(selected) : null;
  const filtered = conversations.filter((c) => {
    const attention = aiStatusView(c).needsAttention;
    const matchesMode =
      filter === "ALL"
      || (filter === "AUTO" && !attention)
      || (filter === "ATTENTION" && attention);
    if (!matchesMode) return false;

    const q = query.trim();
    if (!q) return true;
    const hay = `${contactLabel(c)} ${previewText(c)}`.toLowerCase();
    return hay.includes(q.toLowerCase());
  }).sort((a, b) => {
    const aAttention = aiStatusView(a).needsAttention ? 0 : 1;
    const bAttention = aiStatusView(b).needsAttention ? 0 : 1;
    return aAttention - bAttention;
  });

  const attentionCount = conversations.filter(
    (c) => aiStatusView(c).needsAttention,
  ).length;
  const filterCounts = {
    ALL: conversations.length,
    AUTO: conversations.length - attentionCount,
    ATTENTION: attentionCount,
  };
  const workerStalled = conversations.some(
    (c) =>
      c.aiMode === "AUTO"
      && c.aiReplyHealth?.state === "FAILED"
      && c.aiReplyHealth.reason === "WORKER_STALLED",
  );

  const listPane = (
    <aside className="flex h-full min-h-[30rem] flex-col border-b border-border bg-card md:border-b-0 md:border-e">
      <div className="border-b border-border px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-black">محادثات العملاء</h2>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {conversations.length === 0
                ? "أول رسالة من عميل هتظهر هنا تلقائيًا"
                : filterCounts.ATTENTION > 0
                  ? `${filterCounts.ATTENTION} محتاجة تدخلك من ${conversations.length}`
                  : `${conversations.length} محادثة — كله تحت السيطرة`}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => loadConversations(false)}
            disabled={refreshing}
            className="h-9 rounded-xl px-3 text-xs"
          >
            {refreshing ? "..." : "تحديث"}
          </Button>
        </div>
        <div className="relative mt-3">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ابحث باسم العميل أو رقمه…"
            aria-label="بحث في المحادثات"
            className="h-11 rounded-2xl bg-surface pe-4 text-sm"
          />
        </div>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {([
            ["ALL", "الكل"],
            ["ATTENTION", "محتاج تدخلك"],
            ["AUTO", "الموظف بيتابع"],
          ] as Array<[InboxFilter, string]>).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-[10px] font-black transition ${
                filter === value
                  ? "bg-primary text-primary-foreground"
                  : "bg-surface text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
              <span className="ms-1 opacity-70">{filterCounts[value]}</span>
            </button>
          ))}
        </div>
        {workerStalled ? (
          <Alert variant="error" title="الرد التلقائي متوقف" className="mt-3">
            في رسائل عملاء مستنية رد ومش بتتعالج. رد بنفسك على المحادثات المعلّمة لحد ما الخدمة ترجع.
          </Alert>
        ) : null}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          className="m-4 border-0 bg-transparent px-2 py-10"
          title={
            query.trim()
              ? "مفيش نتيجة للبحث"
              : filter === "ALL"
                ? "لسه مفيش محادثات"
                : filter === "ATTENTION"
                  ? "مفيش حاجة محتاجة تدخلك"
                  : "مفيش محادثات بالحالة دي"
          }
          description={
            query.trim()
              ? "جرب اسم أو رقم مختلف."
              : filter === "ALL"
                ? "أول رسالة من عميل هتظهر هنا تلقائيًا."
                : filter === "ATTENTION"
                  ? "كل المحادثات متسابّة للموظف الذكي حاليًا."
                  : "غيّر الفلتر أو ارجع لكل المحادثات."
          }
        />
      ) : (
        <ul className="flex-1 overflow-y-auto p-2">
          {filtered.map((conversation) => {
            const active = conversation.conversationId === selectedId;
            return (
              <li key={conversation.conversationId}>
                <button
                  type="button"
                  onClick={() => selectConversation(conversation.conversationId)}
                  className={`group flex w-full items-start gap-3 rounded-2xl px-3 py-3 text-start transition-all ${
                    active
                      ? "bg-primary/10 shadow-sm"
                      : "hover:bg-surface"
                  }`}
                >
                  <div
                    className={`grid h-11 w-11 shrink-0 place-items-center rounded-full text-sm font-black ${
                      active
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-secondary-foreground"
                    }`}
                  >
                    {contactInitial(conversation)}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <span className="block truncate text-sm font-black">
                          {contactLabel(conversation)}
                        </span>
                        {conversation.contactDisplayName && conversation.contactPhoneNormalized ? (
                          <span className="block truncate text-[10px] text-muted-foreground" dir="ltr">
                            {conversation.contactPhoneNormalized}
                          </span>
                        ) : null}
                      </div>
                      <span className="shrink-0 text-[10px] text-muted-foreground">
                        {formatTime(conversation.lastMessageAtUtc)}
                      </span>
                    </div>

                    <div className="mt-1 flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                        {conversation.lastMessageDirection === "OUTBOUND" ? "رد: " : ""}
                        {previewText(conversation)}
                      </span>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-black ${
                          TONE_BADGE[aiStatusView(conversation).tone]
                        }`}
                      >
                        {aiStatusView(conversation).short}
                      </span>
                    </div>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );

  const threadPane = (composerId: string) => (
    <section className="flex min-h-[30rem] min-w-0 flex-1 flex-col bg-card">
      <div className="border-b border-border bg-card/95 px-4 py-3 backdrop-blur">
        {selected ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-9 w-9 shrink-0 rounded-xl px-0 md:hidden"
                  onClick={() => setMobileShowThread(false)}
                  aria-label="رجوع للمحادثات"
                >
                  ←
                </Button>

                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-black text-primary">
                  {contactInitial(selected)}
                </div>

                <div className="min-w-0">
                  <h2 className="truncate text-sm font-black">
                    {contactLabel(selected)}
                  </h2>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    {selected.contactPhoneNormalized ? (
                      <span className="text-[11px] text-muted-foreground">
                        {selected.contactPhoneNormalized}
                      </span>
                    ) : null}
                    <span className="text-[10px] text-muted-foreground">•</span>
                    <span className="text-[10px] text-muted-foreground">
                      {formatTime(selected.lastMessageAtUtc)}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-black ${
                        TONE_BADGE[selectedView!.tone]
                      }`}
                    >
                      {selectedView!.label}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setShowDetails((value) => !value)}
                  className="rounded-xl px-3 text-xs"
                >
                  {showDetails ? "اخفي التفاصيل" : "تفاصيل العميل"}
                </Button>
              {selected.aiMode === "AUTO" ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => composerRef.current?.focus()}
                  className="shrink-0 rounded-xl"
                >
                  رد بنفسك
                </Button>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant={selected.aiMode === "SAFETY_PAUSED" ? "outline" : "default"}
                  onClick={() => {
                    if (
                      selected.aiMode !== "SAFETY_PAUSED"
                      || window.confirm("راجعت المحادثة ومتأكد إنك عايز تشغل الرد التلقائي؟")
                    ) {
                      void resumeAi();
                    }
                  }}
                  disabled={resuming}
                  className="shrink-0 rounded-xl"
                >
                  {resuming ? "..." : "رجّع الرد التلقائي"}
                </Button>
              )}
              </div>
            </div>

            {selected.aiMode === "HUMAN_PAUSED" ? (
              <div className="rounded-2xl border border-warning/20 bg-warning-soft/55 px-3 py-2.5 text-xs leading-5 text-warning">
                إنت أو حد من الفريق رد يدويًا، فالموظف الذكي سايب المحادثة ليكم دلوقتي.
              </div>
            ) : null}

            {selected.aiMode === "SAFETY_PAUSED" ? (
              <Alert variant="error" title="المحادثة محتاجة مراجعة">
                اتأكد إن مفيش رسالة اتبعت مرتين قبل ما ترجع الرد التلقائي.
              </Alert>
            ) : null}

            {selectedView?.failure ? (
              <Alert variant="error" title="العميل مستني رد">
                {selectedView.failure} رد بنفسك من الخانة تحت.
              </Alert>
            ) : null}
          </div>
        ) : (
          <div className="py-1">
            <h2 className="text-sm font-black">اختار محادثة</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              هتظهر الرسائل والرد هنا.
            </p>
          </div>
        )}
      </div>

      {error ? (
        <div className="border-b border-border bg-destructive/5 px-4 py-2.5 text-xs font-bold text-destructive" role="alert">
          {error}
        </div>
      ) : null}

      {selected ? (
        <div className="border-b border-border bg-surface/55 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span
                className={`h-2.5 w-2.5 rounded-full ${TONE_DOT[selectedView!.tone]}`}
              />
              <div>
                <p className="text-xs font-black text-foreground">
                  {selectedView!.stripTitle}
                </p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  {selectedView!.stripHint}
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex flex-1 flex-col gap-2 overflow-y-auto bg-surface/65 px-3 py-5 sm:px-5">
        {!selectedId ? (
          <EmptyState
            className="my-auto border-0 bg-transparent"
            title="اختار محادثة"
            description="افتح أي عميل من القائمة. لو محتاج تدخلك هنطلعهولك فوق تلقائيًا."
          />
        ) : loadingMessages ? (
          <div className="my-auto text-center text-sm text-muted-foreground">
            بنفتح المحادثة…
          </div>
        ) : messages.length === 0 ? (
          <div className="my-auto text-center text-sm text-muted-foreground">
            مفيش رسائل في المحادثة دي لسه.
          </div>
        ) : (
          <>
            {hasMoreMessages ? (
              <div className="flex justify-center py-1">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={loadingOlder}
                  onClick={() => void loadOlderMessages()}
                  className="rounded-full px-4 text-[10px]"
                >
                  {loadingOlder ? "بنحمّل الرسائل الأقدم…" : "تحميل رسائل أقدم"}
                </Button>
              </div>
            ) : (
              <div className="py-1 text-center text-[10px] text-muted-foreground">
                بداية المحادثة
              </div>
            )}
            {messages.map((message, index) => {
              const outgoing = message.direction === "OUTBOUND";
              const actor = messageActorLabel(message);
              const showDay =
                index === 0
                || messageDayKey(messages[index - 1]!) !== messageDayKey(message);
              const aiLike = message.origin === "AI" || message.origin === "UNKNOWN";
              return (
                <div key={message.messageId}>
                  {showDay ? (
                    <div className="my-3 flex justify-center">
                      <span className="rounded-full border border-border bg-card/90 px-3 py-1 text-[10px] font-bold text-muted-foreground shadow-sm">
                        {messageDayLabel(message)}
                      </span>
                    </div>
                  ) : null}
                  <div
                    className={`max-w-[88%] rounded-[18px] px-4 py-2.5 text-sm leading-6 shadow-sm sm:max-w-[75%] ${
                      outgoing
                        ? aiLike
                          ? "ms-auto rounded-br-md border border-primary/15 bg-primary/10 text-foreground"
                          : "ms-auto rounded-br-md bg-primary text-primary-foreground"
                        : "me-auto rounded-bl-md border border-border bg-card text-foreground"
                    }`}
                  >
                    {actor ? (
                      <div className="mb-1">
                        <span className={`rounded-full px-2 py-0.5 text-[9px] font-black ${
                          message.origin === "AI"
                            ? "bg-primary/15 text-primary"
                            : message.origin === "HUMAN"
                              ? "bg-success-soft text-success"
                              : "bg-secondary text-muted-foreground"
                        }`}>
                          {actor}
                        </span>
                      </div>
                    ) : null}
                    <p className="whitespace-pre-wrap break-words">
                      {messageBodyDisplay({
                        textContent: message.textContent,
                        contentType: message.contentType,
                      })}
                    </p>
                    <p
                      className={`mt-1 text-[9px] ${
                        outgoing && !aiLike
                          ? "text-primary-foreground/65"
                          : "text-muted-foreground"
                      }`}
                    >
                      {formatTime(message.providerTimestampUtc || message.receivedAtUtc)}
                    </p>
                  </div>
                </div>
              );
            })}
          </>
        )}
        <div ref={threadEndRef} />
      </div>

      {selectedId ? (
        <div className="border-t border-border bg-card p-3 pb-24 sm:p-4 sm:pb-24 md:pb-4">
          <div className="rounded-[22px] border border-border bg-surface/50 p-2 shadow-sm">
            <label className="sr-only" htmlFor={composerId}>
              اكتب ردك
            </label>
            <Textarea
              ref={composerRef}
              id={composerId}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={2}
              maxLength={4000}
              placeholder="اكتب ردك… واضغط Enter للإرسال"
              className="min-h-16 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void sendManual();
                }
              }}
            />
            <div className="flex items-center justify-between gap-3 px-1 pb-1">
              <p className="text-[10px] leading-4 text-muted-foreground">
                {selected?.aiMode === "AUTO"
                  ? "أول ما تبعت، الموظف الذكي هيقف في المحادثة دي تلقائيًا."
                  : selected?.aiMode === "HUMAN_PAUSED"
                    ? "المحادثة معاك. لما تخلص رجّعها للموظف الذكي."
                    : "راجع آخر الرسائل قبل ما ترجع الرد التلقائي."}
              </p>
              <Button
                type="button"
                size="sm"
                onClick={() => void sendManual()}
                disabled={sending || !draft.trim()}
                className="shrink-0 rounded-xl px-5"
              >
                {sending ? "..." : "إرسال"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );


  const detailsPane = selected ? (
    <aside className="hidden w-[19rem] shrink-0 border-s border-border bg-card xl:flex xl:flex-col">
      <div className="border-b border-border p-5">
        <p className="text-[11px] font-black text-primary">تفاصيل العميل</p>
        <div className="mt-4 flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-full bg-primary/10 text-base font-black text-primary">
            {contactInitial(selected)}
          </div>
          <div className="min-w-0">
            <h3 className="truncate text-sm font-black">{contactLabel(selected)}</h3>
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {selected.contactPhoneNormalized || "رقم الهاتف غير متاح"}
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-4 p-5">
        <div className="rounded-2xl bg-surface p-4">
          <p className="text-[10px] font-black text-muted-foreground">مين بيرد دلوقتي؟</p>
          <p className="mt-2 text-sm font-black">{aiStatusView(selected).label}</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {aiStatusView(selected).detail}
          </p>
        </div>

        <div className="rounded-2xl border border-border p-4">
          <p className="text-[10px] font-black text-muted-foreground">آخر نشاط</p>
          <p className="mt-2 text-sm font-bold">
            {formatTime(selected.lastMessageAtUtc) || "لسه مفيش نشاط"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {selected.lastMessageDirection === "INBOUND"
              ? "آخر رسالة كانت من العميل."
              : selected.lastMessageDirection === "OUTBOUND"
                ? "آخر رسالة اتبعتت من عندك."
                : "مفيش اتجاه رسالة متاح."}
          </p>
        </div>

        <div>
          <p className="mb-2 text-[10px] font-black text-muted-foreground">إجراءات سريعة</p>
          <div className="grid gap-2">
            {selected.aiMode === "AUTO" ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => composerRef.current?.focus()}
                className="justify-start rounded-xl"
              >
                رد بنفسك على العميل
              </Button>
            ) : (
              <Button
                type="button"
                variant={selected.aiMode === "SAFETY_PAUSED" ? "outline" : "default"}
                onClick={() => {
                  if (
                    selected.aiMode !== "SAFETY_PAUSED"
                    || window.confirm("راجعت المحادثة ومتأكد إنك عايز تشغل الرد التلقائي؟")
                  ) {
                    void resumeAi();
                  }
                }}
                disabled={resuming}
                className="justify-start rounded-xl"
              >
                {resuming
                  ? "..."
                  : selected.aiMode === "SAFETY_PAUSED"
                    ? "راجع وشغّل الرد"
                    : "رجّع الرد التلقائي"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </aside>
  ) : null;


  const mobileDetailsSheet = selected && showDetails ? (
    <div className="fixed inset-0 z-50 bg-black/30 p-3 backdrop-blur-[2px] xl:hidden">
      <button
        type="button"
        aria-label="إغلاق تفاصيل العميل"
        className="absolute inset-0"
        onClick={() => setShowDetails(false)}
      />
      <div className="absolute inset-x-3 bottom-3 rounded-[26px] border border-border bg-card p-5 shadow-2xl">
        <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-border" />
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-primary/10 text-base font-black text-primary">
              {contactInitial(selected)}
            </div>
            <div className="min-w-0">
              <h3 className="truncate text-sm font-black">{contactLabel(selected)}</h3>
              <p className="mt-1 truncate text-xs text-muted-foreground">
                {selected.contactPhoneNormalized || "رقم الهاتف غير متاح"}
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="rounded-xl"
            onClick={() => setShowDetails(false)}
          >
            تم
          </Button>
        </div>

        <div className="mt-5 grid gap-3">
          <div className="rounded-2xl bg-surface p-4">
            <p className="text-[10px] font-black text-muted-foreground">مين بيرد دلوقتي؟</p>
            <p className="mt-2 text-sm font-black">{aiStatusView(selected).label}</p>
          </div>
          <div className="rounded-2xl border border-border p-4">
            <p className="text-[10px] font-black text-muted-foreground">آخر نشاط</p>
            <p className="mt-2 text-sm font-bold">
              {formatTime(selected.lastMessageAtUtc) || "لسه مفيش نشاط"}
            </p>
          </div>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <>
    <div className="overflow-hidden rounded-[24px] border border-border bg-card shadow-sm">
      <div className="hidden h-[calc(100vh-10.5rem)] min-h-[36rem] md:flex">
        <div className="w-[min(23rem,34vw)] min-w-[18rem] shrink-0">
          {listPane}
        </div>
        {threadPane("inbox-manual-reply-desktop")}
        {showDetails ? detailsPane : null}
      </div>
      <div className="min-h-[calc(100vh-11rem)] md:hidden">
        {mobileShowThread && selectedId
          ? threadPane("inbox-manual-reply-mobile")
          : listPane}
      </div>
    </div>
    {mobileDetailsSheet}
    </>
  );
}

export { serializeConversations };
