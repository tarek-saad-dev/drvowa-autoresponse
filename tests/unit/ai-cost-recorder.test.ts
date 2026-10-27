import { describe, expect, it } from "vitest";
import { estimateGeminiUsage, providerHttpStatus } from "@/modules/ai-cost/recorder";

describe("AI provider usage metering", () => {
  it("estimates input, cached, output and thinking tokens separately", () => {
    const usage = estimateGeminiUsage("gemini-3.5-flash-lite", {
      promptTokenCount: 2000, cachedContentTokenCount: 500,
      candidatesTokenCount: 150, thoughtsTokenCount: 50, totalTokenCount: 2200,
    });
    expect(usage.costEstimateUsd).toBe(0.000965);
    expect(usage.totalTokens).toBe(2200);
    expect(usage.priceVersion).toBe("2026-10-28-standard");
  });

  it("does not pretend missing metadata or unknown model has zero cost", () => {
    expect(estimateGeminiUsage("gemini-3.5-flash-lite").costEstimateUsd).toBeNull();
    expect(estimateGeminiUsage("other-model", {
      promptTokenCount: 100, candidatesTokenCount: 100,
    }).costEstimateUsd).toBeNull();
  });

  it("extracts status codes without retaining provider text", () => {
    expect(providerHttpStatus({ status: 402, message: "secret" })).toBe(402);
    expect(providerHttpStatus({ code: "429" })).toBe(429);
    expect(providerHttpStatus(new Error("token 123"))).toBeNull();
  });
});
