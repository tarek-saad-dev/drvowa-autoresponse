import { z } from "zod";

import { ALL_KNOWLEDGE_CATEGORIES } from "@/constants/knowledge";
import {
  KNOWLEDGE_CONTENT_MAX,
  KNOWLEDGE_TITLE_MAX,
} from "@/constants/field-limits";
import { requireApiBusiness } from "@/lib/api/auth-context";
import { handleApiError, jsonOk, parseJsonBody } from "@/lib/api/http";
import { createItem, listItems } from "@/modules/knowledge/service";

const createSchema = z.object({
  businessId: z.string().uuid().optional(),
  category: z.enum(ALL_KNOWLEDGE_CATEGORIES),
  title: z.string().min(1, "Title is required").max(KNOWLEDGE_TITLE_MAX),
  content: z.string().min(1, "Content is required").max(KNOWLEDGE_CONTENT_MAX),
  knowledgeBaseId: z.string().uuid().optional(),
});

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const queryBusinessId = url.searchParams.get("businessId");
    const includeInactive = url.searchParams.get("includeInactive") === "1";
    const { businessId } = await requireApiBusiness({
      businessId: queryBusinessId,
    });
    const items = await listItems({ businessId, includeInactive });
    return jsonOk({ items });
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

    const item = await createItem({
      businessId,
      category: input.category,
      title: input.title,
      content: input.content,
      knowledgeBaseId: input.knowledgeBaseId,
    });

    return jsonOk({ item }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
