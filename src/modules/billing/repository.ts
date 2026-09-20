import { randomUUID } from "node:crypto";

import { query, sql, type TransactionClient } from "@/lib/db";
import { normalizeUuid } from "@/lib/ids/uuid";
import type { Plan, Subscription, SubscriptionStatus } from "@/types/domain";

type PlanRow = {
  PlanID: string;
  Code: string;
  DisplayName: string;
  Status: string;
  MaxWhatsAppConnections: number | null;
  MaxAgents: number | null;
  MaxActiveKnowledgeItems: number | null;
  MonthlyAiReplies: number | null;
  MonthlyWhatsAppOutbound: number | null;
  CreatedAtUtc: Date;
  UpdatedAtUtc: Date;
};

type SubscriptionRow = {
  SubscriptionID: string;
  BusinessID: string;
  PlanID: string;
  Status: string;
  PeriodStartUtc: Date | null;
  PeriodEndUtc: Date | null;
  CreatedAtUtc: Date;
  UpdatedAtUtc: Date;
};

function db(trx?: TransactionClient) {
  return {
    query: trx?.query.bind(trx) ?? query,
  };
}

function mapPlan(row: PlanRow): Plan {
  return {
    planId: normalizeUuid(row.PlanID),
    code: row.Code,
    displayName: row.DisplayName,
    status: row.Status as Plan["status"],
    maxWhatsAppConnections:
      row.MaxWhatsAppConnections == null
        ? null
        : Number(row.MaxWhatsAppConnections),
    maxAgents: row.MaxAgents == null ? null : Number(row.MaxAgents),
    maxActiveKnowledgeItems:
      row.MaxActiveKnowledgeItems == null
        ? null
        : Number(row.MaxActiveKnowledgeItems),
    monthlyAiReplies:
      row.MonthlyAiReplies == null ? null : Number(row.MonthlyAiReplies),
    monthlyWhatsAppOutbound:
      row.MonthlyWhatsAppOutbound == null
        ? null
        : Number(row.MonthlyWhatsAppOutbound),
    createdAtUtc: row.CreatedAtUtc,
    updatedAtUtc: row.UpdatedAtUtc,
  };
}

function mapSubscription(row: SubscriptionRow): Subscription {
  return {
    subscriptionId: normalizeUuid(row.SubscriptionID),
    businessId: normalizeUuid(row.BusinessID),
    planId: normalizeUuid(row.PlanID),
    status: row.Status as SubscriptionStatus,
    periodStartUtc: row.PeriodStartUtc,
    periodEndUtc: row.PeriodEndUtc,
    createdAtUtc: row.CreatedAtUtc,
    updatedAtUtc: row.UpdatedAtUtc,
  };
}

const PLAN_SELECT = `
  PlanID, Code, DisplayName, Status,
  MaxWhatsAppConnections, MaxAgents, MaxActiveKnowledgeItems,
  MonthlyAiReplies, MonthlyWhatsAppOutbound,
  CreatedAtUtc, UpdatedAtUtc`;

export async function getPlanByCode(
  code: string,
  trx?: TransactionClient,
): Promise<Plan | null> {
  const result = await db(trx).query<PlanRow>(
    `SELECT ${PLAN_SELECT} FROM TblPlan WHERE Code = @code`,
    [{ name: "code", type: sql.NVarChar(64), value: code }],
  );
  const row = result.recordset[0];
  return row ? mapPlan(row) : null;
}

export async function getSubscriptionByBusinessId(params: {
  businessId: string;
}): Promise<Subscription | null> {
  const result = await query<SubscriptionRow>(
    `SELECT TOP 1 SubscriptionID, BusinessID, PlanID, Status,
            PeriodStartUtc, PeriodEndUtc, CreatedAtUtc, UpdatedAtUtc
     FROM TblSubscription
     WHERE BusinessID = @businessId
     ORDER BY CreatedAtUtc DESC`,
    [
      {
        name: "businessId",
        type: sql.UniqueIdentifier,
        value: params.businessId,
      },
    ],
  );
  const row = result.recordset[0];
  return row ? mapSubscription(row) : null;
}

export async function insertSubscription(
  params: {
    businessId: string;
    planId: string;
    status?: SubscriptionStatus;
  },
  trx?: TransactionClient,
): Promise<Subscription> {
  const subscriptionId = randomUUID();
  const now = new Date();
  const status = params.status ?? "ACTIVE";

  await db(trx).query(
    `INSERT INTO TblSubscription (
      SubscriptionID, BusinessID, PlanID, Status,
      PeriodStartUtc, PeriodEndUtc, CreatedAtUtc, UpdatedAtUtc
    ) VALUES (
      @subscriptionId, @businessId, @planId, @status,
      @periodStartUtc, NULL, @createdAtUtc, @updatedAtUtc
    )`,
    [
      {
        name: "subscriptionId",
        type: sql.UniqueIdentifier,
        value: subscriptionId,
      },
      {
        name: "businessId",
        type: sql.UniqueIdentifier,
        value: params.businessId,
      },
      { name: "planId", type: sql.UniqueIdentifier, value: params.planId },
      { name: "status", type: sql.NVarChar(32), value: status },
      { name: "periodStartUtc", type: sql.DateTime2, value: now },
      { name: "createdAtUtc", type: sql.DateTime2, value: now },
      { name: "updatedAtUtc", type: sql.DateTime2, value: now },
    ],
  );

  return {
    subscriptionId,
    businessId: params.businessId,
    planId: params.planId,
    status,
    periodStartUtc: now,
    periodEndUtc: null,
    createdAtUtc: now,
    updatedAtUtc: now,
  };
}
