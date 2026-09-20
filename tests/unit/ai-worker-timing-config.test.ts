import { describe, expect, it } from "vitest";

import {
  AI_JOB_LEASE_SECONDS_DEFAULT,
  AI_WORKER_HEARTBEAT_MS_DEFAULT,
  HEARTBEAT_LEASE_RATIO,
  resolveWorkerTimingConfig,
} from "@/modules/ai/lease";

describe("AI worker timing config cross-validation", () => {
  it("defaults remain lease=90s heartbeat=25s", () => {
    const cfg = resolveWorkerTimingConfig({
      leaseSecondsEnv: String(AI_JOB_LEASE_SECONDS_DEFAULT),
      heartbeatMsEnv: String(AI_WORKER_HEARTBEAT_MS_DEFAULT),
    });
    expect(cfg.leaseSeconds).toBe(90);
    expect(cfg.heartbeatMs).toBe(25_000);
    expect(cfg.clamped).toBe(false);
    expect(cfg.heartbeatMs).toBeLessThanOrEqual(
      Math.floor(cfg.leaseSeconds * 1000 * HEARTBEAT_LEASE_RATIO),
    );
  });

  it("lease 30 / heartbeat 60 clamps heartbeat below lease/2", () => {
    const cfg = resolveWorkerTimingConfig({
      leaseSecondsEnv: "30",
      heartbeatMsEnv: "60000",
    });
    expect(cfg.leaseSeconds).toBe(30);
    expect(cfg.clamped).toBe(true);
    expect(cfg.heartbeatMs).toBeLessThan(cfg.leaseSeconds * 1000);
    expect(cfg.heartbeatMs).toBeLessThanOrEqual(
      Math.floor(cfg.leaseSeconds * 1000 * HEARTBEAT_LEASE_RATIO),
    );
    expect(cfg.heartbeatMs).toBe(15_000);
  });

  it("lease 30 / heartbeat 25 is clamped by lease/2 invariant", () => {
    const cfg = resolveWorkerTimingConfig({
      leaseSecondsEnv: "30",
      heartbeatMsEnv: "25000",
    });
    expect(cfg.leaseSeconds).toBe(30);
    // 25s > 15s max → clamp
    expect(cfg.clamped).toBe(true);
    expect(cfg.heartbeatMs).toBe(15_000);
  });

  it("invalid/non-numeric env falls back to defaults", () => {
    const cfg = resolveWorkerTimingConfig({
      leaseSecondsEnv: "nope",
      heartbeatMsEnv: "also-bad",
    });
    expect(cfg.leaseSeconds).toBe(AI_JOB_LEASE_SECONDS_DEFAULT);
    expect(cfg.heartbeatMs).toBe(AI_WORKER_HEARTBEAT_MS_DEFAULT);
    expect(cfg.heartbeatMs).toBeLessThan(cfg.leaseSeconds * 1000);
  });

  it("never allows heartbeat >= lease duration", () => {
    const cfg = resolveWorkerTimingConfig({
      leaseSecondsEnv: "30",
      heartbeatMsEnv: "30000",
    });
    expect(cfg.heartbeatMs).toBeLessThan(cfg.leaseSeconds * 1000);
  });
});
