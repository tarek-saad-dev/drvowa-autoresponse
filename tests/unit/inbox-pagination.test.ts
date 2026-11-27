import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  query: mocks.query,
  sql: {
    UniqueIdentifier: "UUID",
    DateTime2: "DATE",
    Int: "INT",
    NVarChar: (length: number) => "NVARCHAR(" + length + ")",
  },
}));

import {
  countConversationsForBusiness,
  listConversationsForBusiness,
  listMessagesForConversation,
} from "@/modules/messaging/repository";

const businessId = "11111111-1111-1111-1111-111111111111";

describe("inbox server-side pagination", () => {
  beforeEach(() => {
    mocks.query.mockReset();
    mocks.query.mockResolvedValue({ recordset: [] });
  });

  it("always scopes list queries to the authenticated business and sorts deterministically", async () => {
    await listConversationsForBusiness({ businessId, limit: 60 });
    const [sql, inputs] = mocks.query.mock.calls[0];
    expect(sql).toContain("WHERE c.BusinessID = @businessId");
    expect(sql).toContain("c.ConversationID DESC");
    expect(inputs).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "businessId", value: businessId }),
      expect.objectContaining({ name: "limit", value: 60 }),
    ]));
  });

  it("uses a stable keyset cursor for older chats", async () => {
    const at = new Date("2026-10-10T12:00:00.000Z");
    await listConversationsForBusiness({
      businessId, limit: 50,
      before: { at, conversationId: "22222222-2222-2222-2222-222222222222" },
    });
    const [sql, inputs] = mocks.query.mock.calls[0];
    expect(sql).toContain("c.ConversationID < @beforeId");
    expect(sql).toContain("ISNULL(c.LastMessageAtUtc, c.CreatedAtUtc) < (");
    expect(sql).toContain("anchor.ConversationID = @beforeId");
    expect(inputs).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "beforeId", value: "22222222-2222-2222-2222-222222222222" }),
    ]));
  });

  it("searches across the database with a bound parameter, not string interpolation", async () => {
    const search = "Ali%' OR 1=1 --";
    await listConversationsForBusiness({ businessId, search });
    const [sql, inputs] = mocks.query.mock.calls[0];
    expect(sql).toContain("CHARINDEX(@search");
    expect(sql).not.toContain(search);
    expect(inputs).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "search", value: search }),
    ]));
  });

  it("applies unread and ownership filters in SQL, not only to the loaded page", async () => {
    await listConversationsForBusiness({ businessId, filter: "UNREAD" });
    expect(mocks.query.mock.calls[0][0]).toContain("c.LastReadAtUtc");
    await listConversationsForBusiness({ businessId, filter: "HUMAN" });
    expect(mocks.query.mock.calls[1][0]).toContain("N'HUMAN_PAUSED'");
    await listConversationsForBusiness({ businessId, filter: "AUTO" });
    expect(mocks.query.mock.calls[2][0]).toContain("ai.Mode IS NULL");
  });

  it("uses the exact open escalation predicate for follow-ups, even when AI mode is AUTO or chat is archived", async () => {
    await listConversationsForBusiness({ businessId, filter: "FOLLOW_UP" });
    const [sqlText, args] = mocks.query.mock.calls[0] as [string, Array<{name: string; value: unknown}>];
    expect(sqlText).toContain("FROM dbo.TblHumanEscalation e");
    expect(sqlText).toContain("e.BusinessID = c.BusinessID AND e.ConversationID = c.ConversationID");
    expect(sqlText).toContain("e.ResolvedAtUtc IS NULL");
    expect(sqlText).toContain("e.Status IN (N'OPEN', N'ACKNOWLEDGED')");
    expect(sqlText).not.toContain("AND ai.Mode IN");
    expect(sqlText).not.toContain("AND c.IsArchived=0");
    expect(sqlText).toContain("AS HasOpenEscalation");
    expect(args).toEqual(expect.arrayContaining([expect.objectContaining({ name: "businessId", value: businessId })]));
  });

  it("returns real totals and unread counts from the conversation table", async () => {
    mocks.query.mockResolvedValueOnce({ recordset: [{ TotalCount: 824, UnreadCount: 19 }] });
    expect(await countConversationsForBusiness({ businessId }))
      .toEqual({ total: 824, unread: 19 });
    const [sql, inputs] = mocks.query.mock.calls[0];
    expect(sql).toContain("COUNT(1) AS TotalCount");
    expect(inputs).toEqual([expect.objectContaining({ name: "businessId", value: businessId })]);
  });
});


describe("OTP activity in inbox timeline", () => {
  it("projects recent confirmed OTP metadata without raw codes or write side effects, and preserves privacy", async () => {
    mocks.query.mockReset(); mocks.query.mockResolvedValue({ recordset: [] });
    await listMessagesForConversation({ businessId, conversationId: "22222222-2222-4222-8222-222222222222", limit: 100 });
    const [statement, inputs] = mocks.query.mock.calls[0];
    expect(statement).toContain("FROM dbo.TblOtpChallenge o");
    expect(statement).toContain("o.ProviderMessageID IS NOT NULL");
    expect(statement).toContain("ct.PhoneNormalized=o.PhoneNormalized");
    expect(statement).toContain("c.BusinessID=@businessId AND c.ConversationID=@conversationId");
    expect(statement).toContain("VwPrivacyVisibleConversation");
    expect(statement).toContain("TblWhatsAppWorkspaceReset");
    expect(statement).toContain("DATEADD(hour,-24,SYSUTCDATETIME())");
    expect(statement).toContain("existing.ProviderMessageID=o.ProviderMessageID");
    expect(statement).not.toContain("CodeHash");
    expect(statement).not.toMatch(/INSERT INTO|UPDATE dbo/i);
    expect(inputs).toContainEqual(expect.objectContaining({ name: "otpMarker", value: "🔐 تم إرسال رمز تحقق (OTP). تم إخفاء الرمز لحماية العميل." }));
  });
  it("includes the same source and stable cursor on older pages", async () => {
    mocks.query.mockReset(); mocks.query.mockResolvedValue({ recordset: [] });
    const at = new Date("2026-11-27T12:00:00Z");
    await listMessagesForConversation({ businessId, conversationId: "22222222-2222-4222-8222-222222222222", before: { at, createdAtUtc: at, messageId: "33333333-3333-4333-8333-333333333333" } });
    const [statement] = mocks.query.mock.calls[0];
    expect(statement).toContain("FROM InboxTimeline");
    expect(statement).toContain("MessageID < @beforeMessageId");
  });
});
