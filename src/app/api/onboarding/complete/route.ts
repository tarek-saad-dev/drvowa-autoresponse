import { z } from "zod";

import { requireApiUser } from "@/lib/api/auth-context";
import { handleApiError, jsonOk, parseJsonBody } from "@/lib/api/http";
import { ALL_KNOWLEDGE_CATEGORIES } from "@/constants/knowledge";
import { completeOnboarding } from "@/modules/onboarding/service";

const onboardingSchema = z.object({
  business: z.object({
    name: z.string().min(1, "Business name is required"),
    category: z.string().min(1, "Category is required"),
    countryCode: z.string().min(2).max(2),
    locale: z.string().min(1),
    timezone: z.string().min(1),
  }),
  location: z
    .object({
      name: z.string().min(1),
      code: z.string().nullable().optional(),
      timezone: z.string().nullable().optional(),
      addressLine: z.string().nullable().optional(),
      city: z.string().nullable().optional(),
      phone: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
  agent: z.object({
    name: z.string().min(1, "Agent name is required"),
    roleTitle: z.string().optional(),
    language: z.string().optional(),
    dialect: z.string().nullable().optional(),
    tone: z.string().nullable().optional(),
    instructions: z.string().nullable().optional(),
  }),
  knowledgeItems: z
    .array(
      z.object({
        category: z.enum(ALL_KNOWLEDGE_CATEGORIES).optional(),
        title: z.string().min(1),
        content: z.string().min(1),
      }),
    )
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
