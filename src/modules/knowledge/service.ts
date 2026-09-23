import type { KnowledgeCategory } from "@/constants/knowledge";
import type { TransactionClient } from "@/lib/db";
import { NotFoundError } from "@/lib/tenancy/errors";
import { withResourceLimitGate } from "@/modules/billing/entitlements";
import type { KnowledgeBase, KnowledgeItem } from "@/types/domain";

import * as repo from "./repository";

export async function ensureDefaultKnowledgeBase(
  params: {
    businessId: string;
    name?: string;
  },
  trx?: TransactionClient,
): Promise<KnowledgeBase> {
  const existing = await repo.findDefaultKnowledgeBase(
    {
      businessId: params.businessId,
    },
    trx,
  );
  if (existing) {
    return existing;
  }

  return repo.createKnowledgeBase(
    {
      businessId: params.businessId,
      name: params.name?.trim() || "Default",
    },
    trx,
  );
}

export async function listItems(
  params: {
    businessId: string;
    includeInactive?: boolean;
  },
  trx?: TransactionClient,
): Promise<KnowledgeItem[]> {
  return repo.listKnowledgeItems(
    {
      businessId: params.businessId,
      includeInactive: params.includeInactive,
    },
    trx,
  );
}

export async function createItem(params: {
  businessId: string;
  category: KnowledgeCategory;
  title: string;
  content: string;
  knowledgeBaseId?: string;
  isActive?: boolean;
}): Promise<KnowledgeItem> {
  const base = params.knowledgeBaseId
    ? { knowledgeBaseId: params.knowledgeBaseId }
    : await ensureDefaultKnowledgeBase({ businessId: params.businessId });

  const isActive = params.isActive ?? true;
  if (!isActive) {
    return repo.createKnowledgeItem({
      businessId: params.businessId,
      knowledgeBaseId: base.knowledgeBaseId,
      category: params.category,
      title: params.title.trim(),
      content: params.content.trim(),
      isActive: false,
    });
  }

  return withResourceLimitGate({
    businessId: params.businessId,
    kind: "knowledge_active",
    createFn: (trx) =>
      repo.createKnowledgeItem(
        {
          businessId: params.businessId,
          knowledgeBaseId: base.knowledgeBaseId,
          category: params.category,
          title: params.title.trim(),
          content: params.content.trim(),
          isActive: true,
        },
        trx,
      ),
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
  const existing = await repo.getKnowledgeItem({
    businessId: params.businessId,
    knowledgeItemId: params.knowledgeItemId,
  });
  if (!existing) {
    throw new NotFoundError("Knowledge item not found");
  }

  const nextActive = params.isActive ?? existing.isActive;
  const activating = !existing.isActive && nextActive === true;

  if (activating) {
    return withResourceLimitGate({
      businessId: params.businessId,
      kind: "knowledge_active",
      createFn: async (trx) => {
        const updated = await repo.updateKnowledgeItem(
          {
            businessId: params.businessId,
            knowledgeItemId: params.knowledgeItemId,
            category: params.category,
            title: params.title?.trim(),
            content: params.content?.trim(),
            isActive: true,
          },
          trx,
        );
        if (!updated) {
          throw new NotFoundError("Knowledge item not found");
        }
        return updated;
      },
    });
  }

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
