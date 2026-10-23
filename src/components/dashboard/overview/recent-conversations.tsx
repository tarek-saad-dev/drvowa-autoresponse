import Link from "next/link";

import { relativeActivityLabel } from "@/lib/dashboard/relative-time";
import { cn } from "@/lib/utils/cn";

export type OverviewConversation = {
  conversationId: string;
  contactDisplayName: string | null;
  contactPhoneNormalized: string | null;
  lastMessagePreview: string | null;
  lastMessageAtUtc: Date | string | null;
  unread: boolean;
  statusLabel: string | null;
  statusTone: "neutral" | "attention" | "ok";
};

function contactLabel(conversation: OverviewConversation): string {
  return (
    conversation.contactDisplayName?.trim()
    || conversation.contactPhoneNormalized
    || "عميل"
  );
}

function initial(conversation: OverviewConversation): string {
  const label = contactLabel(conversation);
  return label.slice(0, 1);
}

export function RecentConversations({
  conversations,
  whatsappConnected,
}: {
  conversations: OverviewConversation[];
  whatsappConnected: boolean;
}) {
  return (
    <section aria-label="آخر المحادثات" className="min-w-0">
      <div className="mb-3 flex items-end justify-between gap-3">
        <h2 className="text-base font-black sm:text-lg">آخر المحادثات</h2>
        <Link
          href="/dashboard/inbox"
          className="text-xs font-black text-primary transition hover:text-primary-hover"
        >
          عرض كل المحادثات
        </Link>
      </div>

      {conversations.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/60 px-4 py-10 text-center">
          <p className="font-black">لسه مفيش محادثات</p>
          <p className="mt-1 text-sm text-muted-foreground">
            أول رسالة واتساب هتظهر هنا تلقائيًا.
          </p>
          {!whatsappConnected ? (
            <Link
              href="/dashboard/whatsapp"
              className="mt-4 inline-block text-sm font-black text-primary"
            >
              اربط واتساب ←
            </Link>
          ) : null}
        </div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
          {conversations.map((conversation) => (
            <li key={conversation.conversationId}>
              <Link
                href={`/dashboard/inbox?conversationId=${encodeURIComponent(conversation.conversationId)}`}
                className="flex items-center gap-3 px-3 py-3 transition hover:bg-surface/80 focus-visible:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-4"
              >
                <div className="relative grid h-10 w-10 shrink-0 place-items-center rounded-full bg-secondary text-sm font-black">
                  <span dir="auto">{initial(conversation)}</span>
                  {conversation.unread ? (
                    <span
                      className="absolute start-0 top-0 h-2.5 w-2.5 rounded-full bg-primary ring-2 ring-card"
                      aria-label="غير مقروء"
                    />
                  ) : null}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <span
                      dir="auto"
                      className={cn(
                        "truncate text-sm",
                        conversation.unread ? "font-black" : "font-bold",
                      )}
                    >
                      {contactLabel(conversation)}
                    </span>
                    <time className="shrink-0 text-[11px] text-muted-foreground">
                      {relativeActivityLabel(conversation.lastMessageAtUtc)}
                    </time>
                  </div>
                  <div className="mt-0.5 flex items-center gap-2">
                    <p
                      dir="auto"
                      className="min-w-0 flex-1 truncate text-xs text-muted-foreground"
                    >
                      {conversation.lastMessagePreview?.trim() || "محادثة جديدة"}
                    </p>
                    {conversation.statusLabel ? (
                      <span
                        className={cn(
                          "shrink-0 text-[10px] font-bold",
                          conversation.statusTone === "attention"
                            && "text-warning",
                          conversation.statusTone === "ok"
                            && "text-success",
                          conversation.statusTone === "neutral"
                            && "text-muted-foreground",
                        )}
                      >
                        {conversation.statusLabel}
                      </span>
                    ) : null}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
