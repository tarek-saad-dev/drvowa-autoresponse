/**
 * Durable plan entitlement resolution, quota reserve/consume/release,
 * and atomic resource-limit creates.
 */

import { randomUUID } from "node:crypto";

import {
  query,
  sql,
  withTransaction,
  type TransactionClient,
} from "@/lib/db";
import { normalizeUuid } from "@/lib/ids/uuid";
import type { Plan, Subscription, SubscriptionStatus } from "@/types/domain";

import {
  PLAN_ERROR_CODES,
  PlanEntitlementError,
} from "./errors";
import {
  resolveUtcMonthPeriod,
  USAGE_EVENT_AI_REPLY,
  USAGE_EVENT_WHATSAPP_OUTBOUND,
  type UsagePeriodWindow,
} from "./period";
import { ensureCurrentSubscriptionEntitlements } from "./subscription-entitlement-lifecycle";

export type PlanLimits = {
  maxWhatsAppConnections: number | null;
  maxAgents: number | null;
  maxActiveKnowledgeItems: number | null;
  monthlyAiReplies: number | null;
  monthlyWhatsAppOutbound: number | null;
};

export type EntitlementSnapshot = {
  subscription: Subscription | null;
  plan: (Plan & PlanLimits) | null;
  usagePeriod: UsagePeriodWindow;
  aiUsed: number;
  whatsappOutboundUsed: number;
  whatsappConnectionsUsed: number;
  agentsUsed: number;
  activeKnowledgeUsed: number;
  canAct: boolean;
  blockReason: string | null;
};

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
  CreatedAtUtc: Date;
  UpdatedAtUtc: Date;
};

type ReservationRow = {
  UsageReservationID: string;
  BusinessID: string;
  EventType: string;
  ReservationKey: string;
  PeriodStartUtc: Date;
  Quantity: number;
  State: string;
};

const CURRENT_STATUSES = ["ACTIVE", "TRIALING", "PAST_DUE"] as const;
const USABLE_STATUSES = new Set(["ACTIVE", "TRIALING"]);

function db(trx?: TransactionClient) {
  return {
    query: trx?.query.bind(trx) ?? query,
    execute: trx
      ? trx.execute.bind(trx)
      : async (text: string, inputs?: Parameters<typeof query>[1]) => {
          const r = await query(text, inputs);
          return r.rowsAffected[0] ?? 0;
        },
  };
}

function mapPlan(row: PlanRow): Plan & PlanLimits {
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

export async function getPlanByCode(
  code: string,
  trx?: TransactionClient,
): Promise<(Plan & PlanLimits) | null> {
  const result = await db(trx).query<PlanRow>(
    `SELECT ${PLAN_SELECT} FROM TblPlan WHERE Code = @code`,
    [{ name: "code", type: sql.NVarChar(64), value: code }],
  );
  const row = result.recordset[0];
  return row ? mapPlan(row) : null;
}

export async function getPlanById(
  planId: string,
  trx?: TransactionClient,
): Promise<(Plan & PlanLimits) | null> {
  const result = await db(trx).query<PlanRow>(
    `SELECT ${PLAN_SELECT} FROM TblPlan WHERE PlanID = @planId`,
    [{ name: "planId", type: sql.UniqueIdentifier, value: planId }],
  );
  const row = result.recordset[0];
  return row ? mapPlan(row) : null;
}

/** Current subscription among ACTIVE/TRIALING/PAST_DUE (at most one). */
export async function getCurrentSubscription(
  businessId: string,
  trx?: TransactionClient,
): Promise<Subscription | null> {
  const result = await db(trx).query<SubscriptionRow>(
    `SELECT TOP 1 SubscriptionID, BusinessID, PlanID, Status,
            PeriodStartUtc, PeriodEndUtc, CreatedAtUtc, UpdatedAtUtc
     FROM TblSubscription
     WHERE BusinessID = @businessId
       AND Status IN (N'ACTIVE', N'TRIALING', N'PAST_DUE')
     ORDER BY CreatedAtUtc DESC`,
    [
      {
        name: "businessId",
        type: sql.UniqueIdentifier,
        value: businessId,
      },
    ],
  );
  const row = result.recordset[0];
  return row ? mapSubscription(row) : null;
}

/** Latest subscription of any status (display/history). */
export async function getLatestSubscription(
  businessId: string,
  trx?: TransactionClient,
): Promise<Subscription | null> {
  const result = await db(trx).query<SubscriptionRow>(
    `SELECT TOP 1 SubscriptionID, BusinessID, PlanID, Status,
            PeriodStartUtc, PeriodEndUtc, CreatedAtUtc, UpdatedAtUtc
     FROM TblSubscription
     WHERE BusinessID = @businessId
     ORDER BY CreatedAtUtc DESC`,
    [
      {
        name: "businessId",
        type: sql.UniqueIdentifier,
        value: businessId,
      },
    ],
  );
  const row = result.recordset[0];
  return row ? mapSubscription(row) : null;
}

function assertCanAct(
  subscription: Subscription | null,
  plan: (Plan & PlanLimits) | null,
): void {
  if (!subscription || !USABLE_STATUSES.has(subscription.status)) {
    throw new PlanEntitlementError(PLAN_ERROR_CODES.SUBSCRIPTION_INACTIVE);
  }
  if (!plan || plan.status !== "ACTIVE") {
    throw new PlanEntitlementError(PLAN_ERROR_CODES.SUBSCRIPTION_INACTIVE);
  }
}

/**
 * Resolve usable subscription + plan inside an existing transaction.
 * Applies paid-expiry lifecycle without opening a nested transaction.
 */
export async function requireUsablePlanInTransaction(
  businessId: string,
  trx: TransactionClient,
): Promise<{
  subscription: Subscription;
  plan: Plan & PlanLimits;
}> {
  const { subscription } = await ensureCurrentSubscriptionEntitlements(
    businessId,
    trx,
  );
  const plan = subscription
    ? await getPlanById(subscription.planId, trx)
    : null;
  assertCanAct(subscription, plan);
  return { subscription: subscription!, plan: plan! };
}

async function getCounterQuantity(
  params: {
    businessId: string;
    eventType: string;
    periodStartUtc: Date;
  },
  trx?: TransactionClient,
): Promise<number> {
  const result = await db(trx).query<{ Quantity: number }>(
    `SELECT Quantity FROM TblUsagePeriodCounter
     WHERE BusinessID = @businessId
       AND EventType = @eventType
       AND PeriodStartUtc = @periodStartUtc`,
    [
      {
        name: "businessId",
        type: sql.UniqueIdentifier,
        value: params.businessId,
      },
      { name: "eventType", type: sql.NVarChar(64), value: params.eventType },
      {
        name: "periodStartUtc",
        type: sql.DateTime2,
        value: params.periodStartUtc,
      },
    ],
  );
  return Number(result.recordset[0]?.Quantity ?? 0);
}

export async function countAgents(
  businessId: string,
  trx?: TransactionClient,
): Promise<number> {
  const result = await db(trx).query<{ Cnt: number }>(
    `SELECT COUNT(1) AS Cnt FROM TblAgent WHERE BusinessID = @businessId`,
    [
      {
        name: "businessId",
        type: sql.UniqueIdentifier,
        value: businessId,
      },
    ],
  );
  return Number(result.recordset[0]?.Cnt ?? 0);
}

export async function countActiveKnowledge(
  businessId: string,
  trx?: TransactionClient,
): Promise<number> {
  const result = await db(trx).query<{ Cnt: number }>(
    `SELECT COUNT(1) AS Cnt FROM TblKnowledgeItem
     WHERE BusinessID = @businessId AND IsActive = 1`,
    [
      {
        name: "businessId",
        type: sql.UniqueIdentifier,
        value: businessId,
      },
    ],
  );
  return Number(result.recordset[0]?.Cnt ?? 0);
}

export async function countWhatsAppConnections(
  businessId: string,
  trx?: TransactionClient,
): Promise<number> {
  const result = await db(trx).query<{ Cnt: number }>(
    `SELECT COUNT(1) AS Cnt FROM TblChannelConnection
     WHERE BusinessID = @businessId
       AND Channel = N'WHATSAPP'
       AND Provider = N'BAILEYS'`,
    [
      {
        name: "businessId",
        type: sql.UniqueIdentifier,
        value: businessId,
      },
    ],
  );
  return Number(result.recordset[0]?.Cnt ?? 0);
}

export async function getEntitlementSnapshot(
  businessId: string,
): Promise<EntitlementSnapshot> {
  const { subscription: current } =
    await ensureCurrentSubscriptionEntitlements(businessId);

  const usagePeriod = resolveUtcMonthPeriod();
  const subscription = current ?? (await getLatestSubscription(businessId));
  const resolvedPlan = subscription
    ? await getPlanById(subscription.planId)
    : null;

  const canAct = Boolean(
    current
    && USABLE_STATUSES.has(current.status)
    && resolvedPlan
    && resolvedPlan.status === "ACTIVE",
  );

  let blockReason: string | null = null;
  if (!current) {
    blockReason = PLAN_ERROR_CODES.SUBSCRIPTION_INACTIVE;
  } else if (current.status === "PAST_DUE") {
    blockReason = PLAN_ERROR_CODES.SUBSCRIPTION_INACTIVE;
  } else if (!canAct) {
    blockReason = PLAN_ERROR_CODES.SUBSCRIPTION_INACTIVE;
  }

  const [aiUsed, whatsappOutboundUsed, whatsappConnectionsUsed, agentsUsed, activeKnowledgeUsed] =
    await Promise.all([
      getCounterQuantity({
        businessId,
        eventType: USAGE_EVENT_AI_REPLY,
        periodStartUtc: usagePeriod.usagePeriodStartUtc,
      }),
      getCounterQuantity({
        businessId,
        eventType: USAGE_EVENT_WHATSAPP_OUTBOUND,
        periodStartUtc: usagePeriod.usagePeriodStartUtc,
      }),
      countWhatsAppConnections(businessId),
      countAgents(businessId),
      countActiveKnowledge(businessId),
    ]);

  return {
    subscription,
    plan: resolvedPlan,
    usagePeriod,
    aiUsed,
    whatsappOutboundUsed,
    whatsappConnectionsUsed,
    agentsUsed,
    activeKnowledgeUsed,
    canAct,
    blockReason,
  };
}

/**
 * Fast read-only check: whether AI quota appears exhausted this month.
 * Not the authoritative concurrency gate — use reserveQuota.
 */
export async function isAiQuotaLikelyExhausted(
  businessId: string,
): Promise<boolean> {
  const snap = await getEntitlementSnapshot(businessId);
  if (!snap.canAct || !snap.plan) return true;
  if (snap.plan.monthlyAiReplies == null) return false;
  return snap.aiUsed >= snap.plan.monthlyAiReplies;
}

export type ReserveQuotaResult = {
  reservationId: string;
  state: "RESERVED" | "CONSUMED" | "UNCERTAIN";
  idempotent: boolean;
  periodStartUtc: Date;
};

function monthlyLimitFor(
  plan: Plan & PlanLimits,
  eventType: string,
): number | null {
  if (eventType === USAGE_EVENT_AI_REPLY) return plan.monthlyAiReplies;
  if (eventType === USAGE_EVENT_WHATSAPP_OUTBOUND) {
    return plan.monthlyWhatsAppOutbound;
  }
  return null;
}

function quotaErrorFor(eventType: string): never {
  if (eventType === USAGE_EVENT_WHATSAPP_OUTBOUND) {
    throw new PlanEntitlementError(
      PLAN_ERROR_CODES.WHATSAPP_OUTBOUND_QUOTA_EXCEEDED,
    );
  }
  throw new PlanEntitlementError(PLAN_ERROR_CODES.AI_QUOTA_EXCEEDED);
}

/**
 * Durable idempotent quota reservation. Counter = commitments.
 */
export async function reserveQuota(params: {
  businessId: string;
  eventType: string;
  reservationKey: string;
  quantity?: number;
}): Promise<ReserveQuotaResult> {
  const quantity = params.quantity ?? 1;
  if (quantity < 1) {
    throw new Error("quantity must be >= 1");
  }
  const period = resolveUtcMonthPeriod();

  return withTransaction(async (trx) => {
    const { subscription } = await ensureCurrentSubscriptionEntitlements(
      params.businessId,
      trx,
    );
    const plan = subscription
      ? await getPlanById(subscription.planId, trx)
      : null;
    assertCanAct(subscription, plan);
    const limit = monthlyLimitFor(plan!, params.eventType);

    const existing = await trx.query<ReservationRow>(
      `SELECT UsageReservationID, BusinessID, EventType, ReservationKey,
              PeriodStartUtc, Quantity, State
       FROM TblUsageReservation WITH (UPDLOCK, HOLDLOCK, ROWLOCK)
       WHERE BusinessID = @businessId
         AND EventType = @eventType
         AND ReservationKey = @reservationKey`,
      [
        {
          name: "businessId",
          type: sql.UniqueIdentifier,
          value: params.businessId,
        },
        {
          name: "eventType",
          type: sql.NVarChar(64),
          value: params.eventType,
        },
        {
          name: "reservationKey",
          type: sql.NVarChar(200),
          value: params.reservationKey,
        },
      ],
    );
    const row = existing.recordset[0];
    if (row) {
      const state = row.State as ReserveQuotaResult["state"] | "RELEASED";
      if (
        state === "RESERVED"
        || state === "CONSUMED"
        || state === "UNCERTAIN"
      ) {
        return {
          reservationId: normalizeUuid(row.UsageReservationID),
          state,
          idempotent: true,
          periodStartUtc: row.PeriodStartUtc,
        };
      }
      // RELEASED → re-reserve below (same key, new commitment)
    }

    // Ensure counter row exists then lock it.
    await trx.execute(
      `IF NOT EXISTS (
         SELECT 1 FROM TblUsagePeriodCounter WITH (UPDLOCK, HOLDLOCK)
         WHERE BusinessID = @businessId
           AND EventType = @eventType
           AND PeriodStartUtc = @periodStartUtc
       )
       INSERT INTO TblUsagePeriodCounter (
         BusinessID, EventType, PeriodStartUtc, Quantity, UpdatedAtUtc
       ) VALUES (
         @businessId, @eventType, @periodStartUtc, 0, SYSUTCDATETIME()
       )`,
      [
        {
          name: "businessId",
          type: sql.UniqueIdentifier,
          value: params.businessId,
        },
        {
          name: "eventType",
          type: sql.NVarChar(64),
          value: params.eventType,
        },
        {
          name: "periodStartUtc",
          type: sql.DateTime2,
          value: period.usagePeriodStartUtc,
        },
      ],
    );

    const counter = await trx.query<{ Quantity: number }>(
      `SELECT Quantity
       FROM TblUsagePeriodCounter WITH (UPDLOCK, HOLDLOCK, ROWLOCK)
       WHERE BusinessID = @businessId
         AND EventType = @eventType
         AND PeriodStartUtc = @periodStartUtc`,
      [
        {
          name: "businessId",
          type: sql.UniqueIdentifier,
          value: params.businessId,
        },
        {
          name: "eventType",
          type: sql.NVarChar(64),
          value: params.eventType,
        },
        {
          name: "periodStartUtc",
          type: sql.DateTime2,
          value: period.usagePeriodStartUtc,
        },
      ],
    );
    const currentQty = Number(counter.recordset[0]?.Quantity ?? 0);
    if (limit != null && currentQty + quantity > limit) {
      quotaErrorFor(params.eventType);
    }

    await trx.execute(
      `UPDATE TblUsagePeriodCounter
       SET Quantity = Quantity + @quantity,
           UpdatedAtUtc = SYSUTCDATETIME()
       WHERE BusinessID = @businessId
         AND EventType = @eventType
         AND PeriodStartUtc = @periodStartUtc`,
      [
        {
          name: "businessId",
          type: sql.UniqueIdentifier,
          value: params.businessId,
        },
        {
          name: "eventType",
          type: sql.NVarChar(64),
          value: params.eventType,
        },
        {
          name: "periodStartUtc",
          type: sql.DateTime2,
          value: period.usagePeriodStartUtc,
        },
        { name: "quantity", type: sql.Int, value: quantity },
      ],
    );

    const reservationId = row
      ? normalizeUuid(row.UsageReservationID)
      : randomUUID();

    if (row) {
      await trx.execute(
        `UPDATE TblUsageReservation
         SET State = N'RESERVED',
             PeriodStartUtc = @periodStartUtc,
             Quantity = @quantity,
             UpdatedAtUtc = SYSUTCDATETIME()
         WHERE UsageReservationID = @reservationId`,
        [
          {
            name: "reservationId",
            type: sql.UniqueIdentifier,
            value: reservationId,
          },
          {
            name: "periodStartUtc",
            type: sql.DateTime2,
            value: period.usagePeriodStartUtc,
          },
          { name: "quantity", type: sql.Int, value: quantity },
        ],
      );
    } else {
      await trx.execute(
        `INSERT INTO TblUsageReservation (
           UsageReservationID, BusinessID, EventType, ReservationKey,
           PeriodStartUtc, Quantity, State, CreatedAtUtc, UpdatedAtUtc
         ) VALUES (
           @reservationId, @businessId, @eventType, @reservationKey,
           @periodStartUtc, @quantity, N'RESERVED', SYSUTCDATETIME(), SYSUTCDATETIME()
         )`,
        [
          {
            name: "reservationId",
            type: sql.UniqueIdentifier,
            value: reservationId,
          },
          {
            name: "businessId",
            type: sql.UniqueIdentifier,
            value: params.businessId,
          },
          {
            name: "eventType",
            type: sql.NVarChar(64),
            value: params.eventType,
          },
          {
            name: "reservationKey",
            type: sql.NVarChar(200),
            value: params.reservationKey,
          },
          {
            name: "periodStartUtc",
            type: sql.DateTime2,
            value: period.usagePeriodStartUtc,
          },
          { name: "quantity", type: sql.Int, value: quantity },
        ],
      );
    }

    return {
      reservationId,
      state: "RESERVED",
      idempotent: false,
      periodStartUtc: period.usagePeriodStartUtc,
    };
  });
}

export async function consumeQuotaReservation(params: {
  businessId: string;
  eventType: string;
  reservationKey: string;
  metadata?: Record<string, unknown> | null;
  trx?: TransactionClient;
}): Promise<void> {
  const run = async (trx: TransactionClient) => {
    const existing = await trx.query<ReservationRow>(
      `SELECT UsageReservationID, BusinessID, EventType, ReservationKey,
              PeriodStartUtc, Quantity, State
       FROM TblUsageReservation WITH (UPDLOCK, HOLDLOCK, ROWLOCK)
       WHERE BusinessID = @businessId
         AND EventType = @eventType
         AND ReservationKey = @reservationKey`,
      [
        {
          name: "businessId",
          type: sql.UniqueIdentifier,
          value: params.businessId,
        },
        {
          name: "eventType",
          type: sql.NVarChar(64),
          value: params.eventType,
        },
        {
          name: "reservationKey",
          type: sql.NVarChar(200),
          value: params.reservationKey,
        },
      ],
    );
    const row = existing.recordset[0];
    if (!row) {
      throw new Error("quota reservation not found for consume");
    }
    if (row.State === "CONSUMED") {
      // Ensure audit event exists (idempotent).
      await insertUsageEventIdempotent(
        {
          businessId: params.businessId,
          eventType: params.eventType,
          quantity: Number(row.Quantity),
          usageKey: params.reservationKey,
          metadata: params.metadata ?? null,
        },
        trx,
      );
      return;
    }
    if (row.State === "RELEASED") {
      throw new Error("cannot consume released reservation");
    }

    await trx.execute(
      `UPDATE TblUsageReservation
       SET State = N'CONSUMED',
           UpdatedAtUtc = SYSUTCDATETIME()
       WHERE UsageReservationID = @id`,
      [
        {
          name: "id",
          type: sql.UniqueIdentifier,
          value: row.UsageReservationID,
        },
      ],
    );

    // Counter already includes this commitment — do not increment again.
    await insertUsageEventIdempotent(
      {
        businessId: params.businessId,
        eventType: params.eventType,
        quantity: Number(row.Quantity),
        usageKey: params.reservationKey,
        metadata: params.metadata ?? null,
      },
      trx,
    );
  };

  if (params.trx) {
    await run(params.trx);
    return;
  }
  await withTransaction(run);
}

export async function releaseQuotaReservation(params: {
  businessId: string;
  eventType: string;
  reservationKey: string;
}): Promise<void> {
  await withTransaction(async (trx) => {
    const existing = await trx.query<ReservationRow>(
      `SELECT UsageReservationID, BusinessID, EventType, ReservationKey,
              PeriodStartUtc, Quantity, State
       FROM TblUsageReservation WITH (UPDLOCK, HOLDLOCK, ROWLOCK)
       WHERE BusinessID = @businessId
         AND EventType = @eventType
         AND ReservationKey = @reservationKey`,
      [
        {
          name: "businessId",
          type: sql.UniqueIdentifier,
          value: params.businessId,
        },
        {
          name: "eventType",
          type: sql.NVarChar(64),
          value: params.eventType,
        },
        {
          name: "reservationKey",
          type: sql.NVarChar(200),
          value: params.reservationKey,
        },
      ],
    );
    const row = existing.recordset[0];
    if (!row) return;
    // Only RESERVED may be released. UNCERTAIN/CONSUMED/RELEASED stay put —
    // a later definitive failure must never erase a prior ambiguous commitment.
    if (row.State !== "RESERVED") {
      return;
    }

    await trx.execute(
      `UPDATE TblUsageReservation
       SET State = N'RELEASED',
           UpdatedAtUtc = SYSUTCDATETIME()
       WHERE UsageReservationID = @id
         AND State = N'RESERVED'`,
      [
        {
          name: "id",
          type: sql.UniqueIdentifier,
          value: row.UsageReservationID,
        },
      ],
    );

    await trx.execute(
      `UPDATE TblUsagePeriodCounter
       SET Quantity = CASE
             WHEN Quantity >= @quantity THEN Quantity - @quantity
             ELSE 0
           END,
           UpdatedAtUtc = SYSUTCDATETIME()
       WHERE BusinessID = @businessId
         AND EventType = @eventType
         AND PeriodStartUtc = @periodStartUtc`,
      [
        {
          name: "businessId",
          type: sql.UniqueIdentifier,
          value: params.businessId,
        },
        {
          name: "eventType",
          type: sql.NVarChar(64),
          value: params.eventType,
        },
        {
          name: "periodStartUtc",
          type: sql.DateTime2,
          value: row.PeriodStartUtc,
        },
        { name: "quantity", type: sql.Int, value: Number(row.Quantity) },
      ],
    );
  });
}

/** Mark reservation UNCERTAIN without changing counter (already committed). */
export async function markQuotaReservationUncertain(params: {
  businessId: string;
  eventType: string;
  reservationKey: string;
}): Promise<void> {
  await withTransaction(async (trx) => {
    await trx.execute(
      `UPDATE TblUsageReservation
       SET State = N'UNCERTAIN',
           UpdatedAtUtc = SYSUTCDATETIME()
       WHERE BusinessID = @businessId
         AND EventType = @eventType
         AND ReservationKey = @reservationKey
         AND State IN (N'RESERVED', N'UNCERTAIN')`,
      [
        {
          name: "businessId",
          type: sql.UniqueIdentifier,
          value: params.businessId,
        },
        {
          name: "eventType",
          type: sql.NVarChar(64),
          value: params.eventType,
        },
        {
          name: "reservationKey",
          type: sql.NVarChar(200),
          value: params.reservationKey,
        },
      ],
    );
  });
}

async function insertUsageEventIdempotent(
  params: {
    businessId: string;
    eventType: string;
    quantity: number;
    usageKey: string;
    metadata?: Record<string, unknown> | null;
  },
  trx: TransactionClient,
): Promise<void> {
  const usageEventId = randomUUID();
  const metadataJson = params.metadata
    ? JSON.stringify(params.metadata)
    : null;
  await trx.execute(
    `IF NOT EXISTS (
       SELECT 1 FROM TblUsageEvent WITH (UPDLOCK, HOLDLOCK)
       WHERE BusinessID = @businessId
         AND EventType = @eventType
         AND UsageKey = @usageKey
     )
     INSERT INTO TblUsageEvent (
       UsageEventID, BusinessID, EventType, Quantity, OccurredAtUtc,
       MetadataJson, UsageKey
     ) VALUES (
       @usageEventId, @businessId, @eventType, @quantity, SYSUTCDATETIME(),
       @metadataJson, @usageKey
     )`,
    [
      {
        name: "usageEventId",
        type: sql.UniqueIdentifier,
        value: usageEventId,
      },
      {
        name: "businessId",
        type: sql.UniqueIdentifier,
        value: params.businessId,
      },
      { name: "eventType", type: sql.NVarChar(64), value: params.eventType },
      { name: "quantity", type: sql.Int, value: params.quantity },
      {
        name: "metadataJson",
        type: sql.NVarChar(sql.MAX),
        value: metadataJson,
      },
      {
        name: "usageKey",
        type: sql.NVarChar(200),
        value: params.usageKey,
      },
    ],
  );
}

/**
 * Run createFn inside entitlement mutex after counting resources.
 * createFn must use the same trx for the INSERT.
 */
export async function withResourceLimitGate<T>(params: {
  businessId: string;
  kind: "agent" | "knowledge_active" | "whatsapp_connection";
  /** Extra units this create will consume (usually 1). */
  delta?: number;
  createFn: (trx: TransactionClient) => Promise<T>;
}): Promise<T> {
  const delta = params.delta ?? 1;
  return withTransaction(async (trx) => {
    const { subscription } = await ensureCurrentSubscriptionEntitlements(
      params.businessId,
      trx,
    );
    const plan = subscription
      ? await getPlanById(subscription.planId, trx)
      : null;
    assertCanAct(subscription, plan);

    let used = 0;
    let limit: number | null = null;
    let errorCode: (typeof PLAN_ERROR_CODES)[keyof typeof PLAN_ERROR_CODES] =
      PLAN_ERROR_CODES.AGENT_LIMIT;

    if (params.kind === "agent") {
      used = await countAgents(params.businessId, trx);
      limit = plan!.maxAgents ?? null;
      errorCode = PLAN_ERROR_CODES.AGENT_LIMIT;
    } else if (params.kind === "knowledge_active") {
      used = await countActiveKnowledge(params.businessId, trx);
      limit = plan!.maxActiveKnowledgeItems ?? null;
      errorCode = PLAN_ERROR_CODES.KNOWLEDGE_LIMIT;
    } else {
      used = await countWhatsAppConnections(params.businessId, trx);
      limit = plan!.maxWhatsAppConnections ?? null;
      errorCode = PLAN_ERROR_CODES.WHATSAPP_CONNECTION_LIMIT;
    }

    if (limit != null && used + delta > limit) {
      throw new PlanEntitlementError(errorCode);
    }

    return params.createFn(trx);
  });
}

void CURRENT_STATUSES;
