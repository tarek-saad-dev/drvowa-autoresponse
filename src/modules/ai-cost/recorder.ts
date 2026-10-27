import { randomUUID } from "node:crypto";
import { query, sql } from "@/lib/db";

/**
 * Estimates STANDARD-tier text Gemini cost using the published USD/M-token rate
 * snapshot from 2026-10-28. This is not Google's invoice, and excludes tax,
 * grounding, non-standard routing, cache storage, credits, and other providers.
 * Missing token metadata or an unknown model must never be represented as $0.
 */
const PRICE_SNAPSHOT = {
  "gemini-3.5-flash-lite": { input: 0.30, output: 2.50, cached: 0.03 },
} as const;
const PRICE_VERSION = "2026-10-28-standard";

export type GeminiUsageMetadata = {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  thoughtsTokenCount?: number;
  cachedContentTokenCount?: number;
  totalTokenCount?: number;
};

export type MeteredResponse = { usageMetadata?: GeminiUsageMetadata | null };
export type AiCostPurpose =
  | "WHATSAPP_REPLY"
  | "ONBOARDING_PREVIEW"
  | "ONBOARDING_DISCOVERY"
  | "KNOWLEDGE_EXTRACT"
  | "KNOWLEDGE_DEDUP"
  | "PULSE_SHADOW"
  | "VOICE_TRANSCRIBE";

const count = (value: unknown): number | null =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;

export function estimateGeminiUsage(model: string, metadata?: GeminiUsageMetadata | null) {
  const promptTokens = count(metadata?.promptTokenCount);
  const outputTokens = count(metadata?.candidatesTokenCount);
  const thinkingTokens = count(metadata?.thoughtsTokenCount);
  const cachedInputTokens = count(metadata?.cachedContentTokenCount);
  const totalTokens = count(metadata?.totalTokenCount);
  const rates = PRICE_SNAPSHOT[model as keyof typeof PRICE_SNAPSHOT];
  const complete = promptTokens !== null && outputTokens !== null;
  const cached = Math.min(promptTokens ?? 0, cachedInputTokens ?? 0);
  const usd = complete && rates
    ? (((promptTokens! - cached) * rates.input)
      + (cached * rates.cached)
      + ((outputTokens! + (thinkingTokens ?? 0)) * rates.output)) / 1_000_000
    : null;
  return {
    promptTokens, outputTokens, thinkingTokens, cachedInputTokens, totalTokens,
    costEstimateUsd: usd === null ? null : Number(usd.toFixed(9)),
    priceVersion: usd === null ? null : PRICE_VERSION,
  };
}

/** Numeric provider status only; never persist an exception's raw message. */
export function providerHttpStatus(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const object = error as { status?: unknown; statusCode?: unknown; code?: unknown };
  for (const value of [object.status, object.statusCode, object.code]) {
    const numeric = typeof value === "number" ? value
      : typeof value === "string" && /^\d{3}$/.test(value) ? Number(value) : NaN;
    if (Number.isInteger(numeric) && numeric >= 400 && numeric <= 599) return numeric;
  }
  return null;
}

/** Best effort: telemetry must never block answering or delivering a message. */
export async function recordAiProviderCall(input: {
  provider?: "GEMINI" | "VOICE_STT";
  purpose: AiCostPurpose;
  model: string;
  businessId?: string | null;
  startedAtMs: number;
  response?: MeteredResponse | null;
  error?: unknown;
  httpStatus?: number | null;
}): Promise<void> {
  if (process.env.AI_COST_TRACKING_ENABLED === "false") return;
  const usage = input.provider === "VOICE_STT"
    ? estimateGeminiUsage("", null)
    : estimateGeminiUsage(input.model, input.response?.usageMetadata);
  const status = input.error === undefined && !input.httpStatus ? "SUCCESS" : "PROVIDER_ERROR";
  const latencyMs = Math.max(0, Math.min(2147483647, Date.now() - input.startedAtMs));
  try {
    await query(`
      INSERT INTO dbo.TblAiProviderUsage
        (UsageID,BusinessID,Provider,Purpose,Model,Status,ProviderHttpStatus,
         PromptTokens,OutputTokens,ThinkingTokens,CachedInputTokens,TotalTokens,
         CostEstimateUsd,PriceVersion,LatencyMs,StartedAtUtc)
      VALUES (@id,@business,@provider,@purpose,@model,@status,@http,
              @prompt,@output,@thinking,@cached,@total,@cost,@price,@latency,@started)
    `, [
      { name: "id", type: sql.UniqueIdentifier, value: randomUUID() },
      { name: "business", type: sql.UniqueIdentifier, value: input.businessId || null },
      { name: "provider", type: sql.NVarChar(32), value: input.provider ?? "GEMINI" },
      { name: "purpose", type: sql.NVarChar(40), value: input.purpose },
      { name: "model", type: sql.NVarChar(100), value: input.model.slice(0, 100) },
      { name: "status", type: sql.NVarChar(24), value: status },
      { name: "http", type: sql.Int, value: input.httpStatus ?? providerHttpStatus(input.error) },
      { name: "prompt", type: sql.Int, value: usage.promptTokens },
      { name: "output", type: sql.Int, value: usage.outputTokens },
      { name: "thinking", type: sql.Int, value: usage.thinkingTokens },
      { name: "cached", type: sql.Int, value: usage.cachedInputTokens },
      { name: "total", type: sql.Int, value: usage.totalTokens },
      { name: "cost", type: sql.Decimal(19, 9), value: usage.costEstimateUsd },
      { name: "price", type: sql.NVarChar(40), value: usage.priceVersion },
      { name: "latency", type: sql.Int, value: latencyMs },
      { name: "started", type: sql.DateTime2, value: new Date(input.startedAtMs) },
    ]);
  } catch {
    // Non-fatal during migration rollout, DB maintenance or telemetry outage.
    console.warn("[ai-cost] metering_write_failed", {
      provider: input.provider ?? "GEMINI",
      purpose: input.purpose,
    });
  }
}
