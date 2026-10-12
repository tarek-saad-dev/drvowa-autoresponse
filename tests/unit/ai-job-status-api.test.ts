import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  getConversationForBusiness: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  query: mocks.query,
  sql: { UniqueIdentifier: "UUID" },
  withTransaction: vi.fn(),
}));
vi.mock("@/modules/messaging/repository", () => ({
  getConversationForBusiness: mocks.getConversationForBusiness,
}));
import { getInboxAiJobStatus } from "@/modules/ai/inbox-ai-service";

const businessId = "11111111-1111-1111-1111-111111111111";
const conversationId = "22222222-2222-2222-2222-222222222222";
const jobId = "33333333-3333-3333-3333-333333333333";

describe("tenant scoped AI reply job diagnostics", () => {
  beforeEach(() => {
    mocks.query.mockReset();
    mocks.getConversationForBusiness.mockReset();
    mocks.getConversationForBusiness.mockResolvedValue({ businessId, conversationId });
    mocks.query.mockResolvedValue({ recordset: [{
      AiReplyJobID: jobId,
      TriggerMessageID: "44444444-4444-4444-4444-444444444444",
      Status: "FAILED",
      LastErrorCode: "NOT_READY",
      CreatedAtUtc: new Date("2026-10-13T00:00:00Z"),
      NotBeforeUtc: new Date("2026-10-13T00:00:00Z"),
      CompletedAtUtc: new Date("2026-10-13T00:00:05Z"),
      OutboundProviderMessageID: null,
    }] });
  });

  it("checks the requested job only within the authenticated business/conversation", async () => {
    const result = await getInboxAiJobStatus({ businessId, conversationId, jobId });
    expect(result?.status).toBe("FAILED");
    expect(result?.errorCode).toBe("NOT_READY");
    const [sql, params] = mocks.query.mock.calls[0];
    expect(sql).toContain("j.BusinessID = @businessId AND j.ConversationID = @conversationId");
    expect(sql).toContain("j.AiReplyJobID = @jobId");
    expect(params).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "businessId", value: businessId }),
      expect.objectContaining({ name: "conversationId", value: conversationId }),
      expect.objectContaining({ name: "jobId", value: jobId }),
    ]));
    expect(result).not.toHaveProperty("generatedReplyText");
  });

  it("rejects a conversation from another tenant", async () => {
    mocks.getConversationForBusiness.mockResolvedValueOnce(null);
    await expect(getInboxAiJobStatus({ businessId, conversationId, jobId })).rejects.toThrow();
    expect(mocks.query).not.toHaveBeenCalled();
  });
});
