import { describe, expect, it } from "vitest";

import { shouldAutoResumeHumanTakeover } from "@/modules/ai/safety-policy";

describe("human takeover resume policy", () => {
  const paused = new Date("2026-10-08T10:00:00.000Z");

  it("resumes after the configured timeout", () => {
    expect(
      shouldAutoResumeHumanTakeover({
        policy: "AFTER_30_MIN",
        pausedAtUtc: paused,
        messageReceivedAtUtc: new Date("2026-10-08T10:29:59.000Z"),
        businessTimezone: "Africa/Cairo",
      }),
    ).toBe(false);

    expect(
      shouldAutoResumeHumanTakeover({
        policy: "AFTER_30_MIN",
        pausedAtUtc: paused,
        messageReceivedAtUtc: new Date("2026-10-08T10:30:00.000Z"),
        businessTimezone: "Africa/Cairo",
      }),
    ).toBe(true);
  });

  it("keeps manual takeover paused forever until explicit resume", () => {
    expect(
      shouldAutoResumeHumanTakeover({
        policy: "MANUAL",
        pausedAtUtc: paused,
        messageReceivedAtUtc: new Date("2026-10-20T10:00:00.000Z"),
        businessTimezone: "Africa/Cairo",
      }),
    ).toBe(false);
  });

  it("resumes on the first inbound from a new local business day", () => {
    const cairoPaused = new Date("2026-10-08T20:30:00.000Z"); // 23:30 Cairo
    expect(
      shouldAutoResumeHumanTakeover({
        policy: "END_OF_DAY",
        pausedAtUtc: cairoPaused,
        messageReceivedAtUtc: new Date("2026-10-08T20:59:00.000Z"),
        businessTimezone: "Africa/Cairo",
      }),
    ).toBe(false);

    expect(
      shouldAutoResumeHumanTakeover({
        policy: "END_OF_DAY",
        pausedAtUtc: cairoPaused,
        messageReceivedAtUtc: new Date("2026-10-08T21:05:00.000Z"), // 00:05 next day Cairo
        businessTimezone: "Africa/Cairo",
      }),
    ).toBe(true);
  });

  it("defaults are not involved in explicit 4-hour evaluation", () => {
    expect(
      shouldAutoResumeHumanTakeover({
        policy: "AFTER_240_MIN",
        pausedAtUtc: paused,
        messageReceivedAtUtc: new Date("2026-10-08T13:59:59.000Z"),
        businessTimezone: "UTC",
      }),
    ).toBe(false);
    expect(
      shouldAutoResumeHumanTakeover({
        policy: "AFTER_240_MIN",
        pausedAtUtc: paused,
        messageReceivedAtUtc: new Date("2026-10-08T14:00:00.000Z"),
        businessTimezone: "UTC",
      }),
    ).toBe(true);
  });
});
