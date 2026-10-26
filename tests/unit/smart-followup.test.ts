import { beforeEach, describe, expect, it, vi } from "vitest";
import { explicitlyConfirmedResolved, followUpPhaseLabel } from "@/modules/escalations/followup-policy";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  execute: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  query: vi.fn(),
  sql: {
    UniqueIdentifier: "uuid", DateTime2: "datetime", Int: "int",
    NVarChar: (size: number) => "nvarchar:" + size,
  },
}));

import { recordCustomerFollowUpReply, recordHumanFollowUpReply } from "@/modules/escalations/followup-service";
import type { TransactionClient } from "@/lib/db";

const businessId = "11111111-1111-1111-1111-111111111111";
const conversationId = "22222222-2222-2222-2222-222222222222";
const messageId = "33333333-3333-3333-3333-333333333333";
const row = { EscalationID: "44444444-4444-4444-4444-444444444444", ConversationID: conversationId };
const trx = { query: mocks.query, execute: mocks.execute } as unknown as TransactionClient;

describe("Smart Follow-up deterministic resolution policy", () => {
  it.each(["المشكلة اتحلت خلاص شكرا", "تم حل المشكلة", "خلاص اتحلت المشكلة", "my issue is resolved", "it's fixed now"])(
    "accepts explicit completion: %s", text => expect(explicitlyConfirmedResolved(text)).toBe(true),
  );
  it.each([
    "تمام شكرا", "شكرا يا باشا", "هراجع وأرد عليك", "مش اتحلت المشكلة",
    "المشكلة لسه موجودة", "المشكلة ما اتحلتش", "not resolved",
    "it is not fixed", "محتاج المدير", "",
  ])("never assumes success from %s", text => {
    expect(explicitlyConfirmedResolved(text)).toBe(false);
  });
  it("keeps the follow-up phase copy compact", () => {
    expect(followUpPhaseLabel("NEEDS_ATTENTION")).toContain("تحتاج");
    expect(followUpPhaseLabel("IN_PROGRESS")).toContain("جاري");
  });
});

describe("Smart Follow-up guarded event transitions", () => {
  beforeEach(() => {
    mocks.query.mockReset();
    mocks.execute.mockReset();
    mocks.execute.mockResolvedValue({ rowsAffected: [1] });
  });
  it("human reply acknowledges and stops further apologies, but NEVER resolves", async () => {
    mocks.query.mockResolvedValue({ recordset: [row] });
    expect(await recordHumanFollowUpReply({
      businessId, conversationId, providerMessageId: "wa-123",
      repliedAtUtc: new Date("2026-10-26T00:30:00Z"),
    }, trx)).toBe(true);
    const [statement] = mocks.query.mock.calls[0] as [string];
    expect(statement).toContain("FollowUpPhase = N'IN_PROGRESS'");
    expect(statement).toContain("CustomerHoldNextAtUtc = NULL");
    expect(statement).toContain("LastHumanReplyAtUtc = @at");
    expect(statement).not.toContain("ResolvedAtUtc =");
    expect(mocks.execute.mock.calls[0][0]).toContain("TblFollowUpEvent");
  });
  it("ordinary thanks leaves case open after human reply", async () => {
    mocks.query.mockResolvedValue({ recordset: [row] });
    expect(await recordCustomerFollowUpReply({
      businessId, conversationId, messageId, text: "تمام شكرا",
      receivedAtUtc: new Date("2026-10-26T01:00:00Z"),
    }, trx)).toBe("NEEDS_ATTENTION");
    const [statement] = mocks.query.mock.calls[0] as [string];
    expect(statement).not.toContain("ResolvedAtUtc = @at");
    expect(statement).toContain("e.LastHumanReplyAtUtc IS NOT NULL");
  });
  it("explicit confirmation closes only when later than an existing human response", async () => {
    mocks.query.mockResolvedValueOnce({ recordset: [row] });
    expect(await recordCustomerFollowUpReply({
      businessId, conversationId, messageId, text: "المشكلة اتحلت خلاص",
      receivedAtUtc: new Date("2026-10-26T01:00:00Z"),
    }, trx)).toBe("RESOLVED");
    const statement = mocks.query.mock.calls[0][0] as string;
    expect(statement).toContain("@at > e.LastHumanReplyAtUtc");
    expect(statement).toContain("ResolutionSource = N'CUSTOMER_EXPLICIT'");
    expect(statement).toContain("ResolutionEvidenceMessageID = @messageId");
    expect(mocks.execute.mock.calls[0][0]).toContain("CUSTOMER_CONFIRMED_RESOLVED");
    expect(mocks.execute.mock.calls[1][0]).toContain("PauseReason=N'ESCALATION'");
  });
  it("late or duplicate inbound does not falsely close or emit another audit event", async () => {
    mocks.query.mockResolvedValue({ recordset: [] });
    expect(await recordCustomerFollowUpReply({
      businessId, conversationId, messageId, text: "تم حل المشكلة",
      receivedAtUtc: new Date("2026-10-26T01:00:00Z"),
    }, trx)).toBe("UNCHANGED");
    expect(mocks.execute).not.toHaveBeenCalled();
  });
});
