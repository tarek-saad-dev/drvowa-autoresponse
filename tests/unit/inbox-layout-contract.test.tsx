import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

const navigation = vi.hoisted(() => ({ pathname: "/dashboard/inbox" }));
vi.mock("next/navigation", () => ({ usePathname: () => navigation.pathname }));
vi.mock("next/image", () => ({
  default: (props: { alt?: string; className?: string; src?: string }) =>
    createElement("img", {
      alt: props.alt ?? "",
      className: props.className,
      src: typeof props.src === "string" ? props.src : "",
    }),
}));

import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { InboxPanel, type ConversationRow } from "@/components/dashboard/inbox-panel";

describe("inbox viewport and UX layout contract", () => {
  it("pins the inbox to the viewport while keeping the shared sidebar", () => {
    navigation.pathname = "/dashboard/inbox";
    /* eslint-disable react/no-children-prop -- createElement test harness */
    const html = renderToStaticMarkup(createElement(DashboardShell, {
      sidebar: createElement("div", null, "normal-sidebar"),
      topbar: createElement("div", null, "normal-topbar"),
      mobileNav: createElement("div", null, "normal-mobile-nav"),
      children: createElement("div", null, "chat"),
    }));
    /* eslint-enable react/no-children-prop */
    expect(html).toContain("fixed inset-0");
    expect(html).toContain("h-[100dvh]");
    expect(html).toContain("flex min-h-0 min-w-0 flex-1 overflow-hidden p-0");
    expect(html).toContain("normal-sidebar");
    expect(html).not.toContain("normal-topbar");
    expect(html).toContain("normal-mobile-nav");
  });

  it("preserves the normal dashboard chrome on other routes", () => {
    navigation.pathname = "/dashboard";
    /* eslint-disable react/no-children-prop -- createElement test harness */
    const html = renderToStaticMarkup(createElement(DashboardShell, {
      sidebar: createElement("div", null, "normal-sidebar"),
      topbar: createElement("div", null, "normal-topbar"),
      mobileNav: createElement("div", null, "normal-mobile-nav"),
      children: createElement("div", null, "content"),
    }));
    /* eslint-enable react/no-children-prop */
    expect(html).toContain("normal-sidebar");
    expect(html).toContain("normal-topbar");
    expect(html).toContain("normal-mobile-nav");
    expect(html).not.toContain("fixed inset-0");
  });

  it("uses DRVO brand tokens and logo instead of a separate green inbox theme", () => {
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
    expect(html).toContain('viewBox="0 0 24 24"');
    expect(html).toContain("min-h-[70px]");
    expect(html).toContain("bg-background");
    expect(html).toContain("bg-card");
    expect(html).toContain("bg-primary");
    expect(html).toContain("/brand/logo-on-light.png");
    expect(html).not.toContain('aria-label="التنقل السريع"');
    expect(html).not.toContain(">D</a>");
    expect(html).not.toContain("bg-[#f7f9f7]");
    expect(html).not.toContain("bg-[#087f76]");
  });
});
