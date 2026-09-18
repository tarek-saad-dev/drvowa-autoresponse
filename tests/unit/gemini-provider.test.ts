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
}));

import {
  AiProviderError,
  DEFAULT_GEMINI_MODEL,
  createGeminiProvider,
  resolveGeminiModel,
} from "@/modules/ai/gemini-provider";
import { buildSystemPrompt, buildUserPrompt } from "@/modules/ai/provider";

const SAMPLE_REQUEST = {
  businessId: "b",
  conversationId: "c",
  agent: {
    name: "نورا",
    roleTitle: "موظفة استقبال",
    language: "ar",
    dialect: "egyptian",
    tone: "ودود",
    instructions: "رحّب بالعملاء",
  },
  knowledge: [{ category: "FAQ" as const, title: "ساعات", content: "من 10 إلى 6" }],
  recentMessages: [
    {
      direction: "INBOUND" as const,
      textContent: "السلام عليكم",
      createdAtUtc: new Date(),
      messageId: "m1",
    },
  ],
};

describe("Phase 3B Part 1.2 Gemini provider (@google/genai)", () => {
  const originalKey = process.env.GEMINI_API_KEY;
  const originalModel = process.env.GEMINI_MODEL;

  beforeEach(() => {
    genaiMocks.generateContent.mockReset();
    genaiMocks.GoogleGenAI.mockClear();
    delete process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_MODEL;
  });

  afterEach(() => {
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalKey;
    if (originalModel === undefined) delete process.env.GEMINI_MODEL;
    else process.env.GEMINI_MODEL = originalModel;
    vi.clearAllMocks();
  });

  it("1. missing GEMINI_API_KEY => GEMINI_NOT_CONFIGURED", () => {
    expect(() => createGeminiProvider()).toThrow(AiProviderError);
    try {
      createGeminiProvider();
    } catch (error) {
      expect(error).toBeInstanceOf(AiProviderError);
      expect((error as AiProviderError).code).toBe("GEMINI_NOT_CONFIGURED");
      expect(String((error as Error).message)).not.toMatch(/AIza|sk-|secret/i);
    }
  });

  it("2. default model = gemini-3.5-flash-lite", () => {
    expect(DEFAULT_GEMINI_MODEL).toBe("gemini-3.5-flash-lite");
    expect(resolveGeminiModel()).toBe("gemini-3.5-flash-lite");
  });

  it("3. GEMINI_MODEL overrides default", () => {
    process.env.GEMINI_MODEL = "gemini-custom-test";
    expect(resolveGeminiModel()).toBe("gemini-custom-test");
    expect(resolveGeminiModel({ model: "explicit-model" })).toBe("explicit-model");
  });

  it("4/5. system and user prompts preserved in generateContent call", async () => {
    genaiMocks.generateContent.mockResolvedValue({ text: "أهلاً بك" });
    const provider = createGeminiProvider({
      apiKey: "test-key-not-a-secret-for-unit",
      model: "gemini-3.5-flash-lite",
    });

    await provider.generateReply(SAMPLE_REQUEST);

    expect(genaiMocks.GoogleGenAI).toHaveBeenCalledWith({
      apiKey: "test-key-not-a-secret-for-unit",
    });
    expect(genaiMocks.generateContent).toHaveBeenCalledTimes(1);
    const call = genaiMocks.generateContent.mock.calls[0]![0] as {
      model: string;
      contents: string;
      config: { systemInstruction: string; abortSignal: AbortSignal };
    };
    expect(call.model).toBe("gemini-3.5-flash-lite");
    expect(call.config.systemInstruction).toBe(buildSystemPrompt(SAMPLE_REQUEST.agent));
    expect(call.contents).toBe(buildUserPrompt(SAMPLE_REQUEST));
    expect(call.config.abortSignal).toBeInstanceOf(AbortSignal);
  });

  it("6. successful text sanitized", async () => {
    genaiMocks.generateContent.mockResolvedValue({
      text: "```\nمرحبا بالعميل\n```",
    });
    const provider = createGeminiProvider({ apiKey: "test-key" });
    const result = await provider.generateReply(SAMPLE_REQUEST);
    expect(result.text).toBe("مرحبا بالعميل");
    expect(result.model).toBe(DEFAULT_GEMINI_MODEL);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("7. empty output => GEMINI_EMPTY", async () => {
    genaiMocks.generateContent.mockResolvedValue({ text: "   " });
    const provider = createGeminiProvider({ apiKey: "test-key" });
    await expect(provider.generateReply(SAMPLE_REQUEST)).rejects.toMatchObject({
      code: "GEMINI_EMPTY",
    });
  });

  it("8. timeout => GEMINI_TIMEOUT", async () => {
    genaiMocks.generateContent.mockImplementation(
      (args: { config?: { abortSignal?: AbortSignal } }) =>
        new Promise((_resolve, reject) => {
          const signal = args.config?.abortSignal;
          if (!signal) {
            reject(new Error("missing abortSignal"));
            return;
          }
          signal.addEventListener("abort", () => {
            reject(new DOMException("The operation was aborted.", "AbortError"));
          });
        }),
    );
    const provider = createGeminiProvider({
      apiKey: "test-key",
      timeoutMs: 30,
    });
    await expect(provider.generateReply(SAMPLE_REQUEST)).rejects.toMatchObject({
      code: "GEMINI_TIMEOUT",
    });
  });

  it("9. provider error => GEMINI_FAILED", async () => {
    genaiMocks.generateContent.mockRejectedValue(
      new Error("upstream boom with key=should-not-leak"),
    );
    const provider = createGeminiProvider({ apiKey: "test-key" });
    try {
      await provider.generateReply(SAMPLE_REQUEST);
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(AiProviderError);
      expect((error as AiProviderError).code).toBe("GEMINI_FAILED");
      expect((error as Error).message).toBe("Gemini generation failed");
      expect((error as Error).message).not.toMatch(/should-not-leak|test-key|AIza/i);
    }
  });

  it("10. no secret appears in AiProviderError messages", async () => {
    genaiMocks.generateContent.mockRejectedValue(
      new Error("fail for key=AIzaSyLeakedSecretValue"),
    );
    const provider = createGeminiProvider({
      apiKey: "AIzaSyRealLookingTestKeyValue",
    });
    try {
      await provider.generateReply(SAMPLE_REQUEST);
      expect.unreachable("should have thrown");
    } catch (error) {
      const serialized = `${(error as Error).message}\n${(error as Error).stack ?? ""}`;
      expect(serialized).not.toContain("AIzaSyLeakedSecretValue");
      expect(serialized).not.toContain("AIzaSyRealLookingTestKeyValue");
      expect((error as AiProviderError).code).toBe("GEMINI_FAILED");
    }
  });
});
