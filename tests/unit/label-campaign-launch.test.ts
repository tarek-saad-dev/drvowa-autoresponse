import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";

const mocks = vi.hoisted(() => ({
  query: vi.fn(), trxQuery: vi.fn(), getStatus: vi.fn(), entitlement:vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  query: mocks.query,
  withTransaction: async (fn: (trx: {query: typeof mocks.trxQuery}) => Promise<unknown>) =>
    fn({query: mocks.trxQuery}),
  sql: {
    UniqueIdentifier:"uuid", Int:"int",
    VarBinary: (n:number)=>"varbinary"+n,
    NVarChar:(n:number)=>"nvarchar"+n,
  },
}));
vi.mock("@/modules/channels/runtime-client", () => ({
  getAccountStatus:mocks.getStatus,
}));
vi.mock("@/modules/billing/entitlements", () => ({
  getEntitlementSnapshot:mocks.entitlement,
}));
import {
  campaignsSendingEnabled, launchCampaign, previewCampaignLaunch,
} from "@/modules/messaging/campaign-launch";
const businessId="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const draftId="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const preflightId="cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const message="عرض خاص للعملاء الموافقين";
const details={
  PreflightID:preflightId,CampaignDraftID:draftId,
  ChannelConnectionID:"dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  ProviderLabelID:"Coach",MessageText:message,DraftStatus:"COPY_APPROVED",
  CopyHash:createHash("sha256").update(message).digest(),
  AccountKey:"managed-account",ChannelStatus:"ACTIVE",
  LabelDeleted:false,LabelExists:true,BusinessName:"DRVO Coach",
};
const params={businessId,draftId,preflightId};
beforeEach(()=>{
  mocks.query.mockReset();mocks.trxQuery.mockReset();mocks.getStatus.mockReset();
  mocks.entitlement.mockReset();
  mocks.entitlement.mockResolvedValue({canAct:true,plan:{monthlyWhatsAppOutbound:100},whatsappOutboundUsed:0});
  process.env.DRVO_LABEL_CAMPAIGNS_SEND_ENABLED="true";
});
afterEach(()=>{delete process.env.DRVO_LABEL_CAMPAIGNS_SEND_ENABLED;});

describe("controlled marketing launch",()=>{
  it("shows a persisted run without requesting fresh eligibility or billing",async()=>{
    const existing={
      RunID:"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",Status:"RUNNING",
      EligibleCount:2,CreatedAtUtc:new Date("2026-11-03T15:00:00Z"),
      Pending:1,InFlight:0,Sent:1,Failed:0,Unknown:0,Skipped:0,
    };
    mocks.query.mockResolvedValueOnce({recordset:[details]})
      .mockResolvedValueOnce({recordset:[existing]});
    const result=await previewCampaignLaunch(params);
    expect(result.run?.status).toBe("RUNNING");
    expect(result.run?.sent).toBe(1);
    expect(result.canLaunch).toBe(false);
    expect(mocks.entitlement).not.toHaveBeenCalled();
    expect(mocks.query).toHaveBeenCalledTimes(2);
  });
  it("retries a committed launch without writing another run",async()=>{
    const existing={
      RunID:"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",Status:"QUEUED",
      EligibleCount:2,CreatedAtUtc:new Date("2026-11-03T15:00:00Z"),
      Pending:2,InFlight:0,Sent:0,Failed:0,Unknown:0,Skipped:0,
    };
    mocks.query.mockResolvedValueOnce({recordset:[existing]});
    const result=await launchCampaign({...params,userId:businessId,
      expectedEligible:2,expectedMessage:message});
    expect(result.runId).toBe(existing.RunID);
    expect(mocks.trxQuery).not.toHaveBeenCalled();
    expect(mocks.getStatus).not.toHaveBeenCalled();
  });
  it("reads persisted runs even without item rows during status recovery",async()=>{
    mocks.query.mockResolvedValueOnce({recordset:[{
      RunID:"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",Status:"QUEUED",
      EligibleCount:2,CreatedAtUtc:new Date("2026-11-03T15:00:00Z"),
      Pending:0,InFlight:0,Sent:0,Failed:0,Unknown:0,Skipped:0,
    }]});
    const {getCampaignRunStatus}=await import("@/modules/messaging/campaign-launch");
    const result=await getCampaignRunStatus(params);
    expect(result?.total).toBe(2);
    expect(mocks.query.mock.calls[0][0]).toContain("OUTER APPLY");
  });

  it("does not unlock launch without an explicit server feature gate",()=>{
    delete process.env.DRVO_LABEL_CAMPAIGNS_SEND_ENABLED;
    expect(campaignsSendingEnabled()).toBe(false);
  });
  it("reports only evidence-backed eligible recipients and the exact opt-in phrase",async()=>{
    mocks.query
      .mockResolvedValueOnce({recordset:[details]})
      .mockResolvedValueOnce({recordset:[]})
      .mockResolvedValueOnce({recordset:[{Total:2}]});
    const result=await previewCampaignLaunch(params);
    expect(result.eligible).toBe(2);
    expect(result.canLaunch).toBe(true);
    expect(result.optInText).toContain("DRVO Coach");
    expect(mocks.query.mock.calls[2][0]).toContain("TblWhatsAppCampaignPermission");
    expect(mocks.query.mock.calls[2][0]).toContain("TblWhatsAppCampaignOptOut");
  });
  it("blocks launch when copy was edited after approval",async()=>{
    mocks.query.mockResolvedValueOnce({
      recordset:[{...details,MessageText:"edited after preview"}],
    });
    await expect(launchCampaign({...params,userId:businessId,
      expectedEligible:1,expectedMessage:message})).rejects.toThrow();
    expect(mocks.getStatus).not.toHaveBeenCalled();
  });
  it("blocks when WhatsApp account is not READY",async()=>{
    mocks.query.mockResolvedValueOnce({recordset:[details]});
    mocks.getStatus.mockResolvedValueOnce({ready:false,state:"DISCONNECTED"});
    await expect(launchCampaign({...params,userId:businessId,
      expectedEligible:1,expectedMessage:message})).rejects.toThrow();
    expect(mocks.trxQuery).not.toHaveBeenCalled();
  });
  it("atomically snapshots eligible audience on confirmed owner launch",async()=>{
    mocks.query.mockResolvedValueOnce({recordset:[details]})
      .mockResolvedValueOnce({recordset:[{
        RunID:"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",Status:"QUEUED",
        EligibleCount:2,CreatedAtUtc:new Date("2026-11-03T15:00:00Z"),
        Pending:2,InFlight:0,Sent:0,Failed:0,Unknown:0,Skipped:0,
      }]});
    mocks.getStatus.mockResolvedValueOnce({ready:true,state:"READY"});
    mocks.trxQuery.mockResolvedValueOnce({recordset:[details]})
      .mockResolvedValueOnce({recordset:[]})
      .mockResolvedValueOnce({recordset:[{Total:2}]})
      .mockResolvedValueOnce({rowsAffected:[1]})
      .mockResolvedValueOnce({rowsAffected:[2]})
      .mockResolvedValueOnce({rowsAffected:[1]});
    // runId is random: getRunStatus has to return the actual persisted ID.
    // The test verifies the transactional selection and throw on summary mismatch.
    await expect(launchCampaign({...params,userId:businessId,
      expectedEligible:2,expectedMessage:message})).rejects.toThrow();
    expect(mocks.trxQuery.mock.calls[3][0]).toContain("INSERT INTO dbo.TblWhatsAppCampaignRun");
    expect(mocks.trxQuery.mock.calls[4][0]).toContain("TblWhatsAppCampaignPermission");
    expect(mocks.trxQuery.mock.calls[4][0]).toContain("TblWhatsAppCampaignOptOut");
  });
});
