import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db",()=>({
  query:vi.fn(),
  sql:{UniqueIdentifier:"uuid"},
}));
import { query } from "@/lib/db";
import { getHumanOwnershipSnapshot } from "@/modules/ai/human-ownership";

const businessId="00000000-0000-4000-8000-000000000001";
const mock=vi.mocked(query);
describe("Live human ownership snapshot",()=>{
  beforeEach(()=>mock.mockReset());
  it("counts HUMAN_PAUSED chats independently from formal escalations and selected period",async()=>{
    mock.mockResolvedValue({recordset:[{
      ConversationID:"00000000-0000-4000-8000-000000000002",
      Name:"Customer",
      LastInboundAtUtc:new Date("2026-10-26T10:05:00Z"),
      AwaitingReply:1,Total:3,AwaitingCount:2,
    }]} as never);
    const result=await getHumanOwnershipSnapshot(businessId);
    expect(result).toMatchObject({withTeam:3,awaitingTeamReply:2,waitingCustomer:1});
    expect(result.chats[0]).toMatchObject({name:"Customer",waitingForTeam:true});
    const [sql,args]=mock.mock.calls[0];
    expect(sql).toContain("s.Mode=N'HUMAN_PAUSED'");
    expect(sql).toContain("c.LastInboundAtUtc >");
    expect(sql).toContain("MAX(e.LastHumanReplyAtUtc)");
    expect(sql).toContain("COUNT(*) OVER()");
    expect(sql).not.toContain(">=@start");
    expect(args).toEqual([{name:"businessId",type:"uuid",value:businessId}]);
  });
  it("does not invent zero-vs-active counts from an empty preview list",async()=>{
    mock.mockResolvedValue({recordset:[]} as never);
    expect(await getHumanOwnershipSnapshot(businessId)).toEqual({
      withTeam:0,awaitingTeamReply:0,waitingCustomer:0,chats:[],
    });
  });
});
