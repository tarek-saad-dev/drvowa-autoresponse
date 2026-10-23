import { z } from "zod";

import { requireApiUser } from "@/lib/api/auth-context";
import { handleApiError, jsonError, jsonOk, parseJsonBody } from "@/lib/api/http";
import {
  AGENT_DIALECT_MAX,
  AGENT_INSTRUCTIONS_MAX,
  AGENT_LANGUAGE_MAX,
  AGENT_NAME_MAX,
  AGENT_ROLE_MAX,
  AGENT_TONE_MAX,
} from "@/constants/field-limits";
import { ensureOnboardingWorkspace } from "@/modules/onboarding/service";

const bodySchema = z.object({
  agent: z
    .object({
      name: z.string().min(1).max(AGENT_NAME_MAX).optional(),
      roleTitle: z.string().max(AGENT_ROLE_MAX).optional(),
      language: z.string().max(AGENT_LANGUAGE_MAX).optional(),
      dialect: z.string().max(AGENT_DIALECT_MAX).nullable().optional(),
      tone: z.string().max(AGENT_TONE_MAX).nullable().optional(),
      instructions: z.string().max(AGENT_INSTRUCTIONS_MAX).nullable().optional(),
    })
    .optional(),
});

export async function POST(request: Request) {
  try {
    const user = await requireApiUser();
    const body = bodySchema.parse(await parseJsonBody(request));

    try {
      const result = await ensureOnboardingWorkspace({
        userId: user.userId,
        sessionId: user.sessionId,
        agent: body.agent,
      });
      return jsonOk({
        business: result.business,
        agent: result.agent,
        subscription: result.subscription,
      });
    } catch (error) {
      if (error instanceof Error && error.message === "NO_BUSINESS") {
        return jsonError("لا يوجد بيزنس بعد. أكمل خطوة التعريف أولاً.", 404);
      }
      throw error;
    }
  } catch (error) {
    return handleApiError(error);
  }
}
