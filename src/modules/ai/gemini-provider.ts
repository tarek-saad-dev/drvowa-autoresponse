import { GoogleGenerativeAI } from "@google/generative-ai";

import {
  buildSystemPrompt,
  buildUserPrompt,
  sanitizeReplyText,
  GEMINI_TIMEOUT_MS,
  type AiReplyProvider,
  type AiReplyRequest,
  type AiReplyResult,
} from "./provider";

export class AiProviderError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "AiProviderError";
    this.code = code;
  }
}

export function createGeminiProvider(options?: {
  apiKey?: string;
  model?: string;
  timeoutMs?: number;
}): AiReplyProvider {
  const apiKey = options?.apiKey ?? process.env.GEMINI_API_KEY?.trim();
  const model = options?.model ?? process.env.GEMINI_MODEL?.trim() ?? "gemini-2.0-flash";
  const timeoutMs = options?.timeoutMs ?? GEMINI_TIMEOUT_MS;

  if (!apiKey) {
    throw new AiProviderError("GEMINI_API_KEY is not configured", "GEMINI_NOT_CONFIGURED");
  }

  const client = new GoogleGenerativeAI(apiKey);

  return {
    async generateReply(request: AiReplyRequest): Promise<AiReplyResult> {
      const started = Date.now();
      const genModel = client.getGenerativeModel({
        model,
        systemInstruction: buildSystemPrompt(request.agent),
      });

      const prompt = buildUserPrompt(request);
      const timeout = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new AiProviderError("Gemini timed out", "GEMINI_TIMEOUT"));
        }, timeoutMs);
      });

      try {
        const result = await Promise.race([
          genModel.generateContent(prompt),
          timeout,
        ]);
        const raw = result.response.text() || "";
        const text = sanitizeReplyText(raw);
        if (!text) {
          throw new AiProviderError("Empty Gemini output", "GEMINI_EMPTY");
        }
        return {
          text,
          model,
          latencyMs: Date.now() - started,
        };
      } catch (error) {
        if (error instanceof AiProviderError) throw error;
        throw new AiProviderError(
          "Gemini generation failed",
          "GEMINI_FAILED",
        );
      }
    },
  };
}
