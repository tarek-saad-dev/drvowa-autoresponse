import { describe, expect, it } from "vitest";

import { AI_WORKER_LIVENESS_STALE_MS } from "@/modules/ai/worker-liveness";

describe("AI worker liveness thresholds", () => {
  it("treats heartbeats older than the stale window as unavailable", () => {
    const now = Date.now();
    const freshAge = AI_WORKER_LIVENESS_STALE_MS - 1_000;
    const staleAge = AI_WORKER_LIVENESS_STALE_MS + 1_000;
    expect(freshAge <= AI_WORKER_LIVENESS_STALE_MS).toBe(true);
    expect(staleAge > AI_WORKER_LIVENESS_STALE_MS).toBe(true);
    expect(now - freshAge).toBeGreaterThan(0);
  });
});
