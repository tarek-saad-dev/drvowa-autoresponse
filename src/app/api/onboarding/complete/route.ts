import { z } from "zod";

import { requireApiUser } from "@/lib/api/auth-context";
import { handleApiError, jsonOk, parseJsonBody } from "@/lib/api/http";
import { ALL_KNOWLEDGE_CATEGORIES } from "@/constants/knowledge";
import {
  AGENT_DIALECT_MAX,
  AGENT_INSTRUCTIONS_MAX,
  AGENT_LANGUAGE_MAX,
  AGENT_NAME_MAX,
  AGENT_ROLE_MAX,
  AGENT_TONE_MAX,
  KNOWLEDGE_CONTENT_MAX,
  KNOWLEDGE_TITLE_MAX,
} from "@/constants/field-limits";
import { completeOnboarding } from "@/modules/onboarding/service";

const onboardingSchema = z.object({
  business: z.object({
    name: z.string().min(1, "Business name is required").max(200),
    category: z.string().min(1, "Category is required").max(100),
    countryCode: z.string().min(2).max(2),
    locale: z.string().min(1).max(20),
    timezone: z.string().min(1).max(64),
  }),
  location: z
    .object({
      name: z.string().min(1).max(200),
      code: z.string().max(64).nullable().optional(),
      timezone: z.string().max(64).nullable().optional(),
      addressLine: z.string().max(300).nullable().optional(),
      city: z.string().max(100).nullable().optional(),
      phone: z.string().max(32).nullable().optional(),
    })
    .nullable()
    .optional(),
  agent: z.object({
    name: z.string().min(1, "Agent name is required").max(AGENT_NAME_MAX),
    roleTitle: z.string().max(AGENT_ROLE_MAX).optional(),
    language: z.string().max(AGENT_LANGUAGE_MAX).optional(),
    dialect: z.string().max(AGENT_DIALECT_MAX).nullable().optional(),
    tone: z.string().max(AGENT_TONE_MAX).nullable().optional(),
    instructions: z.string().max(AGENT_INSTRUCTIONS_MAX).nullable().optional(),
  }),
  knowledgeItems: z
    .array(
      z.object({
        category: z.enum(ALL_KNOWLEDGE_CATEGORIES).optional(),
        title: z.string().min(1).max(KNOWLEDGE_TITLE_MAX),
        content: z.string().min(1).max(KNOWLEDGE_CONTENT_MAX),
      }),
    )
    .max(20)
    .optional(),
});

export async function POST(request: Request) {
  try {
    const user = await requireApiUser();
    const body = await parseJsonBody(request);
    const input = onboardingSchema.parse(body);

    const result = await completeOnboarding({
      userId: user.userId,
      sessionId: user.sessionId,
      business: input.business,
      location: input.location,
      agent: input.agent,
      knowledgeItems: input.knowledgeItems,
    });

    return jsonOk(result, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
