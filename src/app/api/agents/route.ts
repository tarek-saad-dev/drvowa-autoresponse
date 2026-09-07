import { z } from "zod";

import { requireApiBusiness } from "@/lib/api/auth-context";
import { handleApiError, jsonOk, parseJsonBody } from "@/lib/api/http";
import { createAgent, listAgents } from "@/modules/agents/service";

const createSchema = z.object({
  businessId: z.string().uuid().optional(),
  name: z.string().min(1, "Name is required"),
  roleTitle: z.string().min(1, "Role title is required"),
  language: z.string().min(1, "Language is required"),
  dialect: z.string().nullable().optional(),
  tone: z.string().nullable().optional(),
  instructions: z.string().nullable().optional(),
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
