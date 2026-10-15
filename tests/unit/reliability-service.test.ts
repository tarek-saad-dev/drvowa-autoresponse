import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  query: vi.fn(),
  sql: { UniqueIdentifier: "uuid", NVarChar: (length: number) => `nvarchar(${length})`, DateTime2: "datetime" },
}));
vi.mock("@/modules/messaging/repository", () => ({
  resolveChannelByExternalAccountKey: vi.fn(),
}));

import { query } from "@/lib/db";
import { resolveChannelByExternalAccountKey } from "@/modules/messaging/repository";
import {
  receiptBatchSchema, recordRuntimeReceipts, runReliabilityAudit,
} from "@/modules/reliability/service";

const q = vi.mocked(query);
const channel = vi.mocked(resolveChannelByExternalAccountKey);

describe("reliability receipts and watchdog", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("rejects malformed receipt batches", () => {
    expect(receiptBatchSchema.safeParse({ accountKey: "abc", records: [] }).success).toBe(false);
    expect(receiptBatchSchema.safeParse({
      accountKey: "abc",
      records: [{ providerMessageId: "id", capturedAt: "2026-10-15T10:00:00.000Z", status: "UNKNOWN" }],
    }).success).toBe(false);
  });

  it("derives tenant from the S2S account key, never trusts an incoming businessId", async () => {
    channel.mockResolvedValue({
      businessId: "11111111-1111-4111-8111-111111111111",
      channelConnectionId: "22222222-2222-4222-8222-222222222222",
    } as never);
    q.mockResolvedValue({ recordset: [], rowsAffected: [1] } as never);
    const count = await recordRuntimeReceipts({
      accountKey: "account-key",
      records: [{ providerMessageId: "receipt-1", capturedAt: "2026-10-15T10:00:00.000Z", status: "DELIVERED" }],
    });
    expect(count).toBe(1);
    const [sqlText, args] = q.mock.calls[0];
    expect(sqlText).toContain("MERGE dbo.TblRuntimeInboundReceipt WITH (HOLDLOCK)");
    expect(sqlText).toContain("target.DeliveryStatus = N'DELIVERED'");
    expect(args).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "businessId", value: "11111111-1111-4111-8111-111111111111" }),
      expect.objectContaining({ name: "pmid", value: "receipt-1" }),
    ]));
  });

  it("does no outbound sends and excludes older coalesced texts from the scan", async () => {
    q.mockResolvedValue({ recordset: [], rowsAffected: [0] } as never);
    expect(await runReliabilityAudit()).toEqual({ receiptIncidents: 0, aiIncidents: 0 });
    const scans = q.mock.calls.map(call => call[0]).join("\n");
    expect(scans).toContain("newer.Direction=N'INBOUND'");
    expect(scans).toContain("state.ResumedAtUtc");
    expect(scans).toContain("sent.Direction");
    expect(scans).not.toContain("sendAccountMessage");
  });
});
