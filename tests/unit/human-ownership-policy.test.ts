import { describe, expect, it } from "vitest";
import { canReleaseHumanOwnership, HUMAN_OWNERSHIP_QUIET_MINUTES } from "@/modules/ai/human-ownership-policy";

const base = {
  lastHumanReplyAtUtc: new Date("2026-10-26T10:00:00Z"),
  lastInboundAtUtc: new Date("2026-10-26T09:59:00Z"),
  lastActivityAtUtc: new Date("2026-10-26T10:00:00Z"),
  hasOpenEscalation:false,
  hasUnansweredAction:false,
  now:new Date("2026-10-26T11:30:00Z"),
};
describe("Smart Ownership - pure policy", () => {
  it("defaults to 90 minutes of total quiet",()=>{
    expect(HUMAN_OWNERSHIP_QUIET_MINUTES).toBe(90);
    expect(canReleaseHumanOwnership(base)).toBe(true);
    expect(canReleaseHumanOwnership({...base,now:new Date("2026-10-26T11:29:59Z")})).toBe(false);
  });
  it("a new customer reply at any point prevents premature bot handback",()=>{
    expect(canReleaseHumanOwnership({...base,lastInboundAtUtc:new Date("2026-10-26T10:20:00Z"),now:new Date("2026-10-26T15:00:00Z")})).toBe(false);
  });
  it("never resumes an open human case or pending Pulse action",()=>{
    expect(canReleaseHumanOwnership({...base,hasOpenEscalation:true})).toBe(false);
    expect(canReleaseHumanOwnership({...base,hasUnansweredAction:true})).toBe(false);
  });
  it("does not infer a reply from a pause or page view",()=>{
    expect(canReleaseHumanOwnership({...base,lastHumanReplyAtUtc:null,now:new Date("2026-10-27T11:30:00Z")})).toBe(false);
  });
  it("the quiet timer resets with activity",()=>{
    expect(canReleaseHumanOwnership({...base,lastActivityAtUtc:new Date("2026-10-26T10:45:00Z")})).toBe(false);
  });
  it("the human may return after answering the outstanding message and a fresh quiet interval",()=>{
    expect(canReleaseHumanOwnership({
      ...base,
      lastHumanReplyAtUtc:new Date("2026-10-26T10:40:00Z"),
      lastInboundAtUtc:new Date("2026-10-26T10:20:00Z"),
      lastActivityAtUtc:new Date("2026-10-26T10:40:00Z"),
      now:new Date("2026-10-26T12:10:00Z"),
    })).toBe(true);
  });
});
