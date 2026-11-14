"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { HumanOwnedChat, HumanOwnershipSnapshot } from "@/modules/ai/human-ownership";
import { TeamChatDrawer } from "./team-chat-drawer";

type InboxTeamRow = {
  conversationId: string;
  contactDisplayName: string | null;
  contactPhoneNormalized: string | null;
  awaitingHumanReply: boolean;
  aiMode: "AUTO" | "HUMAN_PAUSED" | "SAFETY_PAUSED";
};
type InboxTeamPage = {
  conversations?: InboxTeamRow[];
  hasMore?: boolean;
  error?: string;
};

export function LiveOwnership({
  initial, businessId,
}: {
  initial: HumanOwnershipSnapshot | null;
  businessId: string;
}) {
  const [snapshot, setSnapshot] = useState(initial);
  const [activeChat, setActiveChat] = useState<HumanOwnedChat | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [allChats, setAllChats] = useState<HumanOwnedChat[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingAll, setLoadingAll] = useState(false);
  const [allError, setAllError] = useState("");
  const [search, setSearch] = useState("");

  const refresh = useCallback(async () => {
    const response = await fetch("/api/pulse/ownership?businessId=" + encodeURIComponent(businessId), {
      cache: "no-store", credentials: "same-origin",
    });
    if (!response.ok) return;
    const body = await response.json() as HumanOwnershipSnapshot;
    if (Number.isInteger(body.withTeam) && Array.isArray(body.chats)) setSnapshot(body);
  }, [businessId]);

  const loadAll = useCallback(async () => {
    setLoadingAll(true);
    setAllError("");
    try {
      const response = await fetch("/api/inbox/conversations?filter=HUMAN&limit=100", {
        credentials: "same-origin", cache: "no-store",
      });
      const data = await response.json() as InboxTeamPage;
      if (!response.ok) throw new Error(data.error || "تعذر تحميل قائمة الفريق");
      const chats = (data.conversations ?? [])
        .filter(item => item.aiMode === "HUMAN_PAUSED")
        .map(item => ({
          conversationId: item.conversationId,
          name: item.contactDisplayName?.trim() || item.contactPhoneNormalized || "عميل",
          waitingForTeam: Boolean(item.awaitingHumanReply),
          lastInboundAtUtc: null,
        }))
        .sort((a, b) => Number(b.waitingForTeam) - Number(a.waitingForTeam));
      setAllChats(chats);
      setHasMore(Boolean(data.hasMore));
    } catch (cause) {
      setAllError(cause instanceof Error ? cause.message : "تعذر تحميل المحادثات");
    } finally {
      setLoadingAll(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => {
      if (!document.hidden) void refresh();
    }, 20_000);
    const onFocus = () => { if (!document.hidden) void refresh(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [refresh]);

  const onChanged = useCallback(() => {
    void refresh();
    if (expanded) void loadAll();
  }, [refresh, expanded, loadAll]);

  const toggleExpanded = () => {
    if (expanded) {
      setExpanded(false);
      setSearch("");
    } else {
      setExpanded(true);
      void loadAll();
    }
  };

  const preview = snapshot?.chats.slice(0, 4) ?? [];
  const showing = expanded ? allChats ?? preview : preview;
  const filtered = useMemo(() => showing.filter(chat =>
    chat.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
  ), [showing, search]);
  const inboxHref = "/dashboard/inbox?filter=HUMAN";

  return (
    <section aria-label="المحادثات مع الفريق" className="min-w-0 overflow-hidden rounded-[24px] border border-border bg-card shadow-sm" dir="rtl">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border/70 px-4 py-4 sm:px-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span aria-hidden="true" className="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary">◉</span>
            <div>
              <h2 className="font-display text-base font-bold sm:text-lg">المحادثات مع الفريق</h2>
              <p className="mt-1 text-xs text-muted-foreground">شوف الشات ورد، وبعد الحل رجّعه للموظف الذكي من هنا.</p>
            </div>
          </div>
        </div>
        <Link href={inboxHref} className="inline-flex min-h-9 items-center rounded-xl px-3 text-xs font-bold text-primary hover:bg-primary/10">
          صندوق المحادثات ↗
        </Link>
      </header>

      {snapshot === null ? (
        <p className="p-5 text-xs text-muted-foreground">حالة محادثات الفريق غير متاحة حاليًا. الأرقام مش هتتصفّر لمجرد تعذّر التحميل.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 px-4 pt-4 sm:grid-cols-3 sm:px-5">
            <div className="rounded-2xl border border-border bg-surface px-3 py-3 sm:px-4">
              <p className="text-[11px] font-semibold text-muted-foreground">مع الفريق</p>
              <p className="mt-2 text-2xl font-bold tabular-nums">{snapshot.withTeam.toLocaleString("ar-EG")}</p>
            </div>
            <div className={"rounded-2xl border px-3 py-3 sm:px-4 " +
              (snapshot.awaitingTeamReply ? "border-warning/35 bg-warning-soft" : "border-border bg-surface")}>
              <p className={"text-[11px] font-semibold " + (snapshot.awaitingTeamReply ? "text-warning" : "text-muted-foreground")}>مستنيين رد الفريق</p>
              <p className={"mt-2 text-2xl font-bold tabular-nums " + (snapshot.awaitingTeamReply ? "text-warning" : "")}>
                {snapshot.awaitingTeamReply.toLocaleString("ar-EG")}
              </p>
            </div>
            <div className="col-span-2 rounded-2xl border border-border bg-surface px-3 py-3 sm:col-span-1 sm:px-4">
              <p className="text-[11px] font-semibold text-muted-foreground">متابعة جارية</p>
              <p className="mt-2 text-2xl font-bold tabular-nums">{snapshot.waitingCustomer.toLocaleString("ar-EG")}</p>
            </div>
          </div>
          <div className="px-4 pb-4 pt-5 sm:px-5 sm:pb-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold">{expanded ? "كل المحادثات مع الفريق" : "محادثات محتاجة متابعة"}</h3>
              {snapshot.withTeam > 4 ? (
                <button type="button" aria-expanded={expanded} onClick={toggleExpanded}
                  className="min-h-9 rounded-xl px-2 text-xs font-bold text-primary hover:bg-primary/10">
                  {expanded ? "عرض أقل" : "عرض الكل (" + snapshot.withTeam.toLocaleString("ar-EG") + ")"}
                </button>
              ) : null}
            </div>
            {expanded ? (
              <div className="mb-3">
                <input type="search" value={search} onChange={event => setSearch(event.target.value)}
                  aria-label="ابحث في محادثات الفريق" placeholder="ابحث باسم العميل..."
                  className="min-h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25" />
              </div>
            ) : null}
            {loadingAll ? <p role="status" className="mb-2 text-xs text-muted-foreground">بنحمّل باقي المحادثات...</p> : null}
            {allError ? <p role="alert" className="mb-2 text-xs text-warning">{allError}</p> : null}
            {snapshot.withTeam === 0 ? (
              <div className="rounded-xl bg-success-soft/40 px-4 py-6 text-center">
                <p className="text-sm font-bold">مفيش شاتات مسلّمة للفريق حاليًا</p>
                <p className="mt-1 text-xs text-muted-foreground">الموظف الذكي متابع المحادثات اللي اتسلّمت له.</p>
              </div>
            ) : filtered.length === 0 ? (
              <p className="py-4 text-xs text-muted-foreground">{search ? "مفيش نتائج للبحث." : "مفيش محادثات في المعاينة."}</p>
            ) : (
              <div className={"space-y-2 " + (expanded ? "max-h-[360px] overflow-y-auto pe-1" : "")}>
                {filtered.map(chat => (
                  <button key={chat.conversationId} type="button" onClick={() => setActiveChat(chat)}
                    aria-label={"افتح محادثة " + chat.name}
                    className="group flex w-full min-w-0 items-center gap-3 rounded-2xl border border-border/80 bg-background/50 px-3 py-3 text-right transition-colors hover:border-primary/40 hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                    <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                      {chat.name.trim().charAt(0).toUpperCase() || "؟"}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span dir="auto" className="block truncate text-sm font-semibold">{chat.name}</span>
                      <span className={"mt-1 block text-[11px] " + (chat.waitingForTeam ? "text-warning" : "text-muted-foreground")}>
                        {chat.waitingForTeam ? "محتاج رد من الفريق" : "جاري التعامل · لسه مع الفريق"}
                      </span>
                    </span>
                    <span aria-hidden="true" className="shrink-0 text-lg text-primary">↗</span>
                  </button>
                ))}
              </div>
            )}
            {expanded && hasMore ? (
              <Link href={inboxHref} className="mt-3 block text-center text-xs font-bold text-primary hover:underline">
                اعرض باقي المحادثات في صندوق الوارد ↗
              </Link>
            ) : null}
            <p className="mt-3 text-[11px] leading-5 text-muted-foreground">
              فتح الشات أو الرد عليه مش بيقفل المتابعة تلقائيًا. التسليم للبوت بعد تأكيد الحل فقط.
            </p>
          </div>
        </>
      )}
      {activeChat ? (
        <TeamChatDrawer key={activeChat.conversationId} chat={activeChat} businessId={businessId}
          onClose={() => setActiveChat(null)} onChanged={onChanged} />
      ) : null}
    </section>
  );
}
