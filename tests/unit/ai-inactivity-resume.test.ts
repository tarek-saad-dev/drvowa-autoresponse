import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  query: vi.fn(),
  sql: { UniqueIdentifier: "uuid", DateTime2: "datetime", Int: "int" },
}));

import { query } from "@/lib/db";
import { resumeDueHumanConversations } from "@/modules/ai/bulk-resume-service";
import { HUMAN_OWNERSHIP_QUIET_MINUTES } from "@/modules/ai/human-ownership-policy";

const q = vi.mocked(query);

describe("Smart Ownership 90-minute quiet handback", () => {
  beforeEach(() => q.mockReset());

  it("only returns to AI when a human replied, the conversation is quiet, and NO customer is waiting", async () => {
    q.mockResolvedValue({ rowsAffected: [4] } as never);
    const now = new Date("2026-10-26T11:00:00Z");
    expect(await resumeDueHumanConversations(now)).toBe(4);
    const [statement, inputs] = q.mock.calls[0];
    expect(statement).toContain("s.Mode=N'HUMAN_PAUSED'");
    expect(statement).toContain("s.PauseReason=N'HUMAN_TAKEOVER'");
    expect(statement).toContain("s.LastHumanReplyAtUtc IS NOT NULL");
    expect(statement).toContain("s.LastHumanReplyAtUtc<=DATEADD(minute,-@quietMinutes,@now)");
    expect(statement).toContain("c.LastInboundAtUtc<=s.LastHumanReplyAtUtc");
    expect(statement).toContain("c.LastMessageAtUtc<=DATEADD(minute,-@quietMinutes,@now)");
    expect(statement).toContain("c WITH (UPDLOCK,HOLDLOCK)");
    expect(statement).toContain("p.ActionState=N'NEEDS_REPLY'");
    expect(statement).toContain("e.ResolvedAtUtc IS NULL");
    expect(statement).toContain("INTO dbo.TblReliabilityHandoffReturn");
    expect(statement).not.toContain("TblAiReplyJob");
    expect(inputs).toEqual([
      { name: "now", type: "datetime", value: now },
      { name: "quietMinutes", type: "int", value: HUMAN_OWNERSHIP_QUIET_MINUTES },
    ]);
  });

  it("is safe to repeat without a second handoff", async () => {
    q.mockResolvedValue({ rowsAffected: [0] } as never);
    expect(await resumeDueHumanConversations()).toBe(0);
  });
});
