import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ query: vi.fn(), upsertContact: vi.fn() }));
vi.mock("@/lib/db", () => ({
  sql: {
    UniqueIdentifier: "uuid", Int: "int", Bit: "bit",
    NVarChar: (length: number) => "nvarchar:" + length,
  },
  query: mock.query,
  withTransaction: async (fn: (trx: {query: typeof mock.query}) => Promise<unknown>) =>
    fn({query: mock.query}),
}));
vi.mock("@/modules/messaging/repository", () => ({
  upsertContact: mock.upsertContact,
}));

import {
  DRVO_LIST_PREFIX, MAX_IMPORT_AT_ONCE, createDrvoList,
  addDrvoListPhones, isDrvoListId, normalizeCampaignPhone, parseListPhones,
  removeDrvoListPhone,
} from "@/modules/messaging/local-whatsapp-lists";

const businessId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const channelId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const listId = "drvo:cccccccc-cccc-4ccc-8ccc-cccccccccccc";

beforeEach(() => { mock.query.mockReset(); mock.upsertContact.mockReset(); });

describe("DRVO-owned labels independent from WhatsApp Business sync", () => {
  it("only recognizes DRVO UUID prefixes, not arbitrary provider labels", () => {
    expect(isDrvoListId(listId)).toBe(true);
    expect(isDrvoListId("3")).toBe(false);
    expect(isDrvoListId("drvo:fake")).toBe(false);
  });

  it("normalizes Egyptian local numbers and deduplicates pasted contacts", () => {
    expect(normalizeCampaignPhone("01012345678")).toBe("201012345678");
    expect(normalizeCampaignPhone("+20 1012345678")).toBe("201012345678");
    expect(parseListPhones("01012345678\n+201012345678,01112345678"))
      .toEqual(["201012345678", "201112345678"]);
    expect(parseListPhones("+966 50 123 4567")).toEqual(["966501234567"]);
  });

  it("rejects groups, email, invalid phones and oversized input", () => {
    expect(normalizeCampaignPhone("123@lid")).toBeNull();
    expect(normalizeCampaignPhone("120363@g.us")).toBeNull();
    expect(normalizeCampaignPhone("010abc12345")).toBeNull();
    expect(() => parseListPhones("01012345678\ninvalid")).toThrow();
    expect(() => parseListPhones(Array.from({length:MAX_IMPORT_AT_ONCE+1},
      (_,i)=>"201012345" + String(100+i)).join("\n"))).toThrow();
  });

  it("creates one internal, clearly prefixed list on the single active account", async () => {
    mock.query.mockResolvedValueOnce({recordset:[{ChannelConnectionID:channelId}]})
      .mockResolvedValueOnce({rowsAffected:[1]});
    const result = await createDrvoList({businessId,name:" VIP "});
    expect(result.id.startsWith(DRVO_LIST_PREFIX)).toBe(true);
    expect(result.name).toBe("VIP");
    const [insert, params] = mock.query.mock.calls[1];
    expect(insert).toContain("INSERT INTO dbo.TblWhatsAppLabel");
    expect(insert).toContain("WHERE NOT EXISTS");
    expect(params.map((p:{value:unknown})=>p.value)).toContain(businessId);
    expect(params.map((p:{value:unknown})=>p.value)).toContain(channelId);
  });

  it("does not silently select a phone when multiple accounts are active", async () => {
    mock.query.mockResolvedValueOnce({recordset:[
      {ChannelConnectionID:channelId}, {ChannelConnectionID:businessId},
    ]});
    await expect(createDrvoList({businessId,name:"VIP"})).rejects.toThrow();
    expect(mock.query).toHaveBeenCalledTimes(1);
  });

  it("fails if WhatsApp is not connected", async () => {
    mock.query.mockResolvedValueOnce({recordset:[]});
    await expect(createDrvoList({businessId,name:"VIP"})).rejects.toThrow();
    expect(mock.query).toHaveBeenCalledTimes(1);
  });

  it("adds phones to one tenant-scoped list, not to WhatsApp or marketing permissions", async () => {
    mock.query.mockResolvedValueOnce({recordset:[{
      ChannelConnectionID:channelId,ProviderLabelID:listId,
      LabelName:"VIP",IsDeleted:false,
    }]})
      .mockResolvedValueOnce({recordset:[{Total:0}]})
      .mockResolvedValueOnce({recordset:[{WasActive:false}]})
      .mockResolvedValueOnce({recordset:[{WasActive:false}]})
      .mockResolvedValueOnce({recordset:[{Total:2}]});
    mock.upsertContact.mockResolvedValueOnce({contactId:businessId})
      .mockResolvedValueOnce({contactId:channelId});
    const result = await addDrvoListPhones({
      businessId,listId,phones:["01012345678", "+201112345678"],
    });
    expect(result).toEqual({added:2,total:2});
    expect(mock.upsertContact).toHaveBeenCalledTimes(2);
    const statements = mock.query.mock.calls.map(([text])=>String(text)).join("\n");
    expect(statements).toContain("TblWhatsAppContactLabel");
    expect(statements).not.toContain("TblWhatsAppCampaignPermission");
    expect(statements).not.toContain("sendAccountMessage");
    expect(mock.upsertContact.mock.calls[0][0]).toMatchObject({
      businessId,channelConnectionId:channelId,phoneNormalized:"201012345678",
    });
  });

  it("does not let an owner alter a native WhatsApp Business label", async () => {
    await expect(addDrvoListPhones({
      businessId,listId:"3",phones:["01012345678"],
    })).rejects.toThrow();
    expect(mock.query).not.toHaveBeenCalled();
  });

  it("only removes a phone from a local, tenant-scoped membership", async () => {
    mock.query.mockResolvedValueOnce({rowsAffected:[1]});
    expect(await removeDrvoListPhone({
      businessId,listId,phone:"01012345678",
    })).toBe(true);
    const [statement,params]=mock.query.mock.calls[0];
    expect(statement).toContain("cl.BusinessID=@businessId");
    expect(statement).toContain("l.ProviderLabelID LIKE N'drvo:%'");
    expect(params.map((p:{value:unknown})=>p.value)).toContain("201012345678");
  });
});
