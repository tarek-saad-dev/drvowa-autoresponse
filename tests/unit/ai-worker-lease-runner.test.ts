'use strict';

import { describe, expect, it, vi } from "vitest";

import {
  createAiWorkerId,
  resolveHeartbeatMs,
  resolveLeaseSeconds,
} from "@/modules/ai/lease";
import { createAiWorkerRunner } from "@/modules/ai/worker-runner";
import { outboundUnknownRetryDelaySeconds } from "@/modules/ai/outbound-policy";
import type { AiReplyJob } from "@/types/domain";

describe("AI worker lease helpers", () => {
  it("workerId is <= 128 and distinct across instances", () => {
    const a = createAiWorkerId({ host: "x".repeat(500), pid: 1, uuid: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" });
    const b = createAiWorkerId({ host: "y".repeat(500), pid: 2, uuid: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb" });
    expect(a.length).toBeLessThanOrEqual(128);
    expect(b.length).toBeLessThanOrEqual(128);
    expect(a).not.toBe(b);
  });

  it("lease/heartbeat env resolve with safe clamps", () => {
    expect(resolveLeaseSeconds("10")).toBe(90);
    expect(resolveLeaseSeconds("120")).toBe(120);
    expect(resolveHeartbeatMs("100")).toBe(25_000);
    expect(resolveHeartbeatMs("30000")).toBe(30_000);
  });

  it("unknown budget uses outboundUnknownCount not claim attempts", () => {
    expect(outboundUnknownRetryDelaySeconds(1)).toBe(2);
    expect(outboundUnknownRetryDelaySeconds(2)).toBe(5);
    expect(outboundUnknownRetryDelaySeconds(3)).toBeNull();
  });
});

describe("AI worker runner drain + heartbeat", () => {
  function fakeJob(id: string): AiReplyJob {
    return {
      aiReplyJobId: id,
      businessId: "11111111-1111-1111-1111-111111111111",
      channelConnectionId: "22222222-2222-2222-2222-222222222222",
      conversationId: "33333333-3333-3333-3333-333333333333",
      contactId: "44444444-4444-4444-4444-444444444444",
      triggerMessageId: "55555555-5555-5555-5555-555555555555",
      status: "PROCESSING",
      notBeforeUtc: new Date(),
      attemptCount: 1,
      leaseUntilUtc: new Date(Date.now() + 90_000),
      leaseToken: "66666666-6666-6666-6666-666666666666",
      leaseOwner: "w",
      leaseVersion: 1,
      outboundUnknownCount: 0,
      startedAtUtc: new Date(),
      completedAtUtc: null,
      lastErrorCode: null,
      generatedReplyText: "ok",
      generatedModel: "m",
      generatedAtUtc: new Date(),
      outboundProviderMessageId: null,
      createdAtUtc: new Date(),
      updatedAtUtc: new Date(),
    };
  }

  it("shutdown stops claims but keeps heartbeat during drain until settle", async () => {
    vi.useFakeTimers();
    const extend = vi.fn().mockResolvedValue(true);
    let resolveProcess!: () => void;
    const processPromise = new Promise<void>((r) => {
      resolveProcess = r;
    });
    let claimed = 0;
    const runner = createAiWorkerRunner({
      workerId: "w-test",
      concurrency: 1,
      pollMs: 50,
      heartbeatMs: 20,
      leaseSeconds: 90,
      shutdownDeadlineMs: 5_000,
      claimNextJob: async () => {
        claimed += 1;
        if (claimed === 1) return fakeJob("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
        return null;
      },
      processJob: async () => {
        await processPromise;
        return { status: "SENT" };
      },
      extendLease: extend,
      closePool: async () => {},
      sleep: async (ms) => {
        await vi.advanceTimersByTimeAsync(ms);
      },
      now: () => Date.now(),
      logger: { info() {}, warn() {} },
    });

    const loopPromise = runner.loop();
    await vi.advanceTimersByTimeAsync(60);
    expect(claimed).toBeGreaterThanOrEqual(1);
    expect(runner.getActiveCount()).toBe(1);

    runner.requestShutdown();
    await vi.advanceTimersByTimeAsync(80);
    // Heartbeat should still fire during drain
    expect(extend.mock.calls.length).toBeGreaterThan(0);
    const callsDuringDrain = extend.mock.calls.length;

    // No further claims after shutdown
    const claimedAtShutdown = claimed;
    await vi.advanceTimersByTimeAsync(200);
    expect(claimed).toBe(claimedAtShutdown);

    resolveProcess();
    await vi.advanceTimersByTimeAsync(50);
    const result = await loopPromise;
    expect(result.reason).toBe("clean");
    expect(runner.getActiveCount()).toBe(0);

    const afterSettle = extend.mock.calls.length;
    await vi.advanceTimersByTimeAsync(200);
    // Heartbeat stopped after settle
    expect(extend.mock.calls.length).toBe(afterSettle);
    expect(callsDuringDrain).toBeGreaterThan(0);

    vi.useRealTimers();
  });

  it("idle shutdown is clean and idempotent", async () => {
    const runner = createAiWorkerRunner({
      claimNextJob: async () => null,
      processJob: async () => ({ status: "SKIPPED" }),
      closePool: async () => {},
      pollMs: 10,
      sleep: async () => {},
      logger: { info() {}, warn() {} },
    });
    runner.requestShutdown();
    runner.requestShutdown();
    const result = await runner.loop();
    expect(result.reason).toBe("clean");
  });
});
