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
import { deleteAgent, updateAgent } from "@/modules/agents/service";

const updateSchema = z.object({
  businessId: z.string().uuid().optional(),
  name: z.string().min(1).max(AGENT_NAME_MAX).optional(),
  roleTitle: z.string().min(1).max(AGENT_ROLE_MAX).optional(),
  language: z.string().min(1).max(AGENT_LANGUAGE_MAX).optional(),
  dialect: z.string().max(AGENT_DIALECT_MAX).nullable().optional(),
  tone: z.string().max(AGENT_TONE_MAX).nullable().optional(),
  instructions: z.string().max(AGENT_INSTRUCTIONS_MAX).nullable().optional(),
  isActive: z.boolean().optional(),
});

type RouteContext = {
  params: Promise<{ agentId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { agentId } = await context.params;
    const body = await parseJsonBody(request);
    const input = updateSchema.parse(body);
    const { businessId } = await requireApiBusiness({
      businessId: input.businessId,
    });

    const agent = await updateAgent({
      businessId,
      agentId,
      name: input.name,
      roleTitle: input.roleTitle,
      language: input.language,
      dialect: input.dialect,
      tone: input.tone,
      instructions: input.instructions,
      isActive: input.isActive,
    });

    return jsonOk({ agent });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const { agentId } = await context.params;
    const url = new URL(request.url);
    const queryBusinessId = url.searchParams.get("businessId");
    let bodyBusinessId: string | undefined;
    let deactivate = false;
    try {
      const body = (await request.json()) as {
        businessId?: string;
        deactivate?: boolean;
      };
      bodyBusinessId = body?.businessId;
      deactivate = body?.deactivate === true;
    } catch {
      bodyBusinessId = undefined;
    }

    const { businessId } = await requireApiBusiness({
      businessId: bodyBusinessId ?? queryBusinessId,
    });

    if (deactivate) {
      const agent = await updateAgent({
        businessId,
        agentId,
        isActive: false,
      });
      return jsonOk({ agent });
    }

    await deleteAgent({ businessId, agentId });
    return jsonOk({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
