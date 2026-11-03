import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(()=>({query:vi.fn(),trxQuery:vi.fn(),trxExecute:vi.fn()}));
vi.mock("@/lib/db",()=>({
  query:mocks.query,
  withTransaction:async(fn:(trx:{query:typeof mocks.trxQuery;execute:typeof mocks.trxExecute})=>Promise<unknown>)=>
    fn({query:mocks.trxQuery,execute:mocks.trxExecute}),
  sql:{
    UniqueIdentifier:"uuid",Int:"int",
    NVarChar:(n:number)=>"nvarchar"+n,
  },
}));
vi.mock("@/modules/channels/runtime-client",()=>({sendAccountMessage:vi.fn()}));
import {
  insideCampaignHours, processNextCampaignDelivery,
} from "@/modules/messaging/campaign-delivery-worker";

const job={
  RunID:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  BusinessID:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  PhoneNormalized:"201001234567",ContactID:"cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  AccountKey:"whatsapp-salon",MessageText:"العرض الجديد",
};
const quota={
  reserve:vi.fn().mockResolvedValue({state:"RESERVED"}),
  consume:vi.fn().mockResolvedValue(undefined),
  release:vi.fn().mockResolvedValue(undefined),
  markUncertain:vi.fn().mockResolvedValue(undefined),
};
function setupClaim(allowed=true) {
  mocks.query.mockResolvedValueOnce({rowsAffected:[0]})
    .mockResolvedValueOnce({rowsAffected:[0]})
    .mockResolvedValueOnce({rowsAffected:[0]})
    .mockResolvedValueOnce({recordset:[{Allowed:allowed?1:0}]});
  if(allowed) {
    mocks.query.mockResolvedValueOnce({recordset:[{Allowed:1}]});
  }
  mocks.query.mockResolvedValueOnce({rowsAffected:[1]})
    .mockResolvedValueOnce({rowsAffected:[0]});
  mocks.trxQuery.mockResolvedValueOnce({recordset:[{
    ChannelConnectionID:"dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    BusinessID:job.BusinessID,
  }]}).mockResolvedValueOnce({recordset:[{AttemptCount:0}]})
    .mockResolvedValueOnce({recordset:[job]});
  mocks.trxExecute.mockResolvedValue(1);
}

beforeEach(()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date("2026-11-03T10:30:00Z"));
  process.env.DRVO_LABEL_CAMPAIGNS_SEND_ENABLED="true";
  mocks.query.mockReset();mocks.trxQuery.mockReset();mocks.trxExecute.mockReset();
  quota.reserve.mockClear();quota.consume.mockClear();quota.release.mockClear();
  quota.markUncertain.mockClear();
});
afterEach(()=>{
  delete process.env.DRVO_LABEL_CAMPAIGNS_SEND_ENABLED;
  vi.useRealTimers();
});

describe("consent-only WhatsApp campaign worker",()=>{
  it("enforces Cairo quiet hours",()=>{
    expect(insideCampaignHours(new Date("2026-11-03T06:00:00Z"))).toBe(false);
    expect(insideCampaignHours(new Date("2026-11-03T07:00:00Z"))).toBe(true);
    expect(insideCampaignHours(new Date("2026-11-03T18:59:00Z"))).toBe(true);
    expect(insideCampaignHours(new Date("2026-11-03T19:00:00Z"))).toBe(false);
  });
  it("never touches data or sends when the feature is disabled",async()=>{
    delete process.env.DRVO_LABEL_CAMPAIGNS_SEND_ENABLED;
    expect(await processNextCampaignDelivery()).toBe("DISABLED");
    expect(mocks.query).not.toHaveBeenCalled();
  });
  it("honors quiet hours without querying recipients",async()=>{
    vi.setSystemTime(new Date("2026-11-03T22:00:00Z"));
    expect(await processNextCampaignDelivery()).toBe("OUTSIDE_HOURS");
    expect(mocks.query).not.toHaveBeenCalled();
  });
  it("sends exactly one approved recipient with a stable idempotency key",async()=>{
    setupClaim();
    const send=vi.fn().mockResolvedValue({
      success:true,status:"sent",messageId:"wamid.1",
    });
    const getStatus=vi.fn().mockResolvedValue({ready:true,state:"READY"});
    const result=await processNextCampaignDelivery({send,getStatus,...quota});
    expect(result).toBe("SENT");
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toMatchObject({
      accountKey:job.AccountKey,phone:job.PhoneNormalized,
      idempotencyKey:`campaign:${job.RunID}:${job.PhoneNormalized}`,
    });
    expect(mocks.query.mock.calls[3][0]).toContain("TblWhatsAppCampaignOptOut");
    expect(mocks.query.mock.calls[5][1].find((x:{name:string})=>x.name==="status").value)
      .toBe("SENT");
  });
  it("does not send if last-second STOP or revoke is detected",async()=>{
    setupClaim(false);
    const send=vi.fn();
    const getStatus=vi.fn().mockResolvedValue({ready:true,state:"READY"});
    const result=await processNextCampaignDelivery({send,getStatus,...quota});
    expect(result).toBe("SKIPPED");
    expect(send).not.toHaveBeenCalled();
  });
  it("marks provider timeout UNKNOWN without automatic retry",async()=>{
    setupClaim();
    const send=vi.fn().mockRejectedValue(new Error("network timeout"));
    const getStatus=vi.fn().mockResolvedValue({ready:true,state:"READY"});
    expect(await processNextCampaignDelivery({send,getStatus,...quota})).toBe("UNKNOWN");
    expect(send).toHaveBeenCalledTimes(1);
    expect(mocks.query.mock.calls[5][1].find((x:{name:string})=>x.name==="status").value)
      .toBe("UNKNOWN");
  });
});
