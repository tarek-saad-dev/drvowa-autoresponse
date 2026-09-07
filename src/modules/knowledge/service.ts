import type { KnowledgeCategory } from "@/constants/knowledge";
import { NotFoundError } from "@/lib/tenancy/errors";
import type { KnowledgeBase, KnowledgeItem } from "@/types/domain";

import * as repo from "./repository";

export async function ensureDefaultKnowledgeBase(params: {
  businessId: string;
  name?: string;
}): Promise<KnowledgeBase> {
  const existing = await repo.findDefaultKnowledgeBase({
    businessId: params.businessId,
  });
  if (existing) {
    return existing;
  }

  return repo.createKnowledgeBase({
    businessId: params.businessId,
    name: params.name?.trim() || "Default",
  });
}

export async function listItems(params: {
  businessId: string;
  includeInactive?: boolean;
}): Promise<KnowledgeItem[]> {
  return repo.listKnowledgeItems({
    businessId: params.businessId,
    includeInactive: params.includeInactive,
  });
}

export async function createItem(params: {
  businessId: string;
  category: KnowledgeCategory;
  title: string;
  content: string;
  knowledgeBaseId?: string;
}): Promise<KnowledgeItem> {
  const base = params.knowledgeBaseId
    ? { knowledgeBaseId: params.knowledgeBaseId }
    : await ensureDefaultKnowledgeBase({ businessId: params.businessId });

  return repo.createKnowledgeItem({
    businessId: params.businessId,
    knowledgeBaseId: base.knowledgeBaseId,
    category: params.category,
    title: params.title.trim(),
    content: params.content.trim(),
  });
}

export async function updateItem(params: {
  businessId: string;
  knowledgeItemId: string;
  category?: KnowledgeCategory;
  title?: string;
  content?: string;
  isActive?: boolean;
}): Promise<KnowledgeItem> {
  const updated = await repo.updateKnowledgeItem({
    businessId: params.businessId,
    knowledgeItemId: params.knowledgeItemId,
    category: params.category,
    title: params.title?.trim(),
    content: params.content?.trim(),
    isActive: params.isActive,
  });
  if (!updated) {
    throw new NotFoundError("Knowledge item not found");
  }
  return updated;
}

export async function deactivateItem(params: {
  businessId: string;
  knowledgeItemId: string;
}): Promise<KnowledgeItem> {
  return updateItem({
    businessId: params.businessId,
    knowledgeItemId: params.knowledgeItemId,
    isActive: false,
  });
}
