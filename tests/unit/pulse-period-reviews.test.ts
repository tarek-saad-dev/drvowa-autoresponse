import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/lib/db", () => ({
  query: db.query,
  sql: { UniqueIdentifier: "uuid", DateTime2: "datetime", Int: "int" },
}));

import { getPulseSnapshot } from "@/modules/pulse/report";
import type { PulsePeriod } from "@/modules/pulse/time";

type Param = { name: string; value: unknown };
const businessId = "11111111-1111-4111-8111-111111111111";

function bindParams(params: Param[]) {
  const start = params.find(p => p.name === "start")?.value as Date;
  const end = params.find(p => p.name === "end")?.value as Date;
  return { start, end };
}

const sampleFollowups = [
  { ConversationID: "follow-today", Name: "Today", Reason: "محتاج رد", At: new Date("2026-11-06T08:00:00Z") },
  { ConversationID: "follow-yesterday", Name: "Yesterday", Reason: "متابعة", At: new Date("2026-11-05T09:00:00Z") },
  // Created before November, but the customer reopened the request today.
  { ConversationID: "follow-reopened", Name: "Reopened", Reason: "لسه مستني", At: new Date("2026-11-06T10:00:00Z") },
];
const sampleSignals = [
  { ConversationID: "signal-today", Name: "Today", Intent: "COMPLAINT", Priority: "URGENT", ActionType: "REVIEW", Evidence: "محتاج رد", At: new Date("2026-11-06T09:00:00Z") },
  { ConversationID: "signal-yesterday", Name: "Yesterday", Intent: "COMPLAINT", Priority: "NORMAL", ActionType: "REVIEW", Evidence: "في مشكلة", At: new Date("2026-11-05T09:00:00Z") },
  { ConversationID: "signal-last-month", Name: "Old", Intent: "COMPLAINT", Priority: "NORMAL", ActionType: "REVIEW", Evidence: "طلب قديم", At: new Date("2026-10-25T09:00:00Z") },
];

function inPeriod<T extends { At: Date }>(rows: T[], params: Param[]): T[] {
  const { start, end } = bindParams(params);
  return rows.filter(row => row.At >= start && row.At < end);
}

function mockPulseQuery() {
  db.query.mockImplementation(async (statement: string, params: Param[]) => {
    if (statement.includes("COUNT(DISTINCT m.ConversationID) AS Conversations")) {
      return { recordset: [{ Conversations: 0, Messages: 0, Eligible: 0 }] };
    }
    if (statement.includes("COUNT(DISTINCT m.ConversationID) AS Total")) {
      return { recordset: [{ Total: 0 }] };
    }
    if (statement.includes("FROM dbo.TblPulseMessageScan")) {
      return { recordset: [{ Total: 0 }] };
    }
    if (statement.includes("SELECT Intent,COUNT(DISTINCT ConversationID)")) {
      return { recordset: [] };
    }
    if (statement.includes("SELECT TOP (@reviewLimit) e.ConversationID")) {
      return { recordset: inPeriod(sampleFollowups, params) };
    }
    if (statement.includes("SELECT TOP (@reviewLimit) p.ConversationID")) {
      return { recordset: inPeriod(sampleSignals, params) };
    }
    if (statement.includes("COALESCE(SUM(CASE WHEN e.FollowUpPhase")) {
      const count = inPeriod(sampleFollowups, params).length;
      return { recordset: [{ Total: count, NeedsAttention: count, Handling: 0 }] };
    }
    if (statement.includes("SELECT COUNT(1) AS Total FROM (SELECT p.ConversationID,p.Intent")) {
      return { recordset: [{ Total: statement.includes("NEEDS_REPLY") ? inPeriod(sampleSignals, params).length : 0 }] };
    }
    throw new Error("Unrecognized Pulse SQL query: " + statement.slice(0, 90));
  });
}

describe("Pulse review center follows the selected overview period", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-06T12:00:00.000Z"));
    db.query.mockReset();
    mockPulseQuery();
  });
  afterEach(() => vi.useRealTimers());

  it.each([
    ["today", "2026-11-05T22:00:00.000Z", "2026-11-06T22:00:00.000Z",
      ["follow-today", "follow-reopened", "signal-today"]],
    ["yesterday", "2026-11-04T22:00:00.000Z", "2026-11-05T22:00:00.000Z",
      ["follow-yesterday", "signal-yesterday"]],
    ["month", "2026-10-31T22:00:00.000Z", "2026-11-30T22:00:00.000Z",
      ["follow-today", "follow-yesterday", "follow-reopened", "signal-today", "signal-yesterday"]],
  ] as const)("period=%s scopes reviews, counts and time bounds", async (period, start, end, ids) => {
    const snapshot = await getPulseSnapshot({
      businessId, timezone: "Africa/Cairo", period: period as PulsePeriod, maxReviews: 100,
    });
    expect(snapshot.period).toBe(period);
    expect(snapshot.start).toBe(start);
    expect(snapshot.end).toBe(end);
    expect(snapshot.reviews.map(row => row.conversationId).sort()).toEqual([...ids].sort());
    expect(snapshot.pendingSignals + snapshot.needsAttentionFollowups).toBe(ids.length);

    const calls = db.query.mock.calls as [string, Param[]][];
    expect(calls).toHaveLength(9);
    for (const [statement, params] of calls) {
      expect(params.find(param => param.name === "start")?.value).toEqual(new Date(start));
      expect(params.find(param => param.name === "end")?.value).toEqual(new Date(end));
      expect(statement).not.toContain("DATEADD(day,-60");
    }
    const reviewStatements = calls.map(([statement]) => statement).filter(text =>
      text.includes("TblHumanEscalation") || text.includes("TblPulseSignal"));
    for (const statement of reviewStatements) {
      expect(statement).toContain(">=@start");
      expect(statement).toContain("<@end");
    }
  });

  it("keeps signal list and signal count consistent when a human escalation owns the chat", async () => {
    await getPulseSnapshot({ businessId, period: "month", timezone: "Africa/Cairo" });
    const statements = (db.query.mock.calls as [string, Param[]][]).map(([statement]) => statement);
    const list = statements.find(text => text.includes("SELECT TOP (@reviewLimit) p.ConversationID"))!;
    const count = statements.find(text => text.includes("ActionState=N'NEEDS_REPLY'") && text.includes("COUNT(1) AS Total"))!;
    expect(list).toContain("NOT EXISTS");
    expect(count).toContain("NOT EXISTS");
    expect(list).toContain("e.ResolvedAtUtc IS NULL");
    expect(count).toContain("e.ResolvedAtUtc IS NULL");
    // Re-activated customer requests use their newer actionable date.
    expect(list).toContain("COALESCE(p.LastCustomerFollowupAtUtc,p.MessageAtUtc)");
    expect(count).toContain("COALESCE(p.LastCustomerFollowupAtUtc,p.MessageAtUtc)");
    const followups = statements.find(text => text.includes("SELECT TOP (@reviewLimit) e.ConversationID"))!;
    expect(followups).toContain("COALESCE(e.LastCustomerReplyAtUtc,e.CreatedAtUtc)");
  });
});
