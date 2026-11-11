import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/image", () => ({
  default: (props: { alt?: string; className?: string; src?: string }) =>
    createElement("img", {
      alt: props.alt ?? "",
      className: props.className,
      src: typeof props.src === "string" ? props.src : "",
    }),
}));

import { InboxPanel, type ConversationRow } from "@/components/dashboard/inbox-panel";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const inbox = readFileSync(resolve(process.cwd(), "src/components/dashboard/inbox-panel.tsx"), "utf8");
const chrome = readFileSync(resolve(process.cwd(), "src/components/dashboard/inbox-chrome.tsx"), "utf8");
const shell = readFileSync(resolve(process.cwd(), "src/components/dashboard/dashboard-shell.tsx"), "utf8");
const page = readFileSync(resolve(process.cwd(), "src/app/(app)/dashboard/inbox/page.tsx"), "utf8");

const row = (overrides: Partial<ConversationRow> = {}): ConversationRow => ({
  conversationId: "33075559-5ad1-4807-a77e-cf215ee5c975",
  contactExternalKey: "201012345678@s.whatsapp.net",
  contactDisplayName: "عميل تجريبي",
  contactPhoneNormalized: "201012345678",
  lastMessagePreview: "ممكن تفاصيل؟",
  lastMessageDirection: "INBOUND",
  lastMessageAtUtc: "2026-10-26T03:00:00Z",
  status: "OPEN",
  aiMode: "AUTO",
  aiPauseReason: null,
  hasOpenEscalation: false,
  aiReplyHealth: null,
  unread: false,
  ...overrides,
});

const htmlFor = (conversation: ConversationRow, selected = false) => renderToStaticMarkup(
  createElement(InboxPanel, {
    initialConversations: [conversation],
    initialCounts: { total: 1, unread: conversation.unread ? 1 : 0, followUp: conversation.hasOpenEscalation ? 1 : 0 },
    initialSelectedId: selected ? conversation.conversationId : null,
    initialHasMore: false,
    initialCursor: null,
  }),
);

describe("Brand V2 Inbox accessibility, responsive behavior and data safety", () => {
  it("uses the canonical public brand and semantic Ink/Green surfaces", () => {
    const html = htmlFor(row());
    expect(html).toContain('aria-label="DRVO AutoRespond"');
    expect(html).toContain("bg-background");
    expect(html).toContain("bg-card");
    expect(html).toContain('aria-label="قائمة المحادثات"');
    expect(inbox).not.toMatch(/AutoResponse\b/);
    expect(inbox).not.toMatch(/#(?:00759a|0b8bb5|38c6ed|3de7ff)\b/i);
    expect(inbox).not.toMatch(/(?:bg|text)-(?:sky|cyan|teal|amber|rose|emerald)-\d+/);
    expect(inbox).not.toContain("rgb(0 117 154 / 0.08)");
  });

  it("keeps searchable inbox filters, keyboard focus, pinned states and unread indicators", () => {
    const html = htmlFor(row({ unread: true, isPinned: true }));
    expect(html).toContain('aria-label="بحث في جميع المحادثات"');
    expect(html).toContain('aria-label="فلاتر المحادثات"');
    expect(html).toContain('aria-label="رسالة غير مقروءة"');
    expect(html).toContain('aria-label="محادثة مثبتة"');
    expect(html).toContain("border-input");
    expect(html).toContain("focus-within:border-ring");
    expect(html).toContain("focus-visible:outline-ring");
    expect(html).toContain("min-h-[70px]");
  });

  it("does not claim any unread message quantity not returned by the API", () => {
    expect(inbox).toContain('aria-label="رسالة غير مقروءة"');
    expect(inbox).toContain("h-2.5 w-2.5 shrink-0 rounded-full bg-primary");
    expect(inbox).not.toContain("●</span>");
  });

  it("uses logical start borders for selected conversation in Arabic RTL", () => {
    expect(inbox).toContain('dir="rtl"');
    expect(inbox).toContain("border-s-[3px] border-b-border/70 border-s-transparent");
    expect(inbox).toContain("border-s-primary bg-primary/10");
    expect(inbox).toContain("min-w-0 flex-1");
  });

  it("distinguishes real followup, human takeover, AI and safety states semantically", () => {
    const needsAttention = htmlFor(row({
      aiMode: "HUMAN_PAUSED",
      awaitingHumanReply: true,
    }), true);
    const withTeam = htmlFor(row({ aiMode: "HUMAN_PAUSED" }), true);
    const ai = htmlFor(row({ aiMode: "AUTO" }), true);
    const escalated = htmlFor(row({ hasOpenEscalation: true, followUpPhase: "IN_PROGRESS" }), true);
    const paused = htmlFor(row({ aiMode: "SAFETY_PAUSED" }), true);
    expect(needsAttention).toContain("ينتظر رد الفريق");
    expect(needsAttention).toContain("bg-warning");
    expect(withTeam).toContain("مع الفريق");
    expect(withTeam).toContain("text-info");
    expect(ai).toContain("AI شغال");
    expect(ai).toContain("text-success");
    expect(escalated).toContain("جاري التعامل");
    expect(escalated).toContain("text-info");
    expect(paused).toContain("محتاج مراجعة");
    expect(paused).toContain("text-destructive");
  });

  it("displays text labels for human ownership without requiring a selected thread", () => {
    const handover = htmlFor(row({ aiMode: "HUMAN_PAUSED" }));
    const responding = htmlFor(row({
      aiMode: "HUMAN_PAUSED",
      awaitingHumanReply: true,
    }));
    const defaultAi = htmlFor(row());
    expect(handover).toContain("مع الفريق");
    expect(handover).toContain("text-info");
    expect(responding).toContain("ينتظر رد الفريق");
    expect(responding).toContain("text-warning");
    expect(inbox).toContain("const showOwnership =");
    expect(inbox).toContain("s.color");
    expect(defaultAi).not.toContain(">AI شغال<");
  });

  it("keeps WhatsApp message bubble color separate from marketing green", () => {
    expect(inbox).toContain("bg-whatsapp-bubble text-whatsapp-bubble-text");
    expect(inbox).toContain("border border-border/70 bg-card text-foreground");
    expect(inbox).toContain("color-mix(in srgb, var(--foreground) 4%, transparent)");
    expect(inbox).toContain("border-s-2 border-s-primary");
    expect(inbox).toContain("quotedProviderMessageId");
    expect(inbox).toContain("messageBodyDisplay");
  });

  it("keeps attachment viewing and responsive previews without changing API paths", () => {
    expect(inbox).toContain('"/api/inbox/media/" + m.messageId');
    expect(inbox).toContain('<audio controls preload="none"');
    expect(inbox).toContain('<video controls preload="metadata"');
    expect(inbox).toContain("max-w-full rounded-lg object-contain");
    expect(inbox).toContain('target="_blank" rel="noreferrer"');
  });

  it("preserves mobile thread layout and unobstructed composer", () => {
    expect(inbox).toContain("setThreadOpen(mobileThread)");
    expect(inbox).toContain("setMobileThread(true)");
    expect(inbox).toContain("setMobileThread(false)");
    expect(inbox).toContain('aria-label="رجوع لقائمة المحادثات"');
    expect(shell).toContain("const showMobileNav = !isInbox || !threadOpen");
    expect(shell).toContain("h-[100dvh]");
    expect(inbox).toContain("pb-[max(12px,env(safe-area-inset-bottom))]");
    expect(inbox).toContain('aria-label="اكتب رسالة واتساب"');
    expect(inbox).toContain('aria-label="إرسال الرسالة"');
    expect(inbox).toContain("focus-within:ring-ring/25");
    expect(chrome).toContain("InboxChromeProvider");
  });

  it("preserves sending, polling, handover, resume and server-side tenant checks", () => {
    for (const phrase of [
      "LIST_POLL_MS = 12_000",
      "THREAD_POLL_MS = 5_000",
      "const sendManual = useCallback",
      "const resumeAi = useCallback",
      "const escalateConversation = useCallback",
      "const updateChatMetadata = useCallback",
      "whatsappSendReady !== true",
    ]) {
      expect(inbox).toContain(phrase);
    }
    expect(inbox).toContain("const updateChatMetadata");
    expect(page).toContain("getMembership");
    expect(page).toContain("resolveActiveBusiness");
    expect(page).toContain("canonicalInboxConversationId");
    expect(page).toContain("getInboxConversationCounts");
  });
});
