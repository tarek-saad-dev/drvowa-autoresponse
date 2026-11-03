import { beforeEach, describe, expect, it, vi } from "vitest";

const query = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({
  query,
  sql: { UniqueIdentifier: "uuid" },
}));
import { getLabelCampaignAudiencePreview } from "@/modules/messaging/label-campaign-audience";

const scope = {
  businessId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  draftId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
};

beforeEach(() => query.mockReset());

describe("read-only label audience preview", () => {
  it("keeps recipients masked, deduplicates phones, and never declares sending ready", async () => {
    query.mockResolvedValueOnce({
      recordset: [{
        CampaignDraftID: scope.draftId,
        LabelNameSnapshot: "Coach",
        Status: "DRAFT",
        LabelPresent: true,
        LabelDeleted: false,
        ChannelActive: true,
      }],
    }).mockResolvedValueOnce({
      recordset: [{ ObservedContacts: 6, UniquePhones: 4, InvalidPhoneRows: 1 }],
    }).mockResolvedValueOnce({
      recordset: [{ LastFour: "1234", DisplayName: "أحمد" }],
    });

    const result = await getLabelCampaignAudiencePreview(scope);
    expect(result.uniquePhones).toBe(4);
    expect(result.duplicatePhoneRows).toBe(1);
    expect(result.invalidPhoneRows).toBe(1);
    expect(result.sample).toEqual([{ maskedPhone: "***1234", displayName: "أحمد" }]);
    expect(result.audienceReady).toBe(false);
    expect(result.sendingEnabled).toBe(false);
    expect(JSON.stringify(result)).not.toContain("PhoneNormalized");

    expect(query).toHaveBeenCalledTimes(3);
    for (const [sqlText, inputs] of query.mock.calls) {
      expect(sqlText).toContain("BusinessID=@businessId");
      expect(inputs).toEqual([
        { name: "businessId", type: "uuid", value: scope.businessId },
        { name: "draftId", type: "uuid", value: scope.draftId },
      ]);
    }
  });

  it("refuses cross-tenant or nonexistent draft metadata", async () => {
    query.mockResolvedValueOnce({ recordset: [] });
    await expect(getLabelCampaignAudiencePreview(scope)).rejects.toThrow();
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("exposes inactive label status but never unlocks broadcast", async () => {
    query.mockResolvedValueOnce({
      recordset: [{ CampaignDraftID: scope.draftId, LabelNameSnapshot: "Old",
        Status: "COPY_APPROVED", LabelPresent: true, LabelDeleted: true,
        ChannelActive: true }],
    }).mockResolvedValueOnce({
      recordset: [{ ObservedContacts: 0, UniquePhones: 0, InvalidPhoneRows: 0 }],
    }).mockResolvedValueOnce({ recordset: [] });
    const result = await getLabelCampaignAudiencePreview(scope);
    expect(result.labelStillActive).toBe(false);
    expect(result.sendingEnabled).toBe(false);
  });
});
