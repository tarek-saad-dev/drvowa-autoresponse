"use client";

import { useCallback, useState, useTransition } from "react";

export type ConversationRow = {
  conversationId: string;
  contactExternalKey: string;
  contactDisplayName: string | null;
  contactPhoneNormalized: string | null;
  lastMessagePreview: string | null;
  lastMessageDirection: "INBOUND" | "OUTBOUND" | null;
  lastMessageAtUtc: string | null;
  status: string;
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
              <div>
                <h2 className="text-sm font-semibold">{contactLabel(selected)}</h2>
                <p className="text-xs text-muted-foreground">عرض فقط — لا إرسال بعد</p>
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
              <p className="text-sm text-muted-foreground">لا توجد رسائل في هذه المحادثة.</p>
            ) : (
              messages.map((m) => {
                const inbound = m.direction === "INBOUND";
                return (
                  <div
                    key={m.messageId}
                    className={`flex ${inbound ? "justify-start" : "justify-end"}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
                        inbound
                          ? "rounded-ss-md bg-card text-card-foreground"
                          : "rounded-se-md bg-primary text-primary-foreground"
                      }`}
                    >
                      <p className="whitespace-pre-wrap break-words">
                        {m.textContent?.trim()
                          || (m.contentType === "UNKNOWN"
                            ? "رسالة غير نصية"
                            : "")}
                      </p>
                      <p
                        className={`mt-1 text-[10px] ${
                          inbound
                            ? "text-muted-foreground"
                            : "text-primary-foreground/80"
                        }`}
                      >
                        {formatTime(
                          m.providerTimestampUtc || m.receivedAtUtc || m.createdAtUtc,
                        )}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

export { serializeConversations };
