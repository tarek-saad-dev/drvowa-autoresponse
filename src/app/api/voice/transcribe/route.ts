import { requireApiBusiness } from "@/lib/api/auth-context";
import { handleApiError, jsonOk } from "@/lib/api/http";
import { RATE_LIMITS, assertRateLimit } from "@/lib/security/rate-limit";
import { ValidationError } from "@/lib/tenancy/errors";

const MAX_AUDIO_BYTES = 15 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const { businessId } = await requireApiBusiness();
    assertRateLimit(
      `voice-transcribe:${businessId}`,
      RATE_LIMITS.voiceTranscribe,
    );

    const form = await request.formData();
    const file = form.get("file");

    if (!(file instanceof File) || file.size === 0) {
      throw new ValidationError("Audio file is required");
    }

    if (file.size > MAX_AUDIO_BYTES) {
      throw new ValidationError("Audio file is too large");
    }

    if (file.type && !file.type.startsWith("audio/")) {
      throw new ValidationError("Only audio files are supported");
    }

    const baseUrl = process.env.VOICE_API_BASE_URL?.trim();
    const apiKey = process.env.VOICE_API_KEY?.trim();
    const model =
      process.env.VOICE_STT_MODEL?.trim() || "Systran/faster-whisper-small";

    if (!baseUrl || !apiKey) {
      throw new Error("VOICE_API_NOT_CONFIGURED");
    }

    const upstreamBody = new FormData();
    upstreamBody.append("file", file, file.name || "voice.webm");
    upstreamBody.append("model", model);
    upstreamBody.append("language", "ar");

    const upstream = await fetch(
      `${baseUrl.replace(/\/$/, "")}/v1/audio/transcriptions`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        body: upstreamBody,
        cache: "no-store",
      },
    );

    const data = (await upstream.json().catch(() => ({}))) as {
      text?: string;
      detail?: string;
      error?: string;
    };

    if (!upstream.ok) {
      console.error("[voice-transcribe] upstream failed", {
        status: upstream.status,
        detail: data.detail ?? data.error ?? null,
      });
      throw new Error("VOICE_TRANSCRIPTION_FAILED");
    }

    const text = data.text?.trim();
    if (!text) {
      throw new Error("VOICE_TRANSCRIPTION_EMPTY");
    }

    return jsonOk({ text, model });
  } catch (error) {
    return handleApiError(error);
  }
}
