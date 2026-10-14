import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  query: vi.fn(),
  sql: { UniqueIdentifier: "UUID", DateTime2: "DateTime2" },
}));

import { query } from "@/lib/db";
import {
  resumeAllHumanConversations,
  resumePreviousDayConversations,
  startOfBusinessDayUtc,
} from "@/modules/ai/bulk-resume-service";

const mockedQuery = vi.mocked(query);
const businessId = "11111111-1111-4111-8111-111111111111";

describe("tenant-local end-of-day handback", () => {
  beforeEach(() => mockedQuery.mockReset());

  it("finds Cairo midnight (including the day in UTC before the local date)", () => {
    expect(startOfBusinessDayUtc(
      new Date("2026-10-14T05:00:00Z"), "Africa/Cairo",
    ).toISOString()).toBe("2026-10-13T21:00:00.000Z");
  });

  it("calculates business local midnight through DST changes", () => {
    expect(startOfBusinessDayUtc(
      new Date("2026-03-08T16:00:00Z"), "America/New_York",
    ).toISOString()).toBe("2026-03-08T05:00:00.000Z");
    expect(startOfBusinessDayUtc(
      new Date("2026-03-09T16:00:00Z"), "America/New_York",
    ).toISOString()).toBe("2026-03-09T04:00:00.000Z");
  });

  it("falls back to UTC for an invalid timezone", () => {
    expect(startOfBusinessDayUtc(
      new Date("2026-10-14T05:00:00Z"), "Not/AZone",
    ).toISOString()).toBe("2026-10-14T00:00:00.000Z");
  });

  it("resumes only human-paused rows for one tenant without reopening safety or unresolved escalations", async () => {
    mockedQuery.mockResolvedValue({ rowsAffected: [3], recordset: [] } as never);
    const count = await resumeAllHumanConversations({ businessId });
    expect(count).toBe(3);
    const [statement, inputs] = mockedQuery.mock.calls[0];
    expect(statement).toContain("s.BusinessID = @businessId");
    expect(statement).toContain("s.Mode = N'HUMAN_PAUSED'");
    expect(statement).toContain("e.ResolvedAtUtc IS NULL");
    expect(statement).toContain("e.Status IN (N'OPEN', N'ACKNOWLEDGED')");
    expect(statement).toContain("ResumedAtUtc = SYSUTCDATETIME()");
    expect(statement).not.toContain("TblAiReplyJob");
    expect(inputs).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "businessId", value: businessId }),
      expect.objectContaining({ name: "beforeUtc", value: null }),
    ]));
  });

  it("scopes each daily update to paused conversations from BEFORE the new local day", async () => {
    mockedQuery
      .mockResolvedValueOnce({ recordset: [
        { BusinessID: businessId, Timezone: "Africa/Cairo" },
      ] } as never)
      .mockResolvedValueOnce({ rowsAffected: [2] } as never);
    const summary = await resumePreviousDayConversations(
      new Date("2026-10-14T05:00:00Z"),
    );
    expect(summary).toEqual({ businesses: 1, resumed: 2 });
    expect(mockedQuery).toHaveBeenCalledTimes(2);
    const [, inputs] = mockedQuery.mock.calls[1];
    expect(inputs).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "businessId", value: businessId }),
      expect.objectContaining({
        name: "beforeUtc", value: new Date("2026-10-13T21:00:00Z"),
      }),
    ]));
  });

  it("does nothing on a retry once everything is already AUTO", async () => {
    mockedQuery.mockResolvedValueOnce({ recordset: [] } as never);
    expect(await resumePreviousDayConversations()).toEqual({ businesses: 0, resumed: 0 });
    expect(mockedQuery).toHaveBeenCalledTimes(1);
  });
});
