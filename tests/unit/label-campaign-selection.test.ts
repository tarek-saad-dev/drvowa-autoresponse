import {beforeEach,describe,expect,it,vi} from "vitest";

const mock=vi.hoisted(()=>({query:vi.fn()}));
vi.mock("@/lib/db",()=>({
  withTransaction:async(fn:(trx:{query:typeof mock.query})=>Promise<unknown>)=>
    fn({query:mock.query}),
  query:mock.query,
  sql:{
    UniqueIdentifier:"uuid",NVarChar:(n:number)=>"nchar-"+n,
  },
}));
vi.mock("@/modules/businesses/repository",()=>({getMembership:vi.fn()}));

import {createLabelCampaignDraftFromSelection} from "@/modules/messaging/label-campaign-drafts";

const params={
  businessId:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  userId:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  channelConnectionId:"cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  labelId:"VIP",
  messageText:"عندنا عرض جديد لعملائنا VIP",
};
beforeEach(()=>mock.query.mockReset());

describe("exact label selection campaign drafts",()=>{
  it("persists selected label ID, scoped to tenant, even when label name appears inside message",async()=>{
    mock.query.mockResolvedValueOnce({rowsAffected:[1]})
      .mockResolvedValueOnce({recordset:[{
        CampaignDraftID:"dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        LabelNameSnapshot:"VIP",MessageText:params.messageText,
        ObservedContactsAtDraft:9,Status:"DRAFT",
        CreatedAtUtc:new Date("2026-11-03T17:00:00Z"),
        UpdatedAtUtc:new Date("2026-11-03T17:00:00Z"),CopyApprovedAtUtc:null,
      }]});
    const draft=await createLabelCampaignDraftFromSelection(params);
    expect(draft.labelName).toBe("VIP");
    expect(draft.messageText).toBe(params.messageText);
    expect(draft.observedContacts).toBe(9);
    expect(draft.sendEnabled).toBe(false);
    expect(draft.audienceReady).toBe(false);
    const [sqlText,inputs]=mock.query.mock.calls[0];
    expect(sqlText).toContain("l.BusinessID=@businessId");
    expect(sqlText).toContain("l.ChannelConnectionID=@channelConnectionId");
    expect(sqlText).toContain("l.ProviderLabelID=@labelId");
    expect(sqlText).toContain("l.IsDeleted=0");
    expect(sqlText).toContain("ch.Status=N'ACTIVE'");
    expect(inputs.map((x:{value:unknown})=>x.value)).toContain(params.businessId);
    expect(inputs.map((x:{value:unknown})=>x.value)).toContain(params.labelId);
  });
  it("never creates a draft for an absent or foreign-tenant label",async()=>{
    mock.query.mockResolvedValueOnce({rowsAffected:[0]});
    await expect(createLabelCampaignDraftFromSelection(params)).rejects.toThrow();
    expect(mock.query).toHaveBeenCalledTimes(1);
  });
  it("rejects empty message, even with a selected label",async()=>{
    await expect(createLabelCampaignDraftFromSelection({...params,messageText:"  "}))
      .rejects.toThrow();
    expect(mock.query).not.toHaveBeenCalled();
  });
});
