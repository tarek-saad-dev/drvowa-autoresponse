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
import { InboxPanel, conversationStatus, type ConversationRow } from "@/components/dashboard/inbox-panel";

describe("inbox viewport and UX layout contract", () => {
  it("pins the inbox to the viewport with a shared desktop top nav instead of a sidebar", () => {
    navigation.pathname = "/dashboard/inbox";
    /* eslint-disable react/no-children-prop -- createElement test harness */
    const html = renderToStaticMarkup(createElement(DashboardShell, {
      topbar: createElement("div", null, "normal-topbar"),
      mobileNav: createElement("div", null, "normal-mobile-nav"),
      children: createElement("div", null, "chat"),
    }));
    /* eslint-enable react/no-children-prop */
    expect(html).toContain("fixed inset-0");
    expect(html).toContain("h-[100dvh]");
    expect(html).toContain("flex min-h-0 min-w-0 flex-1 overflow-hidden p-0");
    expect(html).not.toContain("normal-sidebar");
    expect(html).toContain("normal-topbar");
    expect(html).toContain("hidden shrink-0 lg:block");
    expect(html).toContain("normal-mobile-nav");
  });

  it("preserves the normal dashboard chrome on other routes", () => {
    navigation.pathname = "/dashboard";
    /* eslint-disable react/no-children-prop -- createElement test harness */
    const html = renderToStaticMarkup(createElement(DashboardShell, {
      topbar: createElement("div", null, "normal-topbar"),
      mobileNav: createElement("div", null, "normal-mobile-nav"),
      children: createElement("div", null, "content"),
    }));
    /* eslint-enable react/no-children-prop */
    expect(html).not.toContain("normal-sidebar");
    expect(html).toContain("normal-topbar");
    expect(html).toContain("normal-mobile-nav");
    expect(html).not.toContain("fixed inset-0");
    expect(html).toContain("min-h-full min-w-0 flex-1 flex-col");
  });

  it("lists an open escalation in the follow-up filter even when the bot is in AUTO mode", () => {
    const conversation: ConversationRow = {
      conversationId: "22222222-2222-2222-2222-222222222222",
      contactExternalKey: "201012345678@s.whatsapp.net",
      contactDisplayName: "عميل محتاج متابعة",
      contactPhoneNormalized: "201012345678",
      lastMessagePreview: "محتاج أكلم المدير",
      lastMessageDirection: "INBOUND",
      lastMessageAtUtc: "2026-10-26T02:00:00Z",
      status: "OPEN",
      aiMode: "AUTO",
      aiPauseReason: null,
      hasOpenEscalation: true,
      aiReplyHealth: null,
      unread: false,
    };
    const html = renderToStaticMarkup(createElement(InboxPanel, {
      initialConversations: [conversation],
      initialCounts: { total: 1761, unread: 67, followUp: 1 },
      initialFilter: "FOLLOW_UP",
      initialHasMore: false,
      initialCursor: null,
    }));
    expect(html).toContain("عميل محتاج متابعة");
    expect(html).toContain("متابعة الفريق");
    expect(html).toContain("بحاجة لمراجعتك");
    expect(html).toContain("محتاج أكلم المدير");
    expect(html).not.toContain("مفيش محادثات في الفلتر ده");
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
    expect(html).toContain("/api/brand/assets/primary-light");
    expect(html).not.toContain('aria-label="التنقل السريع"');
    expect(html).not.toContain(">D</a>");
    expect(html).not.toContain("bg-[#f7f9f7]");
    expect(html).not.toContain("bg-[#087f76]");
  });
});


describe("inbox review and management UX", () => {
  const row: ConversationRow = {
    conversationId: "22222222-2222-4222-8222-222222222222",
    contactExternalKey: "201012345678@s.whatsapp.net", contactDisplayName: "عميل", contactPhoneNormalized: "201012345678",
    lastMessagePreview: "رسالة", lastMessageDirection: "INBOUND", lastMessageAtUtc: "2026-11-27T02:00:00Z",
    status: "OPEN", aiMode: "AUTO", aiPauseReason: null, aiReplyHealth: null, unread: false,
  };
  it("does not label disabled AI as a reply failure or pretend AI is following", () => {
    const disabled: ConversationRow = {...row, aiReplyHealth: {state:"DISABLED",reason:"AI_DISABLED",errorCode:null}};
    expect(conversationStatus(disabled)).toMatchObject({label:"الرد الآلي متوقف",attention:false});
    const html = renderToStaticMarkup(createElement(InboxPanel, {
      initialConversations:[disabled],initialSelectedId:row.conversationId,initialCounts:{total:1,unread:0,followUp:0},
      initialCursor:null,initialHasMore:false,canManagePrivacy:true,canResumeAll:true,
    }));
    expect(html).toContain("الرد الآلي متوقف");
    expect(html).toContain("رد الآن");
    expect(html).toContain("إعدادات الرد");
    expect(html).not.toContain("محتاج تدخل");
    expect(html).not.toContain("AI بيتابع");
    expect(html).not.toContain("فحص آخر رد");
    expect(html).toContain("تحديد محادثات");
    expect(html).toContain("الخصوصية وإدارة البيانات");
    expect(html).not.toContain("مسح سجل واتساب بالكامل");
    expect(html).not.toContain("#reset-whatsapp");
  });
  it("keeps a genuine failed reply distinct from an open team case and waiting for customer", () => {
    expect(conversationStatus({...row,aiReplyHealth:{state:"FAILED",reason:"WHATSAPP_SEND_FAILED",errorCode:null}})).toMatchObject({label:"بحاجة لمراجعتك",attention:true});
    expect(conversationStatus({...row,hasOpenEscalation:true,followUpPhase:"WAITING_CUSTOMER"})).toMatchObject({label:"بانتظار العميل",attention:false});
    expect(conversationStatus({...row,aiMode:"HUMAN_PAUSED",awaitingHumanReply:true})).toMatchObject({label:"ينتظر ردك",attention:true});
  });
});
