import { createHash, randomUUID } from "node:crypto";

import { isUniqueViolationError, query, sql, type QueryInput, type TransactionClient } from "@/lib/db";
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
  MonthlyPriceAmount: number | null;
  CurrencyCode: string | null;
  BillingInterval: string | null;
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
  ProviderName: string | null;
  ExternalCustomerId: string | null;
  ExternalSubscriptionId: string | null;
  CreatedAtUtc: Date;
  UpdatedAtUtc: Date;
};

export type BillingWebhookInsertResult =
  | { inserted: true; billingWebhookEventId: string }
  | { inserted: false; duplicate: true };

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
    monthlyPriceAmount:
      row.MonthlyPriceAmount == null ? null : Number(row.MonthlyPriceAmount),
    currencyCode: row.CurrencyCode,
    billingInterval:
      row.BillingInterval === "MONTHLY" ? "MONTHLY" : null,
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
    providerName: row.ProviderName,
    externalCustomerId: row.ExternalCustomerId,
    externalSubscriptionId: row.ExternalSubscriptionId,
    createdAtUtc: row.CreatedAtUtc,
    updatedAtUtc: row.UpdatedAtUtc,
  };
}

const PLAN_SELECT = `
  PlanID, Code, DisplayName, Status,
  MaxWhatsAppConnections, MaxAgents, MaxActiveKnowledgeItems,
  MonthlyAiReplies, MonthlyWhatsAppOutbound,
  MonthlyPriceAmount, CurrencyCode, BillingInterval,
  CreatedAtUtc, UpdatedAtUtc`;

const SUBSCRIPTION_SELECT = `
  SubscriptionID, BusinessID, PlanID, Status,
  PeriodStartUtc, PeriodEndUtc,
  ProviderName, ExternalCustomerId, ExternalSubscriptionId,
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

export async function listActivePlans(
  trx?: TransactionClient,
): Promise<Plan[]> {
  const result = await db(trx).query<PlanRow>(
    `SELECT ${PLAN_SELECT}
     FROM TblPlan
     WHERE Status = N'ACTIVE'
     ORDER BY
       CASE Code
         WHEN N'FREE' THEN 0
         WHEN N'STARTER' THEN 1
         WHEN N'PRO' THEN 2
         WHEN N'BUSINESS' THEN 3
         ELSE 99
       END,
       Code`,
  );
  return result.recordset.map(mapPlan);
}

export async function getSubscriptionByBusinessId(params: {
  businessId: string;
}): Promise<Subscription | null> {
  const result = await query<SubscriptionRow>(
    `SELECT TOP 1 ${SUBSCRIPTION_SELECT}
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

export async function findSubscriptionByExternalId(params: {
  externalSubscriptionId: string;
}): Promise<Subscription | null> {
  const result = await query<SubscriptionRow>(
    `SELECT TOP 1 ${SUBSCRIPTION_SELECT}
     FROM TblSubscription
     WHERE ExternalSubscriptionId = @externalSubscriptionId`,
    [
      {
        name: "externalSubscriptionId",
        type: sql.NVarChar(200),
        value: params.externalSubscriptionId,
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
    periodStartUtc?: Date;
    periodEndUtc?: Date | null;
    providerName?: string | null;
  },
  trx?: TransactionClient,
): Promise<Subscription> {
  const subscriptionId = randomUUID();
  const now = new Date();
  const status = params.status ?? "ACTIVE";
  const periodStartUtc = params.periodStartUtc ?? now;
  const periodEndUtc =
    params.periodEndUtc === undefined ? null : params.periodEndUtc;
  const providerName = params.providerName ?? null;

  await db(trx).query(
    `INSERT INTO TblSubscription (
      SubscriptionID, BusinessID, PlanID, Status,
      PeriodStartUtc, PeriodEndUtc, ProviderName,
      CreatedAtUtc, UpdatedAtUtc
    ) VALUES (
      @subscriptionId, @businessId, @planId, @status,
      @periodStartUtc, @periodEndUtc, @providerName,
      @createdAtUtc, @updatedAtUtc
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
      { name: "periodStartUtc", type: sql.DateTime2, value: periodStartUtc },
      { name: "periodEndUtc", type: sql.DateTime2, value: periodEndUtc },
      { name: "providerName", type: sql.NVarChar(64), value: providerName },
      { name: "createdAtUtc", type: sql.DateTime2, value: now },
      { name: "updatedAtUtc", type: sql.DateTime2, value: now },
    ],
  );

  return {
    subscriptionId,
    businessId: params.businessId,
    planId: params.planId,
    status,
    periodStartUtc,
    periodEndUtc,
    providerName,
    externalCustomerId: null,
    externalSubscriptionId: null,
    createdAtUtc: now,
    updatedAtUtc: now,
  };
}

export async function updateSubscriptionBillingFields(
  params: {
    subscriptionId: string;
    status?: SubscriptionStatus;
    planId?: string;
    providerName?: string | null;
    externalCustomerId?: string | null;
    externalSubscriptionId?: string | null;
    periodStartUtc?: Date | null;
    periodEndUtc?: Date | null;
  },
  trx?: TransactionClient,
): Promise<void> {
  const sets: string[] = ["UpdatedAtUtc = @updatedAtUtc"];
  const values: QueryInput[] = [
    {
      name: "subscriptionId",
      type: sql.UniqueIdentifier,
      value: params.subscriptionId,
    },
    { name: "updatedAtUtc", type: sql.DateTime2, value: new Date() },
  ];

  if (params.status !== undefined) {
    sets.push("Status = @status");
    values.push({ name: "status", type: sql.NVarChar(32), value: params.status });
  }
  if (params.planId !== undefined) {
    sets.push("PlanID = @planId");
    values.push({
      name: "planId",
      type: sql.UniqueIdentifier,
      value: params.planId,
    });
  }
  if (params.providerName !== undefined) {
    sets.push("ProviderName = @providerName");
    values.push({
      name: "providerName",
      type: sql.NVarChar(64),
      value: params.providerName,
    });
  }
  if (params.externalCustomerId !== undefined) {
    sets.push("ExternalCustomerId = @externalCustomerId");
    values.push({
      name: "externalCustomerId",
      type: sql.NVarChar(200),
      value: params.externalCustomerId,
    });
  }
  if (params.externalSubscriptionId !== undefined) {
    sets.push("ExternalSubscriptionId = @externalSubscriptionId");
    values.push({
      name: "externalSubscriptionId",
      type: sql.NVarChar(200),
      value: params.externalSubscriptionId,
    });
  }
  if (params.periodStartUtc !== undefined) {
    sets.push("PeriodStartUtc = @periodStartUtc");
    values.push({
      name: "periodStartUtc",
      type: sql.DateTime2,
      value: params.periodStartUtc,
    });
  }
  if (params.periodEndUtc !== undefined) {
    sets.push("PeriodEndUtc = @periodEndUtc");
    values.push({
      name: "periodEndUtc",
      type: sql.DateTime2,
      value: params.periodEndUtc,
    });
  }

  await db(trx).query(
    `UPDATE TblSubscription SET ${sets.join(", ")} WHERE SubscriptionID = @subscriptionId`,
    values,
  );
}

export function digestWebhookPayload(rawBody: string): string {
  return createHash("sha256").update(rawBody, "utf8").digest("hex");
}

/**
 * Idempotent insert by (ProviderName, ProviderEventId) unique constraint.
 * Returns duplicate when the event was already recorded.
 */
export async function tryInsertWebhookEvent(params: {
  providerName: string;
  providerEventId: string;
  eventType: string;
  payloadDigest: string;
  outcome: "APPLIED" | "DUPLICATE" | "IGNORED" | "FAILED";
  errorSummary?: string | null;
}): Promise<BillingWebhookInsertResult> {
  const billingWebhookEventId = randomUUID();
  const now = new Date();

  try {
    await query(
      `INSERT INTO TblBillingWebhookEvent (
        BillingWebhookEventID, ProviderName, ProviderEventId, EventType,
        PayloadDigest, ProcessedAtUtc, CreatedAtUtc, Outcome, ErrorSummary
      ) VALUES (
        @id, @providerName, @providerEventId, @eventType,
        @payloadDigest, @processedAtUtc, @createdAtUtc, @outcome, @errorSummary
      )`,
      [
        {
          name: "id",
          type: sql.UniqueIdentifier,
          value: billingWebhookEventId,
        },
        {
          name: "providerName",
          type: sql.NVarChar(64),
          value: params.providerName,
        },
        {
          name: "providerEventId",
          type: sql.NVarChar(200),
          value: params.providerEventId,
        },
        {
          name: "eventType",
          type: sql.NVarChar(128),
          value: params.eventType,
        },
        {
          name: "payloadDigest",
          type: sql.NVarChar(128),
          value: params.payloadDigest,
        },
        { name: "processedAtUtc", type: sql.DateTime2, value: now },
        { name: "createdAtUtc", type: sql.DateTime2, value: now },
        {
          name: "outcome",
          type: sql.NVarChar(32),
          value: params.outcome,
        },
        {
          name: "errorSummary",
          type: sql.NVarChar(500),
          value: params.errorSummary ?? null,
        },
      ],
    );
    return { inserted: true, billingWebhookEventId };
  } catch (error) {
    if (isUniqueViolationError(error)) {
      return { inserted: false, duplicate: true };
    }
    throw error;
  }
}
