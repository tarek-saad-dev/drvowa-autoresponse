import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/lib/db", () => ({
  query: mocks.query,
  sql: {
    UniqueIdentifier: "uuid",
    NVarChar: (n: number) => "nvarchar-" + n,
  },
}));
vi.mock("@/modules/messaging/repository", () => ({ upsertContact: vi.fn() }));

import { checkDrvoListTestRecipient } from "@/modules/messaging/local-whatsapp-lists";

const params = {
  businessId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  listId: "drvo:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  phone: "01012345678",
};

beforeEach(() => mocks.query.mockReset());

describe("one-number campaign delivery readiness diagnostic", () => {
  it("requires DRVO-owned label and does not query native WhatsApp labels", async () => {
    await expect(checkDrvoListTestRecipient({
      ...params, listId: "3",
    })).rejects.toThrow();
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("shows real membership and inbound opt-in without sending or modifying permission", async () => {
    mocks.query.mockResolvedValueOnce({recordset:[{
      BusinessName:"Cut Salon",InList:true,HasPermission:true,OptedOut:false,
    }]});
    const result = await checkDrvoListTestRecipient(params);
    expect(result).toEqual({
      inList:true,hasPermission:true,optedOut:false,eligibleForReview:true,
      businessName:"Cut Salon",
      optInText:"أوافق على استقبال عروض Cut Salon على واتساب",
    });
    expect(mocks.query).toHaveBeenCalledTimes(1);
    const [statement, args] = mocks.query.mock.calls[0];
    expect(statement).toContain("l.BusinessID=@businessId");
    expect(statement).toContain("l.ProviderLabelID LIKE N'drvo:%'");
    expect(statement).toContain("perm.Source=N'EXPLICIT_INBOUND'");
    expect(statement).toContain("TblWhatsAppCampaignOptOut");
    expect(statement).not.toMatch(/INSERT|UPDATE|DELETE|sendAccountMessage/);
    expect(args.map((entry:{value:unknown})=>entry.value)).toContain("201012345678");
  });

  it("keeps opt-out as blocked even with an earlier permission", async () => {
    mocks.query.mockResolvedValueOnce({recordset:[{
      BusinessName:"Cut Salon",InList:true,HasPermission:true,OptedOut:true,
    }]});
    const result = await checkDrvoListTestRecipient(params);
    expect(result.hasPermission).toBe(true);
    expect(result.optedOut).toBe(true);
    expect(result.eligibleForReview).toBe(false);
  });

  it("keeps an imported phone blocked until its own inbound opt-in", async () => {
    mocks.query.mockResolvedValueOnce({recordset:[{
      BusinessName:"Cut Salon",InList:true,HasPermission:false,OptedOut:false,
    }]});
    expect((await checkDrvoListTestRecipient(params)).eligibleForReview).toBe(false);
  });

  it("returns not-found without exposing other businesses or deleted lists", async () => {
    mocks.query.mockResolvedValueOnce({recordset:[]});
    await expect(checkDrvoListTestRecipient(params)).rejects.toThrow();
  });
});
