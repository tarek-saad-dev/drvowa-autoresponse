import { randomUUID } from "node:crypto";

import type { KnowledgeCategory } from "@/constants/knowledge";
import { query, sql } from "@/lib/db";
import type { KnowledgeBase, KnowledgeItem } from "@/types/domain";

type KnowledgeBaseRow = {
  KnowledgeBaseID: string;
  BusinessID: string;
  Name: string;
  IsActive: boolean;
  CreatedAtUtc: Date;
  UpdatedAtUtc: Date;
};

type KnowledgeItemRow = {
  KnowledgeItemID: string;
  KnowledgeBaseID: string;
  BusinessID: string;
  Category: string;
  Title: string;
  Content: string;
  IsActive: boolean;
  CreatedAtUtc: Date;
  UpdatedAtUtc: Date;
};

function mapBase(row: KnowledgeBaseRow): KnowledgeBase {
  return {
    knowledgeBaseId: row.KnowledgeBaseID,
    businessId: row.BusinessID,
    name: row.Name,
    isActive: Boolean(row.IsActive),
    createdAtUtc: row.CreatedAtUtc,
    updatedAtUtc: row.UpdatedAtUtc,
  };
}

function mapItem(row: KnowledgeItemRow): KnowledgeItem {
  return {
    knowledgeItemId: row.KnowledgeItemID,
    knowledgeBaseId: row.KnowledgeBaseID,
    businessId: row.BusinessID,
    category: row.Category as KnowledgeCategory,
    title: row.Title,
    content: row.Content,
    isActive: Boolean(row.IsActive),
    createdAtUtc: row.CreatedAtUtc,
    updatedAtUtc: row.UpdatedAtUtc,
  };
}

export async function findDefaultKnowledgeBase(params: {
  businessId: string;
}): Promise<KnowledgeBase | null> {
  const result = await query<KnowledgeBaseRow>(
    `SELECT TOP 1 KnowledgeBaseID, BusinessID, Name, IsActive, CreatedAtUtc, UpdatedAtUtc
     FROM TblKnowledgeBase
     WHERE BusinessID = @businessId
     ORDER BY CreatedAtUtc ASC`,
    [
      {
        name: "businessId",
        type: sql.UniqueIdentifier,
        value: params.businessId,
      },
    ],
  );
  const row = result.recordset[0];
  return row ? mapBase(row) : null;
}

export async function createKnowledgeBase(params: {
  businessId: string;
  name: string;
}): Promise<KnowledgeBase> {
  const knowledgeBaseId = randomUUID();
  const now = new Date();

  await query(
    `INSERT INTO TblKnowledgeBase (
      KnowledgeBaseID, BusinessID, Name, IsActive, CreatedAtUtc, UpdatedAtUtc
    ) VALUES (
      @knowledgeBaseId, @businessId, @name, 1, @createdAtUtc, @updatedAtUtc
    )`,
    [
      {
        name: "knowledgeBaseId",
        type: sql.UniqueIdentifier,
        value: knowledgeBaseId,
      },
      {
        name: "businessId",
        type: sql.UniqueIdentifier,
        value: params.businessId,
      },
      { name: "name", type: sql.NVarChar(200), value: params.name },
      { name: "createdAtUtc", type: sql.DateTime2, value: now },
      { name: "updatedAtUtc", type: sql.DateTime2, value: now },
    ],
  );

  return {
    knowledgeBaseId,
    businessId: params.businessId,
    name: params.name,
    isActive: true,
    createdAtUtc: now,
    updatedAtUtc: now,
  };
}

export async function listKnowledgeItems(params: {
  businessId: string;
  includeInactive?: boolean;
}): Promise<KnowledgeItem[]> {
  const includeInactive = params.includeInactive ?? false;
  const result = await query<KnowledgeItemRow>(
    `SELECT KnowledgeItemID, KnowledgeBaseID, BusinessID, Category, Title, Content,
            IsActive, CreatedAtUtc, UpdatedAtUtc
     FROM TblKnowledgeItem
     WHERE BusinessID = @businessId
       AND (@includeInactive = 1 OR IsActive = 1)
     ORDER BY Category, Title`,
    [
      {
        name: "businessId",
        type: sql.UniqueIdentifier,
        value: params.businessId,
      },
      { name: "includeInactive", type: sql.Bit, value: includeInactive },
    ],
  );
  return result.recordset.map(mapItem);
}

export async function getKnowledgeItem(params: {
  businessId: string;
  knowledgeItemId: string;
}): Promise<KnowledgeItem | null> {
  const result = await query<KnowledgeItemRow>(
    `SELECT KnowledgeItemID, KnowledgeBaseID, BusinessID, Category, Title, Content,
            IsActive, CreatedAtUtc, UpdatedAtUtc
     FROM TblKnowledgeItem
     WHERE BusinessID = @businessId AND KnowledgeItemID = @knowledgeItemId`,
    [
      {
        name: "businessId",
        type: sql.UniqueIdentifier,
        value: params.businessId,
      },
      {
        name: "knowledgeItemId",
        type: sql.UniqueIdentifier,
        value: params.knowledgeItemId,
      },
    ],
  );
  const row = result.recordset[0];
  return row ? mapItem(row) : null;
}

export async function createKnowledgeItem(params: {
  businessId: string;
  knowledgeBaseId: string;
  category: KnowledgeCategory;
  title: string;
  content: string;
  isActive?: boolean;
}): Promise<KnowledgeItem> {
  const knowledgeItemId = randomUUID();
  const now = new Date();
  const isActive = params.isActive ?? true;

  await query(
    `INSERT INTO TblKnowledgeItem (
      KnowledgeItemID, KnowledgeBaseID, BusinessID, Category, Title, Content,
      IsActive, CreatedAtUtc, UpdatedAtUtc
    ) VALUES (
      @knowledgeItemId, @knowledgeBaseId, @businessId, @category, @title, @content,
      @isActive, @createdAtUtc, @updatedAtUtc
    )`,
    [
      {
        name: "knowledgeItemId",
        type: sql.UniqueIdentifier,
        value: knowledgeItemId,
      },
      {
        name: "knowledgeBaseId",
        type: sql.UniqueIdentifier,
        value: params.knowledgeBaseId,
      },
      {
        name: "businessId",
        type: sql.UniqueIdentifier,
        value: params.businessId,
      },
      { name: "category", type: sql.NVarChar(32), value: params.category },
      { name: "title", type: sql.NVarChar(300), value: params.title },
      {
        name: "content",
        type: sql.NVarChar(sql.MAX),
        value: params.content,
      },
      { name: "isActive", type: sql.Bit, value: isActive },
      { name: "createdAtUtc", type: sql.DateTime2, value: now },
      { name: "updatedAtUtc", type: sql.DateTime2, value: now },
    ],
  );

  return {
    knowledgeItemId,
    knowledgeBaseId: params.knowledgeBaseId,
    businessId: params.businessId,
    category: params.category,
    title: params.title,
    content: params.content,
    isActive,
    createdAtUtc: now,
    updatedAtUtc: now,
  };
}

export async function updateKnowledgeItem(params: {
  businessId: string;
  knowledgeItemId: string;
  category?: KnowledgeCategory;
  title?: string;
  content?: string;
  isActive?: boolean;
}): Promise<KnowledgeItem | null> {
  const existing = await getKnowledgeItem({
    businessId: params.businessId,
    knowledgeItemId: params.knowledgeItemId,
  });
  if (!existing) {
    return null;
  }

  const next = {
    category: params.category ?? existing.category,
    title: params.title ?? existing.title,
    content: params.content ?? existing.content,
    isActive: params.isActive ?? existing.isActive,
  };
  const now = new Date();

  await query(
    `UPDATE TblKnowledgeItem
     SET Category = @category,
         Title = @title,
         Content = @content,
         IsActive = @isActive,
         UpdatedAtUtc = @updatedAtUtc
     WHERE BusinessID = @businessId AND KnowledgeItemID = @knowledgeItemId`,
    [
      {
        name: "businessId",
        type: sql.UniqueIdentifier,
        value: params.businessId,
      },
      {
        name: "knowledgeItemId",
        type: sql.UniqueIdentifier,
        value: params.knowledgeItemId,
      },
      { name: "category", type: sql.NVarChar(32), value: next.category },
      { name: "title", type: sql.NVarChar(300), value: next.title },
      {
        name: "content",
        type: sql.NVarChar(sql.MAX),
        value: next.content,
      },
      { name: "isActive", type: sql.Bit, value: next.isActive },
      { name: "updatedAtUtc", type: sql.DateTime2, value: now },
    ],
  );

  return { ...existing, ...next, updatedAtUtc: now };
}
