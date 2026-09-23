import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const genaiMocks = vi.hoisted(() => {
  const generateContent = vi.fn();
  const GoogleGenAI = vi.fn(function GoogleGenAI(this: {
    models: { generateContent: typeof generateContent };
  }) {
    this.models = { generateContent };
  });
  return { generateContent, GoogleGenAI };
});

vi.mock("@google/genai", () => ({
  GoogleGenAI: genaiMocks.GoogleGenAI,
  FinishReason: {
    STOP: "STOP",
    MAX_TOKENS: "MAX_TOKENS",
    SAFETY: "SAFETY",
    RECITATION: "RECITATION",
    BLOCKLIST: "BLOCKLIST",
    PROHIBITED_CONTENT: "PROHIBITED_CONTENT",
    SPII: "SPII",
  },
  Type: {
    OBJECT: "OBJECT",
    ARRAY: "ARRAY",
    STRING: "STRING",
    NUMBER: "NUMBER",
  },
}));

import { AiProviderError } from "@/modules/ai/gemini-provider";
import {
  coerceExtractionPayload,
  createGeminiKnowledgeProvider,
} from "@/modules/knowledge-ai/gemini-knowledge-provider";
import { EXTRACTION_RESPONSE_SCHEMA } from "@/modules/knowledge-ai/gemini-response-schemas";
import {
  KNOWLEDGE_INGEST_PROVIDER_MAX_ATTEMPTS,
} from "@/modules/knowledge-ai/constants";

const VALID_EXTRACTION = {
  facts: [
    {
      tempId: "f1",
      category: "SERVICE",
      title: "حلاقة",
      content: "الحلاقة 200 جنيه",
      subject: "حلاقة",
    },
  ],
  clarifications: [],
};

describe("gemini knowledge provider", () => {
  const originalKey = process.env.GEMINI_API_KEY;

  beforeEach(() => {
    genaiMocks.generateContent.mockReset();
    genaiMocks.GoogleGenAI.mockClear();
    process.env.GEMINI_API_KEY = "test-key-not-secret";
  });

  afterEach(() => {
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalKey;
    vi.clearAllMocks();
  });

  it("enables responseSchema on extraction", async () => {
    genaiMocks.generateContent.mockResolvedValue({
      text: JSON.stringify(VALID_EXTRACTION),
      candidates: [{ finishReason: "STOP" }],
    });
    const provider = createGeminiKnowledgeProvider({ apiKey: "k" });
    await provider.extractFacts("حلاقة 200");
    const call = genaiMocks.generateContent.mock.calls[0]![0] as {
      config: {
        responseMimeType: string;
        responseSchema: unknown;
        maxOutputTokens: number;
      };
    };
    expect(call.config.responseMimeType).toBe("application/json");
    expect(call.config.responseSchema).toEqual(EXTRACTION_RESPONSE_SCHEMA);
    expect(call.config.maxOutputTokens).toBeGreaterThan(1000);
  });

  it("returns valid structured extraction", async () => {
    genaiMocks.generateContent.mockResolvedValue({
      text: JSON.stringify(VALID_EXTRACTION),
      candidates: [{ finishReason: "STOP" }],
    });
    const provider = createGeminiKnowledgeProvider({ apiKey: "k" });
    const result = await provider.extractFacts("حلاقة 200");
    expect(result.facts).toHaveLength(1);
    expect(result.facts[0]?.subject).toBe("حلاقة");
  });

  it("classifies invalid JSON as GEMINI_INVALID_JSON", async () => {
    genaiMocks.generateContent.mockResolvedValue({
      text: "{not-json",
      candidates: [{ finishReason: "STOP" }],
    });
    const provider = createGeminiKnowledgeProvider({ apiKey: "k" });
    await expect(provider.extractFacts("x".repeat(20))).rejects.toMatchObject({
      code: "GEMINI_INVALID_JSON",
    });
  });

  it("classifies schema mismatch as GEMINI_SCHEMA_MISMATCH", async () => {
    genaiMocks.generateContent.mockResolvedValue({
      text: JSON.stringify({ facts: [{ tempId: "1" }], clarifications: [] }),
      candidates: [{ finishReason: "STOP" }],
    });
    const provider = createGeminiKnowledgeProvider({ apiKey: "k" });
    await expect(provider.extractFacts("x".repeat(20))).rejects.toMatchObject({
      code: "GEMINI_SCHEMA_MISMATCH",
    });
  });

  it("classifies empty response as GEMINI_EMPTY", async () => {
    genaiMocks.generateContent.mockResolvedValue({
      text: "   ",
      candidates: [{ finishReason: "STOP" }],
    });
    const provider = createGeminiKnowledgeProvider({ apiKey: "k" });
    await expect(provider.extractFacts("x".repeat(20))).rejects.toMatchObject({
      code: "GEMINI_EMPTY",
    });
  });

  it("classifies 429 as GEMINI_RATE_LIMITED", async () => {
    const err = Object.assign(new Error("rate"), { status: 429 });
    genaiMocks.generateContent.mockRejectedValue(err);
    const provider = createGeminiKnowledgeProvider({ apiKey: "k" });
    await expect(provider.extractFacts("x".repeat(20))).rejects.toMatchObject({
      code: "GEMINI_RATE_LIMITED",
    });
    expect(genaiMocks.generateContent).toHaveBeenCalledTimes(
      KNOWLEDGE_INGEST_PROVIDER_MAX_ATTEMPTS,
    );
  });

  it("classifies provider 5xx as GEMINI_UPSTREAM_5XX", async () => {
    const err = Object.assign(new Error("boom"), { status: 503 });
    genaiMocks.generateContent.mockRejectedValue(err);
    const provider = createGeminiKnowledgeProvider({ apiKey: "k" });
    await expect(provider.extractFacts("x".repeat(20))).rejects.toMatchObject({
      code: "GEMINI_UPSTREAM_5XX",
    });
    expect(genaiMocks.generateContent).toHaveBeenCalledTimes(
      KNOWLEDGE_INGEST_PROVIDER_MAX_ATTEMPTS,
    );
  });

  it("does not retry permanent 400 request failures", async () => {
    const err = Object.assign(
      new Error('{"error":{"code":400,"message":"Request contains an invalid argument.","status":"INVALID_ARGUMENT"}}'),
      { status: 400 },
    );
    genaiMocks.generateContent.mockRejectedValue(err);
    const provider = createGeminiKnowledgeProvider({ apiKey: "k" });
    await expect(provider.extractFacts("x".repeat(20))).rejects.toMatchObject({
      code: "GEMINI_REQUEST_FAILED",
    });
    expect(genaiMocks.generateContent).toHaveBeenCalledTimes(1);
  });
  it("keeps timeout as GEMINI_TIMEOUT (no retry storm)", async () => {
    genaiMocks.generateContent.mockImplementation(
      (args: { config?: { abortSignal?: AbortSignal } }) =>
        new Promise((_resolve, reject) => {
          args.config?.abortSignal?.addEventListener("abort", () => {
            reject(new DOMException("aborted", "AbortError"));
          });
        }),
    );
    const provider = createGeminiKnowledgeProvider({
      apiKey: "k",
      timeoutMs: 20,
    });
    await expect(provider.extractFacts("x".repeat(20))).rejects.toMatchObject({
      code: "GEMINI_TIMEOUT",
    });
    // Timeout is not retryable → single attempt
    expect(genaiMocks.generateContent).toHaveBeenCalledTimes(1);
  });

  it("detects truncated output before JSON parse", async () => {
    genaiMocks.generateContent.mockResolvedValue({
      text: '{"facts":[{"tempId":"1"',
      candidates: [{ finishReason: "MAX_TOKENS" }],
    });
    const provider = createGeminiKnowledgeProvider({ apiKey: "k" });
    await expect(provider.extractFacts("x".repeat(20))).rejects.toMatchObject({
      code: "GEMINI_TRUNCATED",
    });
  });

  it("retries transient failures up to max attempts", async () => {
    const err = Object.assign(new Error("busy"), { status: 429 });
    genaiMocks.generateContent
      .mockRejectedValueOnce(err)
      .mockResolvedValueOnce({
        text: JSON.stringify(VALID_EXTRACTION),
        candidates: [{ finishReason: "STOP" }],
      });
    const provider = createGeminiKnowledgeProvider({ apiKey: "k" });
    const result = await provider.extractFacts("حلاقة 200");
    expect(result.facts).toHaveLength(1);
    expect(genaiMocks.generateContent).toHaveBeenCalledTimes(
      KNOWLEDGE_INGEST_PROVIDER_MAX_ATTEMPTS,
    );
  });

  it("does not leak raw content in AiProviderError messages", async () => {
    genaiMocks.generateContent.mockResolvedValue({
      text: '{"facts":[{"secretPaste":"SHOULD_NOT_LEAK"}]}',
      candidates: [{ finishReason: "STOP" }],
    });
    const provider = createGeminiKnowledgeProvider({ apiKey: "k" });
    try {
      await provider.extractFacts("secret customer paste");
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(AiProviderError);
      const msg = String((error as Error).message);
      expect(msg).not.toMatch(/SHOULD_NOT_LEAK|secret customer/i);
    }
  });
});

describe("coerceExtractionPayload", () => {
  it("fills missing subject from title", () => {
    const coerced = coerceExtractionPayload({
      facts: [
        {
          tempId: "1",
          category: "SERVICE",
          title: "حلاقة",
          content: "200",
        },
      ],
    }) as { facts: Array<{ subject: string }> };
    expect(coerced.facts[0]?.subject).toBe("حلاقة");
  });
});
