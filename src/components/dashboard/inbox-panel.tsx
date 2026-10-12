"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { messageBodyDisplay } from "@/lib/ui/labels";
import { mapUserFacingError } from "@/lib/ui/user-errors";
import type { AiReplyHealth, AiReplyHealthReason } from "@/types/domain";

export type ConversationAiMode = "AUTO" | "HUMAN_PAUSED" | "SAFETY_PAUSED";
type InboxFilter = "ALL" | "UNREAD" | "HUMAN" | "AUTO";
type GlyphName =
  | "chat" | "back" | "search" | "refresh" | "settings" | "bot"
  | "book" | "send" | "info" | "close" | "check" | "alert"
  | "chevron" | "menu" | "home" | "spark" | "arrow-down";

type ConversationCursor = { beforeAt: string; beforeId: string };
type Counts = { total: number; unread: number };

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
  unread: boolean;
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

const LIST_PAGE_SIZE = 60;
const MESSAGE_PAGE_SIZE = 100;
const LIST_POLL_MS = 12_000;
const THREAD_POLL_MS = 5_000;

const shapes: Record<GlyphName, ReactNode> = {
  chat: <><path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5c-1.3 0-2.5-.3-3.6-.9L4 20l1.6-4.8A7.5 7.5 0 1 1 20 11.5Z" /><path d="M8 10h8M8 13h5" /></>,
  back: <><path d="m15 18-6-6 6-6" /></>,
  search: <><circle cx="10.7" cy="10.7" r="6.5" /><path d="m16 16 4.2 4.2" /></>,
  refresh: <><path d="M20 7v5h-5M4 17v-5h5" /><path d="M5 9a7.7 7.7 0 0 1 12.5-2.2L20 12M4 12l2.5 5.2A7.7 7.7 0 0 0 19 15" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.7l.1.1-2 2-.1-.1a1.6 1.6 0 0 0-1.7-.3 1.6 1.6 0 0 0-1 1.4V20h-3v-.2a1.6 1.6 0 0 0-1-1.4 1.6 1.6 0 0 0-1.7.3l-.1.1-2-2 .1-.1a1.6 1.6 0 0 0 .3-1.7 1.6 1.6 0 0 0-1.4-1H6v-3h.2a1.6 1.6 0 0 0 1.4-1 1.6 1.6 0 0 0-.3-1.7l-.1-.1 2-2 .1.1a1.6 1.6 0 0 0 1.7.3 1.6 1.6 0 0 0 1-1.4V5h3v.2a1.6 1.6 0 0 0 1 1.4 1.6 1.6 0 0 0 1.7-.3l.1-.1 2 2-.1.1a1.6 1.6 0 0 0-.3 1.7 1.6 1.6 0 0 0 1.4 1h.2v3h-.2a1.6 1.6 0 0 0-1.4 1Z" transform="translate(-1 -1)" /></>,
  bot: <><rect x="4" y="7" width="16" height="13" rx="4" /><path d="M12 7V4m-2 0h4M8.5 13h.1m7 0h.1M9 17h6" /></>,
  book: <><path d="M5 4h14v15H8a3 3 0 0 0-3 3V4Zm0 15a3 3 0 0 1 3-3h11" /><path d="M9 9h6M9 12h6" /></>,
  send: <><path d="m3 11 18-8-8 18-2-8-8-2Z" /><path d="m11 13 10-10" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5m0-8h.01" /></>,
  close: <><path d="m6 6 12 12M18 6 6 18" /></>,
  check: <><path d="m5 12 4 4L19 6" /></>,
  alert: <><path d="M12 3 2 21h20L12 3Z" /><path d="M12 9v5m0 3h.01" /></>,
  chevron: <><path d="m9 6 6 6-6 6" /></>,
  menu: <><path d="M4 7h16M4 12h16M4 17h16" /></>,
  home: <><path d="m3 11 9-8 9 8v10H3V11Z" /><path d="M9 21v-7h6v7" /></>,
  spark: <><path d="m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5L12 2Z" /></>,
  "arrow-down": <><path d="M12 4v16m-6-6 6 6 6-6" /></>,
};

function Glyph({
  name, size = 20, className = "",
}: { name: GlyphName; size?: number; className?: string }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"
      strokeLinejoin="round" aria-hidden="true" className={className}
    >{shapes[name]}</svg>
  );
}

function contactLabel(c: ConversationRow): string {
  if (c.contactDisplayName?.trim()) return c.contactDisplayName.trim();
  if (c.contactPhoneNormalized) return c.contactPhoneNormalized;
  const matched = /^(\d+)@/i.exec(c.contactExternalKey);
  return matched ? matched[1] : c.contactExternalKey;
}

function contactInitial(c: ConversationRow): string {
  return contactLabel(c).trim().slice(0, 1).toUpperCase() || "؟";
}

function avatarTone(key: string) {
  const colors = [
    "bg-[#d8eff0] text-[#186b71] dark:bg-[#173b40] dark:text-[#8fe3dc]",
    "bg-[#f2e4d5] text-[#9c6138] dark:bg-[#4a3325] dark:text-[#f6c69e]",
    "bg-[#eadff6] text-[#7653a3] dark:bg-[#352a48] dark:text-[#ceb0f3]",
    "bg-[#dce9fb] text-[#47699d] dark:bg-[#25354d] dark:text-[#a9c7fa]",
    "bg-[#f6dfdf] text-[#aa5b65] dark:bg-[#49292d] dark:text-[#fac0c5]",
  ];
  let hash = 0;
  for (const c of key) hash = (hash * 31 + c.charCodeAt(0)) | 0;
  return colors[Math.abs(hash) % colors.length];
}

function timeLabel(iso: string | null, short = false): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const today = new Date();
  if (date.toDateString() === today.toDateString()) {
    return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
  }
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "أمس";
  return new Intl.DateTimeFormat("ar-EG", short ? { day: "numeric", month: "numeric" } : { day: "numeric", month: "short" }).format(date);
}

function messageClock(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" :
    new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
}

function messageDayKey(m: MessageRow) {
  const d = new Date(m.providerTimestampUtc || m.receivedAtUtc || m.createdAtUtc);
  return d.toDateString();
}

function messageDay(m: MessageRow) {
  const d = new Date(m.providerTimestampUtc || m.receivedAtUtc || m.createdAtUtc);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return "اليوم";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "أمس";
  return new Intl.DateTimeFormat("ar-EG", { day: "numeric", month: "long", year: "numeric" }).format(d);
}

const FAILURES: Partial<Record<AiReplyHealthReason, string>> = {
  AI_DISABLED: "الرد الآلي غير مفعّل للرقم ده.",
  WORKER_STALLED: "الموظف الذكي متأخر في معالجة الرسالة.",
  NOT_SCHEDULED: "آخر رسالة لم يتم جدولتها للرد.",
  UNSUPPORTED_CONTENT: "الرسالة محتاجة متابعة بشرية لأنها مش نص.",
  AI_GENERATION_FAILED: "تعذر تجهيز الرد من الموظف الذكي.",
  WHATSAPP_SEND_FAILED: "تعذر إرسال الرد على واتساب.",
  QUOTA_EXCEEDED: "حد الاستخدام الحالي للردود انتهى.",
  AGENT_UNAVAILABLE: "الموظف الذكي غير متاح حاليًا.",
  DESTINATION_UNAVAILABLE: "رقم العميل غير متاح للإرسال.",
  LOOP_GUARD: "الرد متوقف مؤقتًا لمنع التكرار.",
  UNKNOWN: "آخر رسالة لم يتم الرد عليها.",
};

function conversationStatus(c: ConversationRow): {
  label: string; detail: string; color: string; dot: string; attention: boolean;
} {
  if (c.aiMode === "SAFETY_PAUSED") return {
    label: "محتاج مراجعة", detail: "مراجعة أمان قبل تشغيل الرد",
    color: "text-rose-600 dark:text-rose-300",
    dot: "bg-rose-500", attention: true,
  };
  if (c.aiMode === "HUMAN_PAUSED") return {
    label: "مع الفريق", detail: "الموظف البشري مسؤول عن الرد",
    color: "text-amber-700 dark:text-amber-300",
    dot: "bg-amber-500", attention: true,
  };
  const health = c.aiReplyHealth;
  if (health?.state === "DISABLED" || health?.state === "FAILED") return {
    label: "محتاج تدخل", detail: FAILURES[health.reason ?? "UNKNOWN"] ?? FAILURES.UNKNOWN!,
    color: "text-rose-600 dark:text-rose-300",
    dot: "bg-rose-500", attention: true,
  };
  if (health?.state === "REPLYING") return {
    label: "بيجهّز رد", detail: "الموظف الذكي بيجهّز الرد",
    color: "text-sky-700 dark:text-sky-300",
    dot: "bg-sky-500", attention: false,
  };
  return {
    label: "AI شغال", detail: "الموظف الذكي بيتابع المحادثة",
    color: "text-emerald-700 dark:text-emerald-300",
    dot: "bg-emerald-500", attention: false,
  };
}

function sortRows(rows: ConversationRow[]) {
  return [...rows].sort((a, b) => {
    const da = new Date(a.lastMessageAtUtc ?? 0).getTime();
    const db = new Date(b.lastMessageAtUtc ?? 0).getTime();
    return db - da || b.conversationId.localeCompare(a.conversationId);
  });
}

export function serializeConversations(rows: Array<{
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
  unread?: boolean;
}>): ConversationRow[] {
  return rows.map(c => ({
    conversationId: c.conversationId,
    contactExternalKey: c.contactExternalKey,
    contactDisplayName: c.contactDisplayName,
    contactPhoneNormalized: c.contactPhoneNormalized,
    lastMessagePreview: c.lastMessagePreview,
    lastMessageDirection: c.lastMessageDirection,
    lastMessageAtUtc: c.lastMessageAtUtc ? new Date(c.lastMessageAtUtc).toISOString() : null,
    status: c.status,
    aiMode: c.aiMode ?? "AUTO",
    aiPauseReason: c.aiPauseReason ?? null,
    aiReplyHealth: c.aiReplyHealth ?? null,
    unread: Boolean(c.unread),
  }));
}

function ActionIcon({
  name, title, onClick, disabled, active = false,
}: {
  name: GlyphName; title: string; onClick: () => void; disabled?: boolean; active?: boolean;
}) {
  return (
    <button
      type="button" onClick={onClick} disabled={disabled} title={title}
      aria-label={title} aria-pressed={active}
      className={
        "grid h-10 w-10 shrink-0 place-items-center rounded-xl transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0e9f97] disabled:opacity-40 " +
        (active ? "bg-[#d3f1ed] text-[#087b73] dark:bg-[#174840] dark:text-[#86e7d6]"
          : "text-[#74817d] hover:bg-[#e5ede9] hover:text-[#1e3530] dark:text-[#9caeaa] dark:hover:bg-[#253831] dark:hover:text-white")
      }
    >
      <Glyph name={name} />
    </button>
  );
}

function Avatar({ c, size = "md" }: { c: ConversationRow; size?: "sm" | "md" | "lg" }) {
  const shape = size === "lg" ? "h-[76px] w-[76px] text-[30px]"
    : size === "sm" ? "h-10 w-10 text-base" : "h-[46px] w-[46px] text-lg";
  return <div className={
    "grid shrink-0 place-items-center rounded-full font-bold select-none " +
    shape + " " + avatarTone(c.conversationId)
  }>{contactInitial(c)}</div>;
}

export function InboxPanel({
  initialConversations, initialCounts, initialHasMore, initialCursor,
}: {
  initialConversations: ConversationRow[];
  initialCounts: Counts;
  initialHasMore: boolean;
  initialCursor: ConversationCursor | null;
}) {
  const [conversations, setConversations] = useState(initialConversations);
  const [counts, setCounts] = useState(initialCounts);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [cursor, setCursor] = useState<ConversationCursor | null>(initialCursor);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filter, setFilter] = useState<InboxFilter>("ALL");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedSnapshot, setSelectedSnapshot] = useState<ConversationRow | null>(null);
  const [mobileThread, setMobileThread] = useState(false);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [loadingThread, setLoadingThread] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasOlder, setHasOlder] = useState(false);
  const [olderCursor, setOlderCursor] = useState<MessageCursor | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showScrollDown, setShowScrollDown] = useState(false);

  const selectedIdRef = useRef<string | null>(null);
  const mobileThreadRef = useRef(false);
  const readWatermarksRef = useRef<Map<string, string>>(new Map());
  const listRequestRef = useRef(0);
  const listBusyRef = useRef(false);
  const listScroller = useRef<HTMLDivElement | null>(null);
  const listSentinel = useRef<HTMLDivElement | null>(null);
  const messageScroller = useRef<HTMLDivElement | null>(null);
  const textArea = useRef<HTMLTextAreaElement | null>(null);
  const searchInput = useRef<HTMLInputElement | null>(null);
  const shouldStickBottom = useRef(true);
  const previousMessageKey = useRef("");
  const restoringOlder = useRef<{ height: number; top: number } | null>(null);

  const selected = conversations.find(c => c.conversationId === selectedId)
    ?? (selectedSnapshot?.conversationId === selectedId ? selectedSnapshot : null);
  const draft = selectedId ? drafts[selectedId] ?? "" : "";
  const status = selected ? conversationStatus(selected) : null;

  const setDraft = useCallback((value: string) => {
    const id = selectedIdRef.current;
    if (!id) return;
    setDrafts(prev => ({ ...prev, [id]: value }));
  }, []);

  useEffect(() => { selectedIdRef.current = selectedId; }, [selectedId]);
  useEffect(() => { mobileThreadRef.current = mobileThread; }, [mobileThread]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(searchText.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [searchText]);

  const loadFirstPage = useCallback(async (silent = false) => {
    const requestId = ++listRequestRef.current;
    if (!silent) setLoadingList(true);
    try {
      const params = new URLSearchParams({
        limit: String(LIST_PAGE_SIZE), filter, search: debouncedSearch,
      });
      const response = await fetch("/api/inbox/conversations?" + params.toString(), {
        credentials: "same-origin", cache: "no-store",
      });
      const data = await response.json() as {
        conversations?: Array<ConversationRow & { lastMessageAtUtc: Date | string | null }>;
        counts?: Counts;
        hasMore?: boolean;
        nextCursor?: ConversationCursor | null;
        error?: string;
      };
      if (!response.ok) throw new Error(mapUserFacingError(data, "تعذر تحديث الشاتات"));
      if (requestId !== listRequestRef.current) return;
      const latest = serializeConversations(data.conversations ?? []);
      setConversations(prev => {
        if (!silent) return latest;
        const byId = new Map<string, ConversationRow>();
        for (const row of prev) byId.set(row.conversationId, row);
        for (const row of latest) byId.set(row.conversationId, row);
        return sortRows([...byId.values()]);
      });
      if (data.counts) setCounts(data.counts);
      const updatedSelection = latest.find(c => c.conversationId === selectedIdRef.current);
      if (updatedSelection) setSelectedSnapshot(updatedSelection);
      if (!silent) {
        setCursor(data.nextCursor ?? null);
        setHasMore(Boolean(data.hasMore));
      }
    } catch (err) {
      if (!silent) setError(err instanceof Error ? err.message : "تعذر تحميل المحادثات");
    } finally {
      if (requestId === listRequestRef.current) setLoadingList(false);
    }
  }, [filter, debouncedSearch]);

  const loadNextPage = useCallback(async () => {
    if (!hasMore || !cursor || loadingMore || loadingList || listBusyRef.current) return;
    listBusyRef.current = true;
    setLoadingMore(true);
    const requestId = listRequestRef.current;
    try {
      const params = new URLSearchParams({
        limit: String(LIST_PAGE_SIZE), filter, search: debouncedSearch,
        beforeAt: cursor.beforeAt, beforeId: cursor.beforeId,
      });
      const response = await fetch("/api/inbox/conversations?" + params.toString(), {
        credentials: "same-origin", cache: "no-store",
      });
      const data = await response.json() as {
        conversations?: ConversationRow[];
        nextCursor?: ConversationCursor | null;
        hasMore?: boolean;
        counts?: Counts;
        error?: string;
      };
      if (!response.ok) throw new Error(mapUserFacingError(data, "تعذر تحميل محادثات أكثر"));
      if (requestId !== listRequestRef.current) return;
      const next = serializeConversations(data.conversations ?? []);
      setConversations(prev => {
        const known = new Set(prev.map(c => c.conversationId));
        return sortRows([...prev, ...next.filter(c => !known.has(c.conversationId))]);
      });
      setHasMore(Boolean(data.hasMore));
      setCursor(data.nextCursor ?? null);
      if (data.counts) setCounts(data.counts);
      const updatedSelection = next.find(c => c.conversationId === selectedIdRef.current);
      if (updatedSelection) setSelectedSnapshot(updatedSelection);
    } catch (err) {
      if (requestId === listRequestRef.current) {
        setError(err instanceof Error ? err.message : "تعذر تحميل محادثات أكثر");
      }
    } finally {
      listBusyRef.current = false;
      setLoadingMore(false);
    }
  }, [hasMore, cursor, loadingMore, loadingList, filter, debouncedSearch]);

  useEffect(() => {
    if (filter === "ALL" && debouncedSearch === "" && listRequestRef.current === 0) {
      // Initial server-rendered page is ready; avoid a duplicate request.
      listRequestRef.current = 1;
      return;
    }
    listRequestRef.current += 1;
    setCursor(null);
    setHasMore(false);
    setConversations([]);
    listScroller.current?.scrollTo({ top: 0 });
    void loadFirstPage();
  }, [filter, debouncedSearch, loadFirstPage]);

  useEffect(() => {
    const root = listScroller.current;
    const target = listSentinel.current;
    if (!root || !target || !hasMore || loadingMore || loadingList) return;
    const observer = new IntersectionObserver(
      entries => { if (entries.some(e => e.isIntersecting)) void loadNextPage(); },
      { root, rootMargin: "240px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [loadNextPage, hasMore, loadingMore, loadingList, conversations.length]);

  const acknowledgeRead = useCallback(async (id: string, visible: MessageRow[]) => {
    const received = visible.filter(m => m.direction === "INBOUND")
      .map(m => m.receivedAtUtc)
      .filter(Boolean)
      .sort();
    const upTo = received.at(-1);
    if (!upTo || document.hidden || readWatermarksRef.current.get(id) === upTo) return;
    if (window.matchMedia("(max-width: 767px)").matches && !mobileThreadRef.current) return;
    try {
      const res = await fetch(
        "/api/inbox/conversations/" + encodeURIComponent(id) + "/read",
        { method: "POST", credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ upTo: new Date(upTo).toISOString() }) },
      );
      if (res.ok && selectedIdRef.current === id) {
        readWatermarksRef.current.set(id, upTo);
        setConversations(prev => prev.map(c => c.conversationId === id ? { ...c, unread: false } : c));
        setSelectedSnapshot(prev => prev?.conversationId === id ? { ...prev, unread: false } : prev);
        // Exact server counts refresh on next list poll.
      }
    } catch {
      // Read receipts must not block message rendering.
    }
  }, []);

  const loadMessages = useCallback(async (id: string, silent = false) => {
    if (!silent) setLoadingThread(true);
    try {
      const response = await fetch(
        "/api/inbox/conversations/" + encodeURIComponent(id) +
          "/messages?limit=" + MESSAGE_PAGE_SIZE,
        { credentials: "same-origin", cache: "no-store" },
      );
      const data = await response.json() as { messages?: MessageRow[]; error?: string };
      if (!response.ok) throw new Error(mapUserFacingError(data, "تعذر تحميل الرسائل"));
      if (selectedIdRef.current !== id) return;
      const next = data.messages ?? [];
      if (silent) {
        setMessages(prev => {
          const byId = new Map(prev.map(m => [m.messageId, m]));
          for (const item of next) byId.set(item.messageId, item);
          return [...byId.values()].sort((a,b) => {
            const ta = new Date(a.providerTimestampUtc || a.createdAtUtc).getTime();
            const tb = new Date(b.providerTimestampUtc || b.createdAtUtc).getTime();
            return ta - tb || a.messageId.localeCompare(b.messageId);
          });
        });
      } else {
        shouldStickBottom.current = true;
        setMessages(next);
        setHasOlder(next.length === MESSAGE_PAGE_SIZE);
        const first = next[0];
        setOlderCursor(first ? {
          beforeAt: first.providerTimestampUtc || first.createdAtUtc,
          beforeCreatedAt: first.createdAtUtc,
          beforeMessageId: first.messageId,
        } : null);
      }
      void acknowledgeRead(id, next);
    } catch (err) {
      if (!silent && selectedIdRef.current === id) {
        setMessages([]);
        setError(err instanceof Error ? err.message : "تعذر تحميل الرسائل");
      }
    } finally {
      if (!silent && selectedIdRef.current === id) setLoadingThread(false);
    }
  }, [acknowledgeRead]);

  const selectConversation = useCallback((id: string) => {
    selectedIdRef.current = id;
    setSelectedId(id);
    setSelectedSnapshot(conversations.find(c => c.conversationId === id) ?? null);
    mobileThreadRef.current = true;
    setMobileThread(true);
    setDetailsOpen(false);
    setNotice(null);
    setError(null);
    setMessages([]);
    setHasOlder(false);
    setOlderCursor(null);
    shouldStickBottom.current = true;
    void loadMessages(id);
  }, [loadMessages, conversations]);

  const loadOlder = useCallback(async () => {
    const id = selectedIdRef.current;
    if (!id || !olderCursor || !hasOlder || loadingOlder) return;
    setLoadingOlder(true);
    const scroller = messageScroller.current;
    if (scroller) restoringOlder.current = { height: scroller.scrollHeight, top: scroller.scrollTop };
    try {
      const params = new URLSearchParams({
        limit: String(MESSAGE_PAGE_SIZE),
        beforeAt: olderCursor.beforeAt,
        beforeCreatedAt: olderCursor.beforeCreatedAt,
        beforeMessageId: olderCursor.beforeMessageId,
      });
      const res = await fetch(
        "/api/inbox/conversations/" + encodeURIComponent(id) + "/messages?" + params.toString(),
        { credentials: "same-origin", cache: "no-store" },
      );
      const data = await res.json() as { messages?: MessageRow[]; error?: string };
      if (!res.ok) throw new Error(mapUserFacingError(data, "تعذر تحميل الرسائل الأقدم"));
      if (selectedIdRef.current !== id) return;
      const older = data.messages ?? [];
      setMessages(prev => {
        const known = new Set(prev.map(m => m.messageId));
        return [...older.filter(m => !known.has(m.messageId)), ...prev];
      });
      setHasOlder(older.length === MESSAGE_PAGE_SIZE);
      const first = older[0];
      setOlderCursor(first ? {
        beforeAt: first.providerTimestampUtc || first.createdAtUtc,
        beforeCreatedAt: first.createdAtUtc,
        beforeMessageId: first.messageId,
      } : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر تحميل الرسائل");
    } finally { setLoadingOlder(false); }
  }, [olderCursor, hasOlder, loadingOlder]);

  useEffect(() => {
    const scroller = messageScroller.current;
    if (!scroller) return;
    if (restoringOlder.current) {
      const before = restoringOlder.current;
      scroller.scrollTop = before.top + scroller.scrollHeight - before.height;
      restoringOlder.current = null;
      return;
    }
    const latestKey = messages.at(-1)?.messageId ?? "";
    if (latestKey && latestKey !== previousMessageKey.current && shouldStickBottom.current) {
      scroller.scrollTop = scroller.scrollHeight;
    }
    previousMessageKey.current = latestKey;
  }, [messages, selectedId]);

  const scrollToBottom = useCallback(() => {
    const el = messageScroller.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    shouldStickBottom.current = true;
    setShowScrollDown(false);
  }, []);

  useEffect(() => {
    const tick = () => {
      if (document.hidden) return;
      void loadFirstPage(true);
    };
    const interval = window.setInterval(tick, LIST_POLL_MS);
    return () => window.clearInterval(interval);
  }, [loadFirstPage]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (document.hidden) return;
      const id = selectedIdRef.current;
      if (id) void loadMessages(id, true);
    }, THREAD_POLL_MS);
    return () => window.clearInterval(interval);
  }, [loadMessages]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (e.key === "Escape") {
        setDetailsOpen(false);
        if (mobileThread) setMobileThread(false);
        return;
      }
      if (
        (e.key === "/" || (e.key.toLowerCase() === "k" && (e.ctrlKey || e.metaKey)))
        && !target?.matches("input,textarea,[contenteditable=true]")
      ) {
        e.preventDefault();
        searchInput.current?.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mobileThread]);

  const sendManual = useCallback(async () => {
    const id = selectedIdRef.current;
    const text = (id ? drafts[id] ?? "" : "").trim();
    if (!id || !text || sending) return;
    setSending(true);
    setError(null);
    const idempotencyKey = crypto.randomUUID();
    try {
      const res = await fetch(
        "/api/inbox/conversations/" + encodeURIComponent(id) + "/messages",
        {
          method: "POST", credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, idempotencyKey }),
        },
      );
      const data = await res.json() as { status?: string; error?: string; code?: string };
      if (data.status === "AMBIGUOUS") {
        throw new Error("نتيجة إرسال الرسالة غير مؤكدة. راجع المحادثة قبل ما تعيد المحاولة.");
      }
      if (!res.ok) throw new Error(mapUserFacingError(data, "تعذر إرسال الرسالة"));
      setDrafts(prev => ({ ...prev, [id]: "" }));
      if (textArea.current) textArea.current.style.height = "auto";
      const newManualState = {
        aiMode: "HUMAN_PAUSED" as const,
        aiPauseReason: "HUMAN_TAKEOVER",
        aiReplyHealth: null,
        lastMessagePreview: text,
        lastMessageDirection: "OUTBOUND" as const,
        lastMessageAtUtc: new Date().toISOString(),
      };
      setSelectedSnapshot(prev => prev?.conversationId === id ? { ...prev, ...newManualState } : prev);
      setConversations(prev => sortRows(prev.map(c => c.conversationId !== id ? c : {
        ...c,
        aiMode: "HUMAN_PAUSED" as const,
        aiPauseReason: "HUMAN_TAKEOVER",
        aiReplyHealth: null,
        lastMessagePreview: text,
        lastMessageDirection: "OUTBOUND" as const,
        lastMessageAtUtc: new Date().toISOString(),
      })));
      await loadMessages(id, true);
      shouldStickBottom.current = true;
      scrollToBottom();
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر إرسال الرسالة");
    } finally {
      setSending(false);
    }
  }, [drafts, sending, loadMessages, scrollToBottom]);

  const resumeAi = useCallback(async () => {
    const id = selectedIdRef.current;
    if (!id || resuming) return;
    const c = conversations.find(item => item.conversationId === id);
    if (c?.aiMode === "SAFETY_PAUSED" &&
      !window.confirm("راجع الرسائل واتأكد إن مفيش رد مكرر قبل تشغيل الموظف الذكي.")) return;
    setResuming(true);
    setError(null);
    try {
      const res = await fetch(
        "/api/inbox/conversations/" + encodeURIComponent(id) + "/ai/resume",
        { method: "POST", credentials: "same-origin" },
      );
      const data = await res.json() as {
        state?: { mode: ConversationAiMode; pauseReason: string | null };
        catchUp?: { scheduled: boolean; pendingCount: number; reason?: string };
        error?: string;
      };
      if (!res.ok) throw new Error(mapUserFacingError(data, "تعذر إرجاع الرد التلقائي"));
      setSelectedSnapshot(prev => prev?.conversationId === id
        ? { ...prev, aiMode: data.state?.mode ?? "AUTO", aiPauseReason: data.state?.pauseReason ?? null }
        : prev);
      setConversations(prev => prev.map(item => item.conversationId !== id ? item : {
        ...item, aiMode: data.state?.mode ?? "AUTO",
        aiPauseReason: data.state?.pauseReason ?? null,
      }));
      const result = data.catchUp;
      setNotice(result?.scheduled
        ? "تم تسليم المحادثة للموظف الذكي، والرد على " + result.pendingCount + " رسالة متعلقة اتجدول."
        : result?.reason === "AI_DISABLED"
          ? "تم تسليم المحادثة، لكن الرد الآلي مقفول من إعدادات الرقم."
          : result?.reason === "REPLY_IN_FLIGHT"
            ? "فيه رد بيتبعت بالفعل. استنى وشوف المحادثة قبل أي إجراء."
            : result?.reason === "STALE_INBOUND"
              ? "البوت رجع. الرسالة السابقة قديمة ومش هيرد عليها تلقائيًا."
              : "الرد الآلي رجع للمحادثة. مفيش رد جديد اتجدول.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر تشغيل الموظف الذكي");
    } finally { setResuming(false); }
  }, [conversations, resuming]);

  const actionFilters: Array<{ id: InboxFilter; label: string; count?: number }> = [
    { id: "ALL", label: "الكل", count: counts.total },
    { id: "UNREAD", label: "غير مقروء", count: counts.unread },
    { id: "HUMAN", label: "مع الفريق" },
    { id: "AUTO", label: "الرد الآلي" },
  ];

  const grouped = useMemo(() => sortRows(conversations), [conversations]);
  const loadedCount = grouped.length;
  const failedCount = grouped.filter(c => conversationStatus(c).attention).length;

  return (
    <div dir="rtl" className="flex h-full min-h-0 w-full overflow-hidden bg-[#f7f9f7] font-[family-name:var(--font-alexandria)] text-[#172824] dark:bg-[#101b19] dark:text-[#eaf1ee]">
      <nav className="hidden w-[68px] shrink-0 flex-col items-center justify-between border-l border-[#dce6e1] bg-[#edf3ef] py-4 md:flex dark:border-[#263b34] dark:bg-[#162722]" aria-label="التنقل السريع">
        <div className="flex w-full flex-col items-center gap-4">
          <Link href="/dashboard" className="grid h-11 w-11 place-items-center rounded-2xl bg-[#087f76] text-xl font-black text-white shadow-sm" aria-label="DRVO الرئيسية">D</Link>
          <div className="my-1 h-px w-7 bg-[#d2ded8] dark:bg-[#355147]" />
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-[#d0eae2] text-[#007f6f] dark:bg-[#225448] dark:text-[#9de6d2]" title="المحادثات">
            <Glyph name="chat" size={22} />
          </div>
          <Link href="/dashboard/agent" title="موظف الاستقبال" aria-label="موظف الاستقبال" className="grid h-11 w-11 place-items-center rounded-xl text-[#758b83] hover:bg-white dark:hover:bg-white/10"><Glyph name="bot" /></Link>
          <Link href="/dashboard/knowledge" title="المعرفة" aria-label="المعرفة" className="grid h-11 w-11 place-items-center rounded-xl text-[#758b83] hover:bg-white dark:hover:bg-white/10"><Glyph name="book" /></Link>
        </div>
        <div className="flex flex-col items-center gap-2">
          <Link href="/dashboard/settings" title="الإعدادات" aria-label="الإعدادات" className="grid h-11 w-11 place-items-center rounded-xl text-[#758b83] hover:bg-white dark:hover:bg-white/10"><Glyph name="settings" /></Link>
          <Link href="/dashboard" title="الرئيسية" aria-label="الرئيسية" className="grid h-11 w-11 place-items-center rounded-xl text-[#758b83] hover:bg-white dark:hover:bg-white/10"><Glyph name="home" /></Link>
        </div>
      </nav>

      <aside className={
        "flex h-full min-h-0 w-full shrink-0 flex-col border-l border-[#dbe5e0] bg-white md:w-[350px] xl:w-[392px] dark:border-[#273d35] dark:bg-[#182622] " +
        (mobileThread ? "hidden md:flex" : "flex")
      } aria-label="قائمة المحادثات">
        <header className="shrink-0 border-b border-[#ecf0ed] px-4 pb-3 pt-4 dark:border-[#2b4038]">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <Link href="/dashboard" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#e3f1ed] text-[#078b7b] md:hidden dark:bg-[#24483c]" aria-label="الرجوع للرئيسية"><Glyph name="home" /></Link>
              <div>
                <h1 className="text-[21px] font-extrabold tracking-tight">المحادثات</h1>
                <p className="mt-0.5 text-[11px] text-[#83908a] dark:text-[#94aaa1]">
                  {counts.total.toLocaleString("ar-EG")} محادثة محفوظة في DRVO
                </p>
              </div>
            </div>
            <div className="flex items-center gap-0.5">
              <ActionIcon name="refresh" title="تحديث المحادثات" onClick={() => void loadFirstPage()} disabled={loadingList} />
              <Link href="/dashboard/agent" className="grid h-10 w-10 place-items-center rounded-xl text-[#087f76] hover:bg-[#e5f5f0] dark:text-[#91dfc8] dark:hover:bg-white/10" title="إعدادات الموظف الذكي"><Glyph name="spark" /></Link>
            </div>
          </div>
          <div className="flex h-11 items-center gap-2 rounded-xl bg-[#f1f5f2] px-3 ring-1 ring-transparent focus-within:ring-[#43b5a3] dark:bg-[#233630]">
            <Glyph name="search" size={19} className="shrink-0 text-[#7f8f89]" />
            <input
              ref={searchInput} type="search" value={searchText}
              onChange={e => setSearchText(e.target.value)}
              placeholder="ابحث بالاسم أو الرقم..."
              aria-label="بحث في جميع المحادثات"
              className="h-full min-w-0 flex-1 bg-transparent text-[13px] font-medium outline-none placeholder:text-[#8a9a93]"
            />
            {searchText ? <button type="button" title="مسح البحث" aria-label="مسح البحث" onClick={() => setSearchText("")}><Glyph name="close" size={16} /></button> : <kbd className="hidden text-[10px] text-[#99a7a1] lg:block">Ctrl K</kbd>}
          </div>
          <div className="mt-3 flex gap-1.5 overflow-x-auto [scrollbar-width:none]" role="group" aria-label="فلاتر المحادثات">
            {actionFilters.map(item => (
              <button
                key={item.id} type="button" onClick={() => setFilter(item.id)}
                aria-pressed={filter === item.id}
                className={
                  "flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-[11px] font-bold transition " +
                  (filter === item.id
                    ? "bg-[#087f76] text-white"
                    : "bg-[#eff3f0] text-[#6e8278] hover:bg-[#e1ece5] dark:bg-[#273c34] dark:text-[#bdd0c6] dark:hover:bg-[#355044]")
                }
              >
                {item.label}
                {item.count !== undefined ? <span className="tabular-nums opacity-75">{item.count}</span> : null}
              </button>
            ))}
          </div>
        </header>

        {error && !selectedId ? <div role="alert" className="border-b border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700">{error}</div> : null}
        <div ref={listScroller} className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-width:thin]" aria-live="polite">
          {loadingList && grouped.length === 0 ? (
            <div className="space-y-1 p-3" aria-label="جاري تحميل المحادثات">
              {Array.from({ length: 7 }, (_,i) => <div key={i} className="flex animate-pulse gap-3 rounded-xl p-3"><span className="h-11 w-11 rounded-full bg-[#e9efea] dark:bg-[#30473d]" /><span className="flex-1 space-y-2 pt-1"><span className="block h-3 w-1/2 rounded bg-[#e9efea] dark:bg-[#30473d]" /><span className="block h-2 w-5/6 rounded bg-[#e9efea] dark:bg-[#30473d]" /></span></div>)}
            </div>
          ) : grouped.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center px-8 text-center">
              <span className="mb-3 grid h-14 w-14 place-items-center rounded-full bg-[#e7f4ee] text-[#0a8777] dark:bg-[#23473c]"><Glyph name="chat" size={26} /></span>
              <p className="text-sm font-bold">{debouncedSearch ? "مفيش نتائج مطابقة" : "مفيش محادثات في الفلتر ده"}</p>
              <p className="mt-1.5 text-xs leading-6 text-[#84968b]">جرّب اسم تاني أو غيّر الفلتر لعرض محادثات أكتر.</p>
              {(debouncedSearch || filter !== "ALL") && <button type="button" onClick={() => { setSearchText(""); setFilter("ALL"); }} className="mt-3 rounded-lg bg-[#e5f4ef] px-4 py-2 text-xs font-bold text-[#087f76]">اعرض الكل</button>}
            </div>
          ) : (
            <ul>
              {grouped.map(c => {
                const active = selectedId === c.conversationId;
                const s = conversationStatus(c);
                return (
                  <li key={c.conversationId}>
                    <button
                      type="button" onClick={() => selectConversation(c.conversationId)}
                      aria-current={active ? "true" : undefined}
                      className={
                        "group flex w-full items-center gap-3 border-b border-[#f1f4f1] px-4 py-3 text-right transition-colors hover:bg-[#f4f8f4] dark:border-[#25382f] dark:hover:bg-[#20372d] " +
                        (active ? "bg-[#e2f2ed] shadow-[inset_3px_0_0_#0c9f89] dark:bg-[#23483e]" : "") +
                        (c.unread ? " font-bold" : "")
                      }
                    >
                      <Avatar c={c} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="min-w-0 truncate text-[13px] font-bold">{contactLabel(c)}</span>
                          <time className={
                            "shrink-0 text-[10px] tabular-nums " +
                            (c.unread ? "font-bold text-[#079e84]" : "font-medium text-[#9aa8a1] dark:text-[#90a39a]")
                          }>{timeLabel(c.lastMessageAtUtc, true)}</time>
                        </div>
                        <div className="mt-1 flex items-center gap-2">
                          <p className={
                            "min-w-0 flex-1 truncate text-[11.5px] leading-5 " +
                            (c.unread ? "text-[#405b51] dark:text-[#d6e4dc]" : "text-[#84978e] dark:text-[#9cb0a5]")
                          } dir="auto">
                            {c.lastMessageDirection === "OUTBOUND" ? "✓ " : ""}
                            {c.lastMessagePreview?.trim() || "مرفق أو رسالة بدون نص"}
                          </p>
                          {c.unread ? <span className="grid h-[19px] min-w-[19px] place-items-center rounded-full bg-[#069b83] px-1 text-[10px] text-white" aria-label="رسالة غير مقروءة">●</span>
                            : s.attention ? <span className={"h-[7px] w-[7px] shrink-0 rounded-full " + s.dot} aria-label={s.label} />
                              : null}
                        </div>
                        {(c.aiMode !== "AUTO" || s.attention || c.aiReplyHealth?.state === "REPLYING") && (
                          <span className={"mt-1 inline-flex items-center gap-1 text-[10px] font-medium " + s.color}>
                            <span className={"h-1.5 w-1.5 rounded-full " + s.dot} />{s.label}
                          </span>
                        )}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <div ref={listSentinel} className="flex min-h-10 items-center justify-center px-4 text-[11px] text-[#8fa19a]">
            {loadingMore ? "بنحمّل شاتات أكتر..." : hasMore ? (
              <button type="button" className="w-full py-3 font-bold hover:text-[#087f76]" onClick={() => void loadNextPage()}>عرض محادثات أقدم</button>
            ) : grouped.length > 0 ? (
              filter === "ALL" && !debouncedSearch ? "كل المحادثات المحفوظة ظهرت" : "نهاية النتائج"
            ) : null}
          </div>
        </div>
        <div className="flex h-9 shrink-0 items-center justify-between gap-2 border-t border-[#edf2ee] bg-[#fbfdfb] px-4 text-[10px] text-[#899c91] dark:border-[#2a4036] dark:bg-[#1b2d26]">
          <span>{filter === "ALL" && !debouncedSearch ? "معروض " + loadedCount + " من " + counts.total : "معروض " + loadedCount + " نتيجة"}</span>
          {failedCount > 0 ? <span className="font-bold text-amber-600">{failedCount} محتاج متابعة من الظاهرين</span> : <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-[#19aa83]" />متابعة مباشرة</span>}
        </div>
      </aside>

      <main className={
        "relative min-h-0 min-w-0 flex-1 flex-col bg-[#f3f5ef] dark:bg-[#0d1916] " +
        (mobileThread ? "flex" : "hidden md:flex")
      } aria-label="محتوى المحادثة">
        {selected && status ? (
          <>
            <header className="z-10 flex h-[74px] shrink-0 items-center justify-between gap-3 border-b border-[#dfe8df] bg-[#fafdFA] px-3 sm:px-5 dark:border-[#293d33] dark:bg-[#1b2a24]">
              <div className="flex min-w-0 items-center gap-2.5">
                <button type="button" onClick={() => setMobileThread(false)} className="grid h-9 w-9 place-items-center rounded-xl hover:bg-[#e8efe9] md:hidden" aria-label="رجوع لقائمة المحادثات"><Glyph name="back" /></button>
                <Avatar c={selected} size="sm" />
                <div className="min-w-0">
                  <h2 className="truncate text-[14px] font-extrabold">{contactLabel(selected)}</h2>
                  <p className="mt-0.5 flex items-center gap-2 text-[11px] text-[#7d9185]">
                    <span className={"h-1.5 w-1.5 shrink-0 rounded-full " + status.dot} />
                    <span className={"truncate " + status.color}>{status.label}</span>
                    {selected.contactPhoneNormalized && <span className="hidden truncate opacity-75 sm:inline" dir="ltr">{selected.contactPhoneNormalized}</span>}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {selected.aiMode !== "AUTO" ? (
                  <button
                    type="button" onClick={() => void resumeAi()} disabled={resuming}
                    className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-[#087f76] px-3 text-[11px] font-bold text-white transition hover:bg-[#066c64] disabled:opacity-50 sm:px-4"
                  >
                    <Glyph name="spark" size={16} /><span className="hidden sm:inline">{resuming ? "جارٍ التشغيل" : "رجّع البوت"}</span><span className="sm:hidden">AI</span>
                  </button>
                ) : <div className="hidden items-center gap-1.5 rounded-full bg-[#e2f3e8] px-3 py-2 text-[10px] font-bold text-[#16805e] sm:flex dark:bg-[#204338] dark:text-[#9be1bb]"><Glyph name="bot" size={15} />AI بيتابع</div>}
                <ActionIcon name="info" title="تفاصيل العميل" active={detailsOpen} onClick={() => setDetailsOpen(v => !v)} />
              </div>
            </header>

            {(error || notice || status.attention) && (
              <div className="z-10 border-b border-[#e5eae4] bg-white/90 px-4 py-2 text-[11px] dark:border-[#2c4035] dark:bg-[#1b2b24]">
                {error && <p role="alert" className="font-bold text-red-600">{error}</p>}
                {notice && <p role="status" className="font-bold text-[#087c6a] dark:text-[#82dbc1]">{notice}</p>}
                {!error && !notice && status.attention && <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300"><Glyph name="alert" size={15} />{status.detail}{selected.aiMode === "AUTO" ? " — تقدر ترد بنفسك من تحت." : ""}</div>}
              </div>
            )}

            <div className="relative flex min-h-0 flex-1 flex-col">
              <div
                ref={messageScroller}
                onScroll={e => {
                  const el = e.currentTarget;
                  const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 135;
                  shouldStickBottom.current = nearBottom;
                  setShowScrollDown(!nearBottom);
                }}
                className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-5 [scrollbar-width:thin] sm:px-7"
                style={{
                  backgroundColor: "transparent",
                  backgroundImage: "radial-gradient(circle at 2px 2px, rgba(110,143,121,.075) 1px, transparent 0)",
                  backgroundSize: "34px 34px",
                }}
                aria-label="رسائل المحادثة"
              >
                <div className="mx-auto flex min-h-full max-w-[900px] flex-col">
                  {loadingThread ? <div className="m-auto text-sm text-[#8b9e91]">بنفتح المحادثة...</div>
                    : messages.length === 0 ? <div className="m-auto rounded-xl bg-white/80 p-5 text-center text-sm text-[#7f9285] dark:bg-[#263a31]">لسه مفيش رسائل محفوظة للمحادثة دي.</div>
                      : <>
                          {hasOlder ? (
                            <button type="button" onClick={() => void loadOlder()} disabled={loadingOlder} className="mx-auto mb-5 rounded-full bg-white/90 px-5 py-2 text-[11px] font-bold text-[#087d6d] shadow-sm hover:bg-[#e7f3ec] dark:bg-[#23382e] dark:text-[#96dfc1]">
                              {loadingOlder ? "بنحمّل الأقدم..." : "تحميل رسائل أقدم"}
                            </button>
                          ) : <p className="mb-4 text-center text-[10px] text-[#9ba99e]">بداية السجل المحفوظ</p>}
                          {messages.map((m, index) => {
                            const outgoing = m.direction === "OUTBOUND";
                            const showDay = index === 0 || messageDayKey(messages[index - 1]) !== messageDayKey(m);
                            return (
                              <div key={m.messageId}>
                                {showDay && <div className="my-5 flex justify-center"><span className="rounded-lg bg-white/85 px-3 py-1.5 text-[10px] font-bold text-[#7e9486] shadow-sm dark:bg-[#26382f] dark:text-[#adc4b5]">{messageDay(m)}</span></div>}
                                <div className={"mb-2 flex " + (outgoing ? "justify-start" : "justify-end")}>
                                  <article dir="rtl" className={
                                    "max-w-[88%] rounded-[13px] px-3.5 py-2 shadow-[0_1px_1px_rgba(0,0,0,.045)] sm:max-w-[76%] " +
                                    (outgoing
                                      ? "rounded-tr-[3px] bg-[#d8f1e0] text-[#1b3a2c] dark:bg-[#255444] dark:text-[#e7f8ed]"
                                      : "rounded-tl-[3px] bg-white text-[#1d3028] dark:bg-[#26372f] dark:text-[#eff7ee]")
                                  }>
                                    {outgoing && (
                                      <div className="mb-1 flex items-center gap-1.5 text-[10px] font-bold opacity-70">
                                        <Glyph name={m.origin === "AI" ? "bot" : "check"} size={13} />
                                        {m.origin === "AI" ? "الموظف الذكي" : m.origin === "HUMAN" ? (m.actorName || "الفريق") : "رسالة صادرة"}
                                      </div>
                                    )}
                                    <p dir="auto" className="whitespace-pre-wrap break-words text-[12.5px] leading-[1.95] sm:text-[13px]">
                                      {messageBodyDisplay({ textContent: m.textContent, contentType: m.contentType })}
                                    </p>
                                    <div className="mt-1 flex items-center justify-end gap-1 text-[9px] opacity-60" dir="ltr">
                                      <time>{messageClock(m.providerTimestampUtc || m.receivedAtUtc)}</time>
                                      {outgoing && <Glyph name="check" size={13} />}
                                    </div>
                                  </article>
                                </div>
                              </div>
                            );
                          })}
                        </>}
                </div>
              </div>
              {showScrollDown && <button type="button" onClick={scrollToBottom} aria-label="آخر الرسائل" title="آخر الرسائل" className="absolute bottom-3 left-4 grid h-10 w-10 place-items-center rounded-full bg-white text-[#45856a] shadow-md dark:bg-[#2b4337]"><Glyph name="arrow-down" size={18} /></button>}
            </div>

            <footer className="z-10 shrink-0 border-t border-[#e5e9e3] bg-[#f7f9f5] px-3 py-3 dark:border-[#2c4035] dark:bg-[#1a2b24]">
              <div className="mx-auto flex max-w-[940px] items-end gap-2">
                <div className="flex min-h-[48px] min-w-0 flex-1 items-end gap-2 rounded-2xl border border-[#e4ebe4] bg-white px-4 py-2 shadow-[0_2px_14px_rgba(21,69,49,.04)] focus-within:border-[#75bba7] dark:border-[#365144] dark:bg-[#263a30]">
                  <textarea
                    ref={textArea} value={draft}
                    onChange={e => setDraft(e.target.value)}
                    onInput={e => {
                      const el = e.currentTarget;
                      el.style.height = "auto";
                      el.style.height = Math.min(el.scrollHeight, 144) + "px";
                    }}
                    rows={1} maxLength={4000}
                    aria-label="اكتب رسالة واتساب"
                    placeholder="اكتب رسالة للعميل..."
                    onKeyDown={e => {
                      if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                        e.preventDefault();
                        void sendManual();
                      }
                    }}
                    className="min-h-[30px] max-h-36 w-full resize-none bg-transparent py-1 text-[13px] leading-6 outline-none placeholder:text-[#9baca0]"
                    style={{ height: "auto" }}
                  />
                </div>
                <button
                  type="button" onClick={() => void sendManual()} disabled={sending || !draft.trim()}
                  className="grid h-[48px] w-[48px] shrink-0 place-items-center rounded-2xl bg-[#087f76] text-white transition hover:bg-[#056e64] disabled:cursor-not-allowed disabled:bg-[#a5bdb3] dark:disabled:bg-[#3b594c]"
                  title="إرسال الرسالة" aria-label="إرسال الرسالة"
                ><Glyph name="send" size={20} /></button>
              </div>
              <p className="mx-auto mt-1.5 max-w-[940px] text-[10px] text-[#8b9c8f]">
                {selected.aiMode === "AUTO"
                  ? "أول رد يدوي منك هيوقف الـAI في المحادثة دي تلقائيًا."
                  : selected.aiMode === "HUMAN_PAUSED"
                    ? "المحادثة مع الفريق. لما تخلص رجّع البوت من فوق."
                    : "المحادثة محتاجة مراجعة قبل تشغيل البوت."}
                <span className="hidden sm:inline"> · Enter للإرسال، Shift + Enter لسطر جديد</span>
              </p>
            </footer>
          </>
        ) : (
          <div className="flex h-full flex-col items-center justify-center px-8 text-center">
            <span className="mb-6 grid h-24 w-24 place-items-center rounded-[32px] bg-[#dcede3] text-[#087e72] dark:bg-[#204638]"><Glyph name="chat" size={46} /></span>
            <h2 className="text-2xl font-extrabold">كل محادثاتك. في مكان واحد.</h2>
            <p className="mt-3 max-w-sm text-sm leading-7 text-[#7e9487]">افتح أي شات من القائمة، والـAI يتابع معاك أو ترد بنفسك في أي وقت.</p>
            <span className="mt-7 inline-flex items-center gap-2 rounded-full border border-[#cfe8d8] px-4 py-2 text-xs font-bold text-[#17816a] dark:border-[#305e49]"><Glyph name="spark" size={15} />DRVO AutoRespond</span>
          </div>
        )}
      </main>

      {selected && detailsOpen && (
        <div className="fixed inset-0 z-30 bg-black/40 lg:static lg:z-auto lg:flex lg:w-[300px] lg:shrink-0 lg:bg-transparent">
          <button type="button" aria-label="إغلاق تفاصيل العميل" onClick={() => setDetailsOpen(false)} className="absolute inset-0 lg:hidden" />
          <aside className="absolute bottom-0 left-0 top-0 z-10 flex w-[min(340px,90vw)] flex-col overflow-y-auto border-r border-[#dce8dd] bg-white shadow-2xl lg:static lg:h-full lg:w-full lg:shadow-none dark:border-[#30493b] dark:bg-[#1b2b23]" aria-label="تفاصيل العميل">
            <header className="flex h-[74px] shrink-0 items-center justify-between border-b border-[#edf1ed] px-5 dark:border-[#30463a]">
              <h3 className="text-[15px] font-bold">تفاصيل العميل</h3>
              <ActionIcon name="close" title="إغلاق" onClick={() => setDetailsOpen(false)} />
            </header>
            <div className="flex flex-col items-center border-b border-[#edf1ed] px-6 py-8 dark:border-[#30463a]">
              <Avatar c={selected} size="lg" />
              <h4 className="mt-3 max-w-full truncate text-lg font-bold">{contactLabel(selected)}</h4>
              <p className="mt-1 text-xs text-[#8b9e90]" dir="ltr">{selected.contactPhoneNormalized || "الرقم غير متاح"}</p>
            </div>
            <div className="space-y-5 p-5">
              <div>
                <h4 className="mb-2 text-[11px] font-bold text-[#9cae9f]">المسؤول عن الرد</h4>
                <div className="rounded-2xl bg-[#f0f6f0] p-4 dark:bg-[#263e31]">
                  <p className={"flex items-center gap-2 text-sm font-bold " + status?.color}><span className={"h-2 w-2 rounded-full " + status?.dot} />{status?.label}</p>
                  <p className="mt-2 text-[11px] leading-6 text-[#688275] dark:text-[#b0c9b8]">{status?.detail}</p>
                </div>
              </div>
              <div>
                <h4 className="mb-2 text-[11px] font-bold text-[#9cae9f]">آخر نشاط</h4>
                <p className="text-sm font-bold">{timeLabel(selected.lastMessageAtUtc)}</p>
                <p className="mt-1 text-[11px] text-[#899b8c]">{selected.unread ? "في رسالة غير مقروءة" : "تم عرض الرسائل المسجلة"}</p>
              </div>
              <button
                type="button"
                onClick={() => { setDetailsOpen(false); textArea.current?.focus(); }}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#cde4d5] px-3 py-3 text-xs font-bold text-[#078174] dark:border-[#3b6850]"
              ><Glyph name="chat" size={17} />رد يدوي على العميل</button>
              {selected.aiMode !== "AUTO" && (
                <button type="button" onClick={() => void resumeAi()} disabled={resuming} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#087f76] px-3 py-3 text-xs font-bold text-white disabled:opacity-50"><Glyph name="spark" size={17} />رجّع الرد التلقائي</button>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
