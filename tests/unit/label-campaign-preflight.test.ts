import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/lib/db", () => ({
  query: mock.query,
  withTransaction: async (fn: (trx: {query: typeof mock.query}) => unknown) => fn({ query: mock.query }),
  sql: {
    UniqueIdentifier: "uuid",
    Int: "int",
    VarBinary: (n: number) => "binary-" + n,
    NVarChar: (n: number) => "nvarchar-" + n,
  },
}));
import { createHash } from "node:crypto";
import { createLabelCampaignPreflight } from "@/modules/messaging/label-campaign-preflight";

const params = {
  businessId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  draftId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  userId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
};
const content = "عرض خاص للعملاء";
const approved = {
  CampaignDraftID: params.draftId,
  ChannelConnectionID: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  ProviderLabelID: "Coach",
  MessageText: content,
  Status: "COPY_APPROVED",
  LabelExists: true,
  LabelDeleted: false,
  ChannelActive: true,
};
const prior = {
  PreflightID: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
  CampaignDraftID: params.draftId,
  CopyHash: createHash("sha256").update(content).digest(),
  Status: "REVIEW_ONLY",
  ObservedMemberships: 2,
  UniqueValidPhones: 2,
  InvalidPhones: 0,
  DuplicatePhones: 0,
  CreatedAtUtc: new Date("2026-11-03T12:00:00Z"),
  CurrentDraftCopy: content,
  CurrentDraftStatus: "COPY_APPROVED",
};

beforeEach(() => mock.query.mockReset());

describe("durable campaign preflight", () => {
  it("rejects unapproved copy", async () => {
    mock.query.mockResolvedValueOnce({ recordset: [{ ...approved, Status: "DRAFT" }] });
    await expect(createLabelCampaignPreflight(params)).rejects.toThrow();
    expect(mock.query).toHaveBeenCalledTimes(1);
  });

  it("deduplicates a repeated plan request", async () => {
    mock.query.mockResolvedValueOnce({ recordset: [approved] })
      .mockResolvedValueOnce({ recordset: [prior] });
    const result = await createLabelCampaignPreflight(params);
    expect(result.idempotent).toBe(true);
    expect(result.sendEnabled).toBe(false);
    expect(result.verifiedSendable).toBe(0);
    expect(mock.query).toHaveBeenCalledTimes(2);
  });

  it("creates a recipient ledger with one row per valid phone", async () => {
    mock.query.mockResolvedValueOnce({ recordset: [approved] })
      .mockResolvedValueOnce({ recordset: [] })
      .mockResolvedValueOnce({ recordset: [{ Observed: 3, UniquePhones: 2, Invalid: 0 }] })
      .mockResolvedValueOnce({ rowsAffected: [1] })
      .mockResolvedValueOnce({ rowsAffected: [2] })
      .mockResolvedValueOnce({ recordset: [{ ...prior, ObservedMemberships: 3, DuplicatePhones: 1 }] });
    const result = await createLabelCampaignPreflight(params);
    expect(result.duplicatePhones).toBe(1);
    expect(result.blockedUnverifiedPermission).toBe(2);
    expect(result.sendEnabled).toBe(false);
    expect(mock.query.mock.calls[4][0]).toContain("ROW_NUMBER()");
    expect(mock.query.mock.calls[4][0]).toContain("END AS Reason");
    expect(mock.query.mock.calls[4][0]).toContain("N\'BLOCKED\', Reason");
    expect(mock.query.mock.calls[4][0]).not.toContain("N\'BLOCKED\', CASE WHEN stopped.PhoneNormalized");
    expect(mock.query.mock.calls[4][0]).toContain("N'BLOCKED'");
  });
});
