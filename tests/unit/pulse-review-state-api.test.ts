import { beforeEach, describe, expect, it, vi } from "vitest";

const db=vi.hoisted(()=>({query:vi.fn()}));
vi.mock("@/lib/db",()=>({
  query:db.query,
  sql:{UniqueIdentifier:"uuid",NVarChar:(size:number)=>"nvarchar"+size},
}));
vi.mock("@/lib/api/auth-context",()=>({
  requireApiBusiness:async()=>({businessId:"11111111-1111-4111-8111-111111111111"}),
}));
vi.mock("@/lib/api/http",()=>({
  jsonOk:(body:unknown)=>Response.json(body),
  handleApiError:(e:unknown)=>{throw e;},
}));

import { GET } from "@/app/api/pulse/review-state/route";
const conversationId="d6e05bff-397c-498c-b0fe-2f92ffa5adad";
const request=(kind:"ESCALATION"|"SIGNAL",intent="PRICE")=>new Request(
  "https://app.drvotech.com/api/pulse/review-state?"+
  new URLSearchParams({conversationId,kind,intent}).toString(),
);

describe("live review state from staff's phone replies",()=>{
  beforeEach(()=>db.query.mockReset());

  it("keeps the case awaiting a real reply when escalation is still NEEDS_ATTENTION",async()=>{
    db.query.mockResolvedValue({recordset:[{FollowUpPhase:"NEEDS_ATTENTION"}]});
    const data=await (await GET(request("ESCALATION"))).json();
    expect(data).toEqual({needsReply:true,inProgress:false});
    expect(db.query.mock.calls[0][0]).toContain("ResolvedAtUtc IS NULL");
    expect(db.query.mock.calls[0][1]).toEqual(expect.arrayContaining([
      expect.objectContaining({name:"businessId",value:"11111111-1111-4111-8111-111111111111"}),
      expect.objectContaining({name:"conversationId",value:conversationId}),
    ]));
  });

  it("recognizes a verified phone/DRVO human reply once backend moves it IN_PROGRESS",async()=>{
    db.query.mockResolvedValue({recordset:[{FollowUpPhase:"IN_PROGRESS"}]});
    const data=await (await GET(request("ESCALATION"))).json();
    expect(data).toEqual({needsReply:false,inProgress:true});
  });

  it("reads actionable Pulse signals without treating an acknowledgment as resolution",async()=>{
    db.query.mockResolvedValue({recordset:[{Pending:0,Handling:1}]});
    const data=await (await GET(request("SIGNAL"))).json();
    expect(data).toEqual({needsReply:false,inProgress:true});
    expect(db.query.mock.calls[0][0]).toContain("ActionState=N'IN_PROGRESS'");
    expect(db.query.mock.calls[0][1]).toEqual(expect.arrayContaining([
      expect.objectContaining({name:"intent",value:"PRICE"}),
    ]));
  });
});
