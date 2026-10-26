import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
 list: vi.fn(), counts: vi.fn(), conversation: vi.fn(), contact: vi.fn(),
 ai: vi.fn(), membership: vi.fn(),
}));
vi.mock("next/navigation", () => ({redirect: (url: string) => {throw new Error("redirect:"+url);}}));
vi.mock("@/components/dashboard/inbox-panel", () => ({InboxPanel: () => null}));
vi.mock("@/modules/messaging/repository", () => ({
 getConversationForBusiness: mocks.conversation,
 getContactForBusiness: mocks.contact,
}));
vi.mock("@/modules/ai/inbox-ai-service", () => ({getInboxConversationAiState: mocks.ai}));
vi.mock("@/modules/businesses/repository", () => ({getMembership: mocks.membership}));
vi.mock("@/lib/tenancy/active-business", () => ({
 resolveActiveBusiness: async () => "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
 setActiveBusiness: async () => undefined,
}));
vi.mock("@/lib/tenancy/require-user", () => ({requireAuthenticatedUser: async () => ({
 userId:"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
 sessionId:"session",activeBusinessId:"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
})}));
vi.mock("@/modules/messaging", () => ({
 listInboxConversations: mocks.list,
 getInboxConversationCounts: mocks.counts,
}));

import InboxPage from "@/app/(app)/dashboard/inbox/page";

const id = "33075559-5ad1-4807-a77e-cf215ee5c975";
const base = {
 conversationId:id,businessId:"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
 contactId:"cccccccc-cccc-cccc-cccc-cccccccccccc",
 channelConnectionId:"dddddddd-dddd-dddd-dddd-dddddddddddd",
 status:"OPEN",lastMessageAtUtc:new Date("2026-10-20T13:00:00Z"),
 lastInboundAtUtc:new Date("2026-10-20T13:00:00Z"),
 lastOutboundAtUtc:null,createdAtUtc:new Date("2026-10-20T13:00:00Z"),
 updatedAtUtc:new Date("2026-10-20T13:00:00Z"),
};

describe("Inbox server deep-link hydration (tenant scoped)", () => {
 beforeEach(() => {
  vi.clearAllMocks();
  mocks.counts.mockResolvedValue({total:1761,unread:67,followUp:0});
  mocks.list.mockResolvedValue([]);
  mocks.membership.mockResolvedValue({status:"ACTIVE",role:"OWNER"});
  mocks.contact.mockResolvedValue({
   contactId:base.contactId,externalContactKey:"201000000000@s.whatsapp.net",
   displayName:"عميل يحتاج مراجعة",phoneNormalized:"201000000000",
  });
  mocks.ai.mockResolvedValue({mode:"AUTO",pauseReason:null});
  mocks.conversation.mockResolvedValue({...base});
 });
 it("finds a conversation missing from the first page, despite uppercase Pulse URL", async () => {
  const view=await InboxPage({searchParams:Promise.resolve({conversationId:id.toUpperCase()})});
  const p=view.props as {initialSelectedId:string; initialConversations:Array<{conversationId:string}>;requestedConversationUnavailable:boolean};
  expect(mocks.conversation).toHaveBeenCalledWith({
   businessId:base.businessId,conversationId:id.toUpperCase(),
  });
  expect(p.initialSelectedId).toBe(id);
  expect(p.initialConversations[0].conversationId).toBe(id);
  expect(p.requestedConversationUnavailable).toBe(false);
 });
 it("uses canonical list ID and never fetches the conversation again unnecessarily", async () => {
  mocks.list.mockResolvedValue([{
   ...base,contactExternalKey:"201000000000@s.whatsapp.net",
   contactDisplayName:"عميل يحتاج مراجعة",contactPhoneNormalized:"201000000000",
   lastMessagePreview:"طلب سابق",lastMessageDirection:"INBOUND",
   aiMode:"AUTO",aiPauseReason:null,unread:false,
  }]);
  const view=await InboxPage({searchParams:Promise.resolve({conversationId:id.toUpperCase()})});
  expect((view.props as {initialSelectedId:string}).initialSelectedId).toBe(id);
  expect(mocks.conversation).not.toHaveBeenCalled();
 });
 it("clearly identifies a genuinely unavailable conversation instead of a silent blank pane", async () => {
  mocks.conversation.mockResolvedValue(null);
  const view=await InboxPage({searchParams:Promise.resolve({conversationId:id})});
  const p=view.props as {initialSelectedId:string|null;requestedConversationUnavailable:boolean};
  expect(p.initialSelectedId).toBeNull();
  expect(p.requestedConversationUnavailable).toBe(true);
 });
});
