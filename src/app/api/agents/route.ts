import { z } from "zod";

import {
  AGENT_DIALECT_MAX,
  AGENT_INSTRUCTIONS_MAX,
  AGENT_LANGUAGE_MAX,
  AGENT_NAME_MAX,
  AGENT_ROLE_MAX,
  AGENT_TONE_MAX,
} from "@/constants/field-limits";
import { requireApiBusiness } from "@/lib/api/auth-context";
import { handleApiError, jsonOk, parseJsonBody } from "@/lib/api/http";
import { createAgent, listAgents } from "@/modules/agents/service";

const createSchema = z.object({
  businessId: z.string().uuid().optional(),
  name: z.string().min(1, "Name is required").max(AGENT_NAME_MAX),
  roleTitle: z.string().min(1, "Role title is required").max(AGENT_ROLE_MAX),
  language: z.string().min(1, "Language is required").max(AGENT_LANGUAGE_MAX),
  dialect: z.string().max(AGENT_DIALECT_MAX).nullable().optional(),
  tone: z.string().max(AGENT_TONE_MAX).nullable().optional(),
  instructions: z.string().max(AGENT_INSTRUCTIONS_MAX).nullable().optional(),
  isActive: z.boolean().optional(),
});

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const queryBusinessId = url.searchParams.get("businessId");
    const { businessId } = await requireApiBusiness({
      businessId: queryBusinessId,
    });
    const agents = await listAgents({ businessId });
    return jsonOk({ agents });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await parseJsonBody(request);
    const input = createSchema.parse(body);
    const { businessId } = await requireApiBusiness({
      businessId: input.businessId,
    });

    const agent = await createAgent({
      businessId,
      name: input.name,
      roleTitle: input.roleTitle,
      language: input.language,
      dialect: input.dialect,
      tone: input.tone,
      instructions: input.instructions,
      isActive: input.isActive,
    });

    return jsonOk({ agent }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
