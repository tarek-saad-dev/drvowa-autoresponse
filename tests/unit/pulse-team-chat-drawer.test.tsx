import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { LiveOwnership } from "@/components/dashboard/pulse/live-ownership";
import { TeamChatDrawer } from "@/components/dashboard/pulse/team-chat-drawer";

const source = (file: string) => readFileSync(resolve(process.cwd(), file), "utf8");
const drawer = source("src/components/dashboard/pulse/team-chat-drawer.tsx");
const widget = source("src/components/dashboard/pulse/live-ownership.tsx");

const businessId = "00000000-0000-4000-8000-000000000001";
const chat = {
  conversationId: "00000000-0000-4000-8000-000000000002",
  name: "Youssef",
  waitingForTeam: true,
  lastInboundAtUtc: "2026-11-14T00:00:00.000Z",
};
const ownership = {
  withTeam: 48, awaitingTeamReply: 14, waitingCustomer: 34,
  chats: [chat, { ...chat, conversationId: "00000000-0000-4000-8000-000000000003",
    name: "Shrouk", waitingForTeam: false }],
};

describe("Pulse Home team-owned conversation launcher", () => {
  it("shows accurate server counts with clear needs-reply and in-progress states", () => {
    const html = renderToStaticMarkup(<LiveOwnership initial={ownership} businessId={businessId} />);
    expect(html).toContain("المحادثات مع الفريق");
    expect(html).toContain("مستنيين رد الفريق");
    expect(html).toContain("متابعة جارية");
    expect(html).toContain("Youssef");
    expect(html).toContain("Shrouk");
    expect(html).toContain("محتاج رد من الفريق");
    expect(html).toContain("جاري التعامل");
    expect(html).toContain("عرض الكل");
    expect(html).toContain("افتح محادثة Youssef");
    expect(html).not.toContain("conversationId=00000000-0000-4000-8000-000000000002");
  });

  it("offers the full Inbox route without forcing navigation for preview selection", () => {
    expect(widget).toContain("setActiveChat(chat)");
    expect(widget).toContain("<TeamChatDrawer");
    expect(widget).toContain("filter=HUMAN&limit=100");
    expect(widget).toContain("setExpanded(true)");
    expect(widget).toContain("onChanged={onChanged}");
  });

  it("renders a responsive Messenger-style drawer, reply composer and distinct resolution choices", () => {
    const html = renderToStaticMarkup(<TeamChatDrawer chat={chat} businessId={businessId}
      onClose={() => undefined} onChanged={() => undefined} />);
    expect(html).toContain('role="dialog"');
    expect(html).toContain("sm:bottom-5");
    expect(html).toContain("Youssef");
    expect(html).toContain("اكتب ردك للعميل");
    expect(html).toContain("لسه محتاجة متابعة");
    expect(html).toContain("اتحلت · رجّع للبوت");
    expect(html).toContain("الشات الكامل");
    expect(html).toContain("conversationId=00000000-0000-4000-8000-000000000002");
  });

  it("does not automatically close a follow-up after replying or opening a chat", () => {
    expect(drawer).toContain('setNotice("الرد اتسجل. المحادثة لسه مع الفريق');
    expect(drawer).toContain("setShowResolveConfirmation(true)");
    expect(drawer).toContain("setShowResolveConfirmation(false)");
    const sendBlock = drawer.slice(drawer.indexOf("async function send()"), drawer.indexOf("async function resolveAndReturnToAi()"));
    expect(sendBlock).not.toContain("/ai/resume");
    expect(sendBlock).not.toContain('"RESOLVED"');
    expect(drawer).toContain("if (!text || sending || saving || uncertain || handoffDone) return");
  });

  it("requires explicit confirmation, then resolves escalation before resuming AI", () => {
    const resolveIdx = drawer.indexOf('body: JSON.stringify({ status: "RESOLVED" })');
    const resumeIdx = drawer.indexOf('const resume = await fetch(base + "/ai/resume"');
    expect(resolveIdx).toBeGreaterThan(-1);
    expect(resumeIdx).toBeGreaterThan(resolveIdx);
    expect(drawer).toContain('if (!response.ok) throw new Error(friendly(data,');
    expect(drawer).toContain('if (!resume.ok || result.state?.mode !== "AUTO")');
    expect(drawer).toContain("ممكن البوت يرد على رسالة عميل معلّقة");
    expect(drawer).toContain('if (fresh.ai.mode === "SAFETY_PAUSED")');
    expect(drawer).toContain('const verified = await fetchStatus()');
    expect(drawer).toContain('verified.ai.mode !== "AUTO" || verified.escalation');
    expect(drawer).toContain('setHandoffDone(true)');
  });

  it("preserves send idempotency, blocks ambiguous retries and rechecks server state", () => {
    expect(drawer).toContain("crypto.randomUUID()");
    expect(drawer).toContain('if (result.status === "AMBIGUOUS")');
    expect(drawer).toContain("setUncertain(true)");
    expect(drawer).toContain("const fresh = await fetchStatus()");
    expect(drawer).toContain('method: "POST", credentials: "same-origin"');
    expect(drawer).toContain("onChanged()");
  });
});
