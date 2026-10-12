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
    expect(sql).toContain("ISNULL(c.LastMessageAtUtc, c.CreatedAtUtc) < @beforeAt");
    expect(inputs).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "beforeAt", value: at }),
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

  it("returns real totals and unread counts from the conversation table", async () => {
    mocks.query.mockResolvedValueOnce({ recordset: [{ TotalCount: 824, UnreadCount: 19 }] });
    expect(await countConversationsForBusiness({ businessId }))
      .toEqual({ total: 824, unread: 19 });
    const [sql, inputs] = mocks.query.mock.calls[0];
    expect(sql).toContain("COUNT(1) AS TotalCount");
    expect(inputs).toEqual([expect.objectContaining({ name: "businessId", value: businessId })]);
  });
});
