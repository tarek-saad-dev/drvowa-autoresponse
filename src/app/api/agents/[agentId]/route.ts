import { z } from "zod";

import { requireApiBusiness } from "@/lib/api/auth-context";
import { handleApiError, jsonOk, parseJsonBody } from "@/lib/api/http";
import { deleteAgent, updateAgent } from "@/modules/agents/service";

const updateSchema = z.object({
  businessId: z.string().uuid().optional(),
  name: z.string().min(1).optional(),
  roleTitle: z.string().min(1).optional(),
  language: z.string().min(1).optional(),
  dialect: z.string().nullable().optional(),
  tone: z.string().nullable().optional(),
  instructions: z.string().nullable().optional(),
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
