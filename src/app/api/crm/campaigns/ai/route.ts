import { z } from "zod";

import { requireApiBusiness } from "@/lib/api/auth-context";
import { handleApiError, jsonOk, parseJsonBody } from "@/lib/api/http";
import { assertRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { AiProviderError } from "@/modules/ai/gemini-provider";
import { runCampaignAiTurn } from "@/modules/crm/campaign-ai";
import { ValidationError } from "@/lib/tenancy/errors";

const schema = z
  .object({
    message: z.string().trim().min(2).max(2000),
    mode: z.enum(["filter", "refine", "draft_message"]).optional(),
    priorFilter: z.unknown().optional(),
    sessionId: z.string().uuid().nullable().optional(),
    channelConnectionId: z.string().uuid().nullable().optional(),
  })
  .strict();

export async function POST(request: Request) {
  try {
    const { user, businessId } = await requireApiBusiness();
    assertRateLimit("crm-campaign-ai:" + businessId, RATE_LIMITS.knowledgeIngestAnalyze);
    const input = schema.parse(await parseJsonBody(request));
    const turn = await runCampaignAiTurn({
      businessId,
      userId: user.userId,
      message: input.message,
      mode: input.mode,
      priorFilter: input.priorFilter,
      sessionId: input.sessionId,
      channelConnectionId: input.channelConnectionId,
    });
    return jsonOk({ turn, autoLaunch: false });
  } catch (error) {
    if (error instanceof AiProviderError) {
      return handleApiError(
        new ValidationError(
          error.code === "GEMINI_NOT_CONFIGURED"
            ? "خدمة الذكاء الاصطناعي غير مهيأة"
            : "تعذر معالجة طلب الحملة بالذكاء الاصطناعي",
        ),
      );
    }
    return handleApiError(error);
  }
}
