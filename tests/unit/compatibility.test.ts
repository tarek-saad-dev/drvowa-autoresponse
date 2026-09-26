import { describe, expect, it } from "vitest";

import {
  DEGRADED_MIN_DISTINCT_IDS,
  DEGRADED_MIN_FAILURES,
  EPISODE_MAX_AGE_MS,
  adminCompatibilityLabel,
  classifyCompatibility,
  customerCompatibilityMessageAr,
  recommendRuntimeEngine,
} from "@/modules/channels/compatibility";

const NOW = Date.parse("2026-09-26T00:00:00.000Z");

describe("compatibility classifier episode semantics", () => {
  it("CASE A: 0 evidence → UNKNOWN", () => {
    expect(
      classifyCompatibility({
        plaintextInboundCount: 0,
        decryptFailureCount: 0,
        socketReady: true,
        nowMs: NOW,
      }).status,
    ).toBe("UNKNOWN");
  });

  it("CASE B: 1 plaintext → HEALTHY", () => {
    expect(
      classifyCompatibility({
        plaintextInboundCount: 1,
        decryptFailureCount: 0,
        activeFailureStreak: 0,
        socketReady: true,
        nowMs: NOW,
        lastPlaintextInboundAt: new Date(NOW).toISOString(),
      }).status,
    ).toBe("HEALTHY");
  });

  it("CASE C: 1 decrypt failure → SUSPECT", () => {
    expect(
      classifyCompatibility({
        plaintextInboundCount: 0,
        decryptFailureCount: 1,
        activeFailureStreak: 1,
        activeFailureDistinctIds: 1,
        failureEpisodeStartedAt: new Date(NOW - 60_000).toISOString(),
        lastDecryptFailureAt: new Date(NOW - 60_000).toISOString(),
        socketReady: true,
        nowMs: NOW,
      }).status,
    ).toBe("SUSPECT");
  });

  it("CASE D: recent active episode → DEGRADED + recommend V7", () => {
    expect(DEGRADED_MIN_FAILURES).toBe(3);
    expect(DEGRADED_MIN_DISTINCT_IDS).toBe(2);
    const r = classifyCompatibility({
      plaintextInboundCount: 0,
      decryptFailureCount: 3,
      activeFailureStreak: 3,
      activeFailureDistinctIds: 2,
      failureEpisodeStartedAt: new Date(NOW - 120_000).toISOString(),
      lastDecryptFailureAt: new Date(NOW - 30_000).toISOString(),
      socketReady: true,
      nowMs: NOW,
    });
    expect(r.status).toBe("DEGRADED_CRYPTO");
    expect(
      recommendRuntimeEngine({
        compatibilityStatus: r.status,
        runtimeEngine: "BAILEYS_V6",
      }),
    ).toBe("BAILEYS_V7");
  });

  it("CASE E: historical failures then plaintext → HEALTHY", () => {
    expect(
      classifyCompatibility({
        plaintextInboundCount: 5,
        decryptFailureCount: 3,
        activeFailureStreak: 0,
        lastDecryptFailureAt: new Date(NOW - 600_000).toISOString(),
        lastPlaintextInboundAt: new Date(NOW - 10_000).toISOString(),
        socketReady: true,
        nowMs: NOW,
      }).status,
    ).toBe("HEALTHY");
  });

  it("CASE F: many plaintext + transient failure + recovery → HEALTHY", () => {
    expect(
      classifyCompatibility({
        plaintextInboundCount: 101,
        decryptFailureCount: 1,
        activeFailureStreak: 0,
        lastDecryptFailureAt: new Date(NOW - 50_000).toISOString(),
        lastPlaintextInboundAt: new Date(NOW - 5_000).toISOString(),
        socketReady: true,
        nowMs: NOW,
      }).status,
    ).toBe("HEALTHY");
  });

  it("CASE G: stale episode → NOT DEGRADED", () => {
    expect(EPISODE_MAX_AGE_MS).toBeGreaterThan(0);
    expect(
      classifyCompatibility({
        plaintextInboundCount: 0,
        decryptFailureCount: 10,
        activeFailureStreak: 5,
        activeFailureDistinctIds: 4,
        failureEpisodeStartedAt: new Date(
          NOW - EPISODE_MAX_AGE_MS - 60_000,
        ).toISOString(),
        lastDecryptFailureAt: new Date(
          NOW - EPISODE_MAX_AGE_MS - 30_000,
        ).toISOString(),
        socketReady: true,
        nowMs: NOW,
      }).status,
    ).not.toBe("DEGRADED_CRYPTO");
  });

  it("CASE H: not READY → never DEGRADED", () => {
    expect(
      classifyCompatibility({
        plaintextInboundCount: 0,
        decryptFailureCount: 5,
        activeFailureStreak: 5,
        activeFailureDistinctIds: 3,
        failureEpisodeStartedAt: new Date(NOW - 60_000).toISOString(),
        lastDecryptFailureAt: new Date(NOW - 10_000).toISOString(),
        socketReady: false,
        nowMs: NOW,
      }).status,
    ).toBe("SUSPECT");
  });

  it("lifetime failures alone never degrade when plaintext exists", () => {
    expect(
      classifyCompatibility({
        plaintextInboundCount: 50,
        decryptFailureCount: 99,
        socketReady: true,
        nowMs: NOW,
        lastPlaintextInboundAt: new Date(NOW).toISOString(),
      }).status,
    ).toBe("HEALTHY");
  });

  it("customer messages hide Baileys jargon", () => {
    expect(customerCompatibilityMessageAr("HEALTHY", true)).toBeNull();
    expect(customerCompatibilityMessageAr("UNKNOWN", true)).toContain("متصل");
    const d = customerCompatibilityMessageAr("DEGRADED_CRYPTO", true)!;
    expect(d.toLowerCase()).not.toContain("baileys");
    expect(d.toLowerCase()).not.toContain("decrypt");
    expect(adminCompatibilityLabel("DEGRADED_CRYPTO")).toBe(
      "Crypto incompatible",
    );
  });
});
