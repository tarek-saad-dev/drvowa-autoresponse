import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  query: vi.fn(),
  execute: vi.fn(),
  resolve: vi.fn(),
  upsertContact: vi.fn(),
  upsertConversation: vi.fn(),
  insertMessage: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  query: mock.query,
  withTransaction: async (fn: (trx: unknown) => Promise<unknown>) =>
    fn({ query: mock.query, execute: mock.execute }),
  sql: {
    UniqueIdentifier: "uuid", DateTime2: "date", Bit: "bit", BigInt: "big",
    NVarChar: (n: number) => "nvarchar:" + n,
  },
}));
vi.mock("@/modules/messaging/repository", () => ({
  resolveChannelByExternalAccountKey: mock.resolve,
  upsertContact: mock.upsertContact,
  upsertOpenConversation: mock.upsertConversation,
  insertMessageIdempotent: mock.insertMessage,
}));
import { whatsappSyncSchema, ingestWhatsAppSync } from "@/modules/messaging/whatsapp-sync-service";

const id1 = "11111111-1111-4111-8111-111111111111";
const id2 = "22222222-2222-4222-8222-222222222222";
const id3 = "33333333-3333-4333-8333-333333333333";
const id4 = "44444444-4444-4444-8444-444444444444";
const message = {
  kind: "message" as const,
  contactKey: "201011747438@s.whatsapp.net",
  providerMessageId: "false_201011747438@c.us_some-id",
  direction: "INBOUND" as const,
  historical: true,
  occurredAt: "2026-10-11T11:00:00.000Z",
  contentType: "TEXT" as const, text: "old message",
};

describe("WhatsApp mirror sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.resolve.mockResolvedValue({ businessId: id1, channelConnectionId: id2,
      isActive: true, status: "ACTIVE" });
    mock.upsertContact.mockResolvedValue({ contactId: id3 });
    mock.upsertConversation.mockResolvedValue({ conversationId: id4 });
    mock.insertMessage.mockResolvedValue({ inserted: true, message: { messageId: id3 } });
    mock.execute.mockResolvedValue(1);
  });

  it("rejects callers trying to supply their own business ID", () => {
    expect(whatsappSyncSchema.safeParse({
      accountKey: "linked-account", events: [message], businessId: id1,
    }).success).toBe(false);
  });

  it("ingests history without scheduling any AI job or marking historical inbound unread", async () => {
    const result = await ingestWhatsAppSync({ accountKey: "linked-account", events: [message] });
    expect(result).toEqual({ chats: 0, messages: 1, duplicates: 0 });
    expect(mock.resolve).toHaveBeenCalledWith("linked-account");
    expect(mock.insertMessage).toHaveBeenCalledWith(
      expect.objectContaining({ businessId: id1, providerMessageId: message.providerMessageId }),
      expect.anything(),
    );
    const statements = mock.execute.mock.calls.map(call => String(call[0])).join("\n");
    expect(statements).toContain("IsHistorical");
    expect(statements).toContain("WHEN @historical=0");
    expect(statements).not.toContain("TblAiReplyJob");
  });

  it("records duplicates without producing a second conversation or message", async () => {
    mock.insertMessage.mockResolvedValue({ inserted: false, message: { messageId: id3 } });
    expect(await ingestWhatsAppSync({ accountKey: "linked-account", events: [message] }))
      .toEqual({ chats: 0, messages: 0, duplicates: 1 });
  });

  it("preserves a contact from chat history even with zero messages", async () => {
    const result = await ingestWhatsAppSync({ accountKey: "linked-account", events: [{
      kind: "chat", contactKey: "201011747438@s.whatsapp.net",
      displayName: "عميل", archived: false, pinned: true,
    }] });
    expect(result.chats).toBe(1);
    expect(mock.upsertContact).toHaveBeenCalledOnce();
    expect(mock.upsertConversation).toHaveBeenCalledOnce();
    const statements = mock.execute.mock.calls.map(call => String(call[0])).join("\n");
    expect(statements).toContain("DisplayName=@name");
    expect(statements).toContain("IsPinned = COALESCE(@pinned,IsPinned)");
  });
});
