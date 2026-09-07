import { z } from "zod";

import { ALL_KNOWLEDGE_CATEGORIES } from "@/constants/knowledge";
import { requireApiBusiness } from "@/lib/api/auth-context";
import { handleApiError, jsonOk, parseJsonBody } from "@/lib/api/http";
import { deactivateItem, updateItem } from "@/modules/knowledge/service";

const updateSchema = z.object({
  businessId: z.string().uuid().optional(),
  category: z.enum(ALL_KNOWLEDGE_CATEGORIES).optional(),
  title: z.string().min(1).optional(),
  content: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
});

type RouteContext = {
  params: Promise<{ knowledgeItemId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { knowledgeItemId } = await context.params;
    const body = await parseJsonBody(request);
    const input = updateSchema.parse(body);
    const { businessId } = await requireApiBusiness({
      businessId: input.businessId,
    });

    const item = await updateItem({
      businessId,
      knowledgeItemId,
      category: input.category,
      title: input.title,
      content: input.content,
      isActive: input.isActive,
    });

    return jsonOk({ item });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const { knowledgeItemId } = await context.params;
    const url = new URL(request.url);
    const queryBusinessId = url.searchParams.get("businessId");
    let bodyBusinessId: string | undefined;
    try {
      const body = (await request.json()) as { businessId?: string };
      bodyBusinessId = body?.businessId;
    } catch {
      bodyBusinessId = undefined;
    }

    const { businessId } = await requireApiBusiness({
      businessId: bodyBusinessId ?? queryBusinessId,
    });

    const item = await deactivateItem({ businessId, knowledgeItemId });
    return jsonOk({ item });
  } catch (error) {
    return handleApiError(error);
  }
}
