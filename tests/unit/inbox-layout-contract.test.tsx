import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

const navigation = vi.hoisted(() => ({ pathname: "/dashboard/inbox" }));
vi.mock("next/navigation", () => ({ usePathname: () => navigation.pathname }));

import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { InboxPanel, type ConversationRow } from "@/components/dashboard/inbox-panel";

describe("inbox viewport and UX layout contract", () => {
  it("pins the inbox to the viewport and clips the page rather than expanding its body", () => {
    navigation.pathname = "/dashboard/inbox";
    const html = renderToStaticMarkup(createElement(DashboardShell, {
      sidebar: createElement("div", null, "normal-sidebar"),
      topbar: createElement("div", null, "normal-topbar"),
      mobileNav: createElement("div", null, "normal-mobile-nav"),
      children: createElement("div", null, "chat"),
    }));
    expect(html).toContain("fixed inset-0");
    expect(html).toContain("h-[100dvh]");
    expect(html).toContain("flex min-h-0 min-w-0 flex-1 overflow-hidden p-0");
    expect(html).not.toContain("normal-sidebar");
    expect(html).not.toContain("normal-topbar");
    expect(html).not.toContain("normal-mobile-nav");
  });

  it("preserves the normal dashboard chrome on other routes", () => {
    navigation.pathname = "/dashboard";
    const html = renderToStaticMarkup(createElement(DashboardShell, {
      sidebar: createElement("div", null, "normal-sidebar"),
      topbar: createElement("div", null, "normal-topbar"),
      mobileNav: createElement("div", null, "normal-mobile-nav"),
      children: createElement("div", null, "content"),
    }));
    expect(html).toContain("normal-sidebar");
    expect(html).toContain("normal-topbar");
    expect(html).toContain("normal-mobile-nav");
    expect(html).not.toContain("fixed inset-0");
  });

  it("gives the chat list an independent scrolling surface", () => {
    const conversation: ConversationRow = {
      conversationId: "22222222-2222-2222-2222-222222222222",
      contactExternalKey: "201012345678@s.whatsapp.net",
      contactDisplayName: null,
      contactPhoneNormalized: "201012345678",
      lastMessagePreview: "مواعيد العمل؟",
      lastMessageDirection: "INBOUND",
      lastMessageAtUtc: "2026-10-12T18:00:00.000Z",
      status: "OPEN",
      aiMode: "HUMAN_PAUSED",
      aiPauseReason: "HUMAN_TAKEOVER",
      aiReplyHealth: null,
      unread: true,
    };
    const html = renderToStaticMarkup(createElement(InboxPanel, {
      initialConversations: [conversation],
      initialCounts: { total: 1, unread: 1 },
      initialHasMore: false,
      initialCursor: null,
    }));
    expect(html).toContain("overflow-y-auto overscroll-contain");
    expect(html).toContain("h-full min-h-0 w-full shrink-0 flex-col overflow-hidden");
    expect(html).toContain("مواعيد العمل؟");
    expect(html).toContain("aria-label=\"رسالة غير مقروءة\"");
    // A numeric contact should use the neutral person avatar, not the digit 2.
    expect(html).toContain('viewBox="0 0 24 24"');
    expect(html).toContain("min-h-[70px]");
  });
});
