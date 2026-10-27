import { GoogleGenAI } from "@google/genai";
import { providerHttpStatus, recordAiProviderCall } from "@/modules/ai-cost/recorder";

import {
  buildSystemPrompt,
  buildUserPrompt,
  sanitizeReplyText,
  GEMINI_TIMEOUT_MS,
  type AiReplyProvider,
  type AiReplyRequest,
  type AiReplyResult,
} from "./provider";

/** Production default for low-latency receptionist replies. Overridable via GEMINI_MODEL. */
export const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite";

export class AiProviderError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "AiProviderError";
    this.code = code;
  }
}

export function resolveGeminiModel(options?: { model?: string }): string {
  return options?.model?.trim()
    || process.env.GEMINI_MODEL?.trim()
    || DEFAULT_GEMINI_MODEL;
}

function isAbortError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const name = "name" in error ? String((error as { name?: unknown }).name) : "";
  if (name === "AbortError" || name === "DOMException") return true;
  const message = "message" in error ? String((error as { message?: unknown }).message) : "";
  return /aborted|abort/i.test(message);
}

function extractResponseText(response: { text?: string | (() => string) }): string {
  if (typeof response.text === "function") {
    return response.text() || "";
  }
  return response.text || "";
}

export function createGeminiProvider(options?: {
  apiKey?: string;
  model?: string;
  timeoutMs?: number;
}): AiReplyProvider {
  const apiKey = options?.apiKey ?? process.env.GEMINI_API_KEY?.trim();
  const model = resolveGeminiModel({ model: options?.model });
  const timeoutMs = options?.timeoutMs ?? GEMINI_TIMEOUT_MS;

  if (!apiKey) {
    throw new AiProviderError("GEMINI_API_KEY is not configured", "GEMINI_NOT_CONFIGURED");
  }

  const client = new GoogleGenAI({ apiKey });

  return {
    async generateReply(request: AiReplyRequest): Promise<AiReplyResult> {
      const started = Date.now();
      const systemInstruction = buildSystemPrompt(request.agent);
      const contents = buildUserPrompt(request);
      const abortController = new AbortController();
      const timer = setTimeout(() => {
        abortController.abort();
      }, timeoutMs);

      let providerReturned = false;
      try {
        const response = await client.models.generateContent({
          model,
          contents,
          config: {
            systemInstruction,
            abortSignal: abortController.signal,
          },
        });
        providerReturned = true;
        await recordAiProviderCall({
          purpose: request.conversationId === "onboarding-preview" ? "ONBOARDING_PREVIEW" : "WHATSAPP_REPLY",
          model, businessId: request.businessId, startedAtMs: started, response,
        });
        const raw = extractResponseText(response);
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
        if (!providerReturned) await recordAiProviderCall({
          purpose: request.conversationId === "onboarding-preview" ? "ONBOARDING_PREVIEW" : "WHATSAPP_REPLY",
          model, businessId: request.businessId, startedAtMs: started, error,
        });
        if (error instanceof AiProviderError) throw error;
        if (providerHttpStatus(error) === 402) {
          throw new AiProviderError("Gemini billing requires attention", "GEMINI_PAYMENT_REQUIRED");
        }
        if (providerHttpStatus(error) === 429) {
          throw new AiProviderError("Gemini quota exceeded", "GEMINI_RATE_LIMITED");
        }
        if (abortController.signal.aborted || isAbortError(error)) {
          throw new AiProviderError("Gemini timed out", "GEMINI_TIMEOUT");
        }
        throw new AiProviderError(
          "Gemini generation failed",
          "GEMINI_FAILED",
        );
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
