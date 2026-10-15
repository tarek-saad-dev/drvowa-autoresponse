import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  query: vi.fn(),
  sql: { UniqueIdentifier: "uuid", DateTime2: "datetime" },
}));

import { query } from "@/lib/db";
import { resumeDueHumanConversations } from "@/modules/ai/bulk-resume-service";

const q = vi.mocked(query);

describe("reliability 30-minute handback", () => {
  beforeEach(() => q.mockReset());

  it("resumes only after 30 minutes since last real human reply, never midnight or handoff", async () => {
    q.mockResolvedValue({ rowsAffected: [4] } as never);
    const at = new Date("2026-10-15T10:59:00Z");
    expect(await resumeDueHumanConversations(at)).toBe(4);
    const [statement, inputs] = q.mock.calls[0];
    expect(statement).toContain("s.PauseReason = N'HUMAN_TAKEOVER'");
    expect(statement).toContain("s.LastHumanReplyAtUtc IS NOT NULL");
    expect(statement).toContain("DATEADD(minute, -30, @now)");
    expect(statement).toContain("e.ResolvedAtUtc IS NULL");
    expect(statement).toContain("s.Mode = N'HUMAN_PAUSED'");
    expect(statement).not.toContain("END_OF_DAY");
    expect(statement).not.toContain("TblAiReplyJob");
    expect(inputs).toEqual([{ name: "now", type: "datetime", value: at }]);
  });

  it("is idempotent on repeated sweeps", async () => {
    q.mockResolvedValue({ rowsAffected: [0] } as never);
    expect(await resumeDueHumanConversations()).toBe(0);
  });
});
