import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { canonicalInboxConversationId } from "@/lib/inbox/deep-link";

vi.mock("next/image", () => ({
  default: (props: {alt?: string; className?: string; src?: string}) =>
    createElement("img", {alt: props.alt ?? "", className: props.className, src: props.src ?? ""}),
}));
import { InboxPanel, type ConversationRow } from "@/components/dashboard/inbox-panel";

const id = "33075559-5ad1-4807-a77e-cf215ee5c975";
const conversation: ConversationRow = {
  conversationId: id,
  contactExternalKey: "201000000000@s.whatsapp.net",
  contactDisplayName: "عميل يحتاج مراجعة",
  contactPhoneNormalized: "201000000000",
  lastMessagePreview: "محتاج حد يتابع الطلب",
  lastMessageDirection: "INBOUND",
  lastMessageAtUtc: "2026-10-26T03:00:00Z",
  status: "OPEN",
  aiMode: "AUTO",
  aiPauseReason: null,
  hasOpenEscalation: false,
  aiReplyHealth: null,
  unread: false,
};

describe("Inbox conversation deep links", () => {
  it("normalizes SQL Server UUID casing before hydrating the selected thread", () => {
    expect(canonicalInboxConversationId([conversation], id.toUpperCase())).toBe(id);
    expect(canonicalInboxConversationId([conversation], id)).toBe(id);
    expect(canonicalInboxConversationId([], id)).toBeNull();
  });
  it("renders a linked conversation as selected from the first paint", () => {
    const html = renderToStaticMarkup(createElement(InboxPanel, {
      initialConversations: [conversation],
      initialSelectedId: canonicalInboxConversationId([conversation], id.toUpperCase()),
      initialCounts: {total: 1761, unread: 67, followUp: 0},
      initialHasMore: true,
      initialCursor: null,
    }));
    expect(html).toContain("عميل يحتاج مراجعة");
    expect(html).toContain("محتاج حد يتابع الطلب");
    expect(html).toContain('aria-label="محتوى المحادثة"');
    expect(html).toContain("رد يدوي");
    expect(html).not.toContain("كل محادثاتك. في مكان واحد.");
  });
  it("stays on the normal unselected inbox only when no conversation was requested", () => {
    const html = renderToStaticMarkup(createElement(InboxPanel, {
      initialConversations: [conversation],
      initialCounts: {total: 1761, unread: 67, followUp: 0},
      initialHasMore: true,
      initialCursor: null,
    }));
    expect(html).toContain("كل محادثاتك. في مكان واحد.");
  });
});
