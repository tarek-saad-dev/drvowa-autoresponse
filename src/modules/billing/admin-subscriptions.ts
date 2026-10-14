import { query, sql, type QueryInput } from "@/lib/db";

export const ADMIN_SUBSCRIPTION_FILTERS = [
  "ALL", "PAID", "FREE", "TRIAL", "PAST_DUE", "EXPIRING", "EXPIRED", "NO_PLAN",
] as const;

export type AdminSubscriptionFilter = (typeof ADMIN_SUBSCRIPTION_FILTERS)[number];

export function parseAdminSubscriptionFilter(raw?: string): AdminSubscriptionFilter {
  const normalized = (raw ?? "").toUpperCase();
  return ADMIN_SUBSCRIPTION_FILTERS.find((value) => value === normalized) ?? "ALL";
}

export type AdminSubscriptionItem = {
  businessId: string;
  name: string;
  slug: string;
  businessStatus: string;
  joinedAtUtc: Date;
  planName: string | null;
  planCode: string | null;
  subscriptionStatus: string | null;
  startUtc: Date | null;
  endUtc: Date | null;
  monthlyPrice: number | null;
  currency: string | null;
};

export type AdminSubscriptionsPage = {
  items: AdminSubscriptionItem[];
  total: number;
  page: number;
  pageSize: number;
  search: string;
  status: AdminSubscriptionFilter;
};

type Row = {
  BusinessID: string;
  Name: string;
  Slug: string;
  BusinessStatus: string;
  JoinedAtUtc: Date;
  PlanName: string | null;
  PlanCode: string | null;
  SubscriptionStatus: string | null;
  PeriodStartUtc: Date | null;
  PeriodEndUtc: Date | null;
  MonthlyPriceAmount: number | null;
  CurrencyCode: string | null;
  TotalCount: number;
};

/** Admin-only read model. Does not modify the source subscription or entitlement. */
export async function listAdminSubscriptions(params: {
  search?: string;
  status?: AdminSubscriptionFilter;
  page?: number;
}): Promise<AdminSubscriptionsPage> {
  const search = (params.search ?? "").trim().slice(0, 80);
  const status = params.status ?? "ALL";
  const pageSize = 25;
  const page = Number.isInteger(params.page) ? Math.min(10000, Math.max(1, params.page!)) : 1;
  const offset = (page - 1) * pageSize;

  const inputs: QueryInput[] = [
    { name: "search", type: sql.NVarChar(80), value: search },
    { name: "status", type: sql.NVarChar(16), value: status },
    { name: "offset", type: sql.Int, value: offset },
    { name: "limit", type: sql.Int, value: pageSize },
  ];
  const result = await query<Row>(`
    WITH Subscriptions AS (
      SELECT b.BusinessID, b.Name, b.Slug,
        b.Status AS BusinessStatus, b.CreatedAtUtc AS JoinedAtUtc,
        s.Status AS SubscriptionStatus, s.PeriodStartUtc, s.PeriodEndUtc,
        p.DisplayName AS PlanName, p.Code AS PlanCode,
        p.MonthlyPriceAmount, p.CurrencyCode
      FROM TblBusiness b
      OUTER APPLY (
        SELECT TOP (1) s.Status, s.PeriodStartUtc, s.PeriodEndUtc, s.PlanID
        FROM TblSubscription s
        WHERE s.BusinessID = b.BusinessID
        ORDER BY
          CASE WHEN s.Status IN (N'ACTIVE', N'TRIALING', N'PAST_DUE') THEN 0 ELSE 1 END,
          s.CreatedAtUtc DESC, s.SubscriptionID DESC
      ) s
      LEFT JOIN TblPlan p ON p.PlanID = s.PlanID
    )
    SELECT BusinessID, Name, Slug, BusinessStatus, JoinedAtUtc,
      SubscriptionStatus, PeriodStartUtc, PeriodEndUtc,
      PlanName, PlanCode, MonthlyPriceAmount, CurrencyCode,
      COUNT(1) OVER() AS TotalCount
    FROM Subscriptions
    WHERE (
      @search = N'' OR CHARINDEX(@search, Name) > 0
      OR CHARINDEX(@search, Slug) > 0
    )
    AND (
      @status = N'ALL'
      OR (@status = N'NO_PLAN' AND SubscriptionStatus IS NULL)
      OR (@status = N'PAID' AND SubscriptionStatus = N'ACTIVE'
          AND PlanCode <> N'FREE' AND (PeriodEndUtc IS NULL OR PeriodEndUtc > SYSUTCDATETIME()))
      OR (@status = N'FREE' AND SubscriptionStatus = N'ACTIVE' AND PlanCode = N'FREE')
      OR (@status = N'TRIAL' AND SubscriptionStatus = N'TRIALING'
          AND (PeriodEndUtc IS NULL OR PeriodEndUtc > SYSUTCDATETIME()))
      OR (@status = N'PAST_DUE' AND SubscriptionStatus = N'PAST_DUE')
      OR (@status = N'EXPIRING' AND SubscriptionStatus = N'ACTIVE' AND PlanCode <> N'FREE'
          AND PeriodEndUtc > SYSUTCDATETIME() AND PeriodEndUtc <= DATEADD(DAY, 14, SYSUTCDATETIME()))
      OR (@status = N'EXPIRED' AND (
        SubscriptionStatus IN (N'EXPIRED', N'CANCELED')
        OR (SubscriptionStatus IN (N'ACTIVE', N'TRIALING') AND PlanCode <> N'FREE'
            AND PeriodEndUtc IS NOT NULL AND PeriodEndUtc <= SYSUTCDATETIME())
      ))
    )
    ORDER BY JoinedAtUtc DESC, BusinessID DESC
    OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
  `, inputs);

  return {
    search,
    status,
    page,
    pageSize,
    total: Number(result.recordset[0]?.TotalCount ?? 0),
    items: result.recordset.map((row) => ({
      businessId: String(row.BusinessID),
      name: row.Name,
      slug: row.Slug,
      businessStatus: row.BusinessStatus,
      joinedAtUtc: new Date(row.JoinedAtUtc),
      subscriptionStatus: row.SubscriptionStatus,
      planName: row.PlanName,
      planCode: row.PlanCode,
      startUtc: row.PeriodStartUtc ? new Date(row.PeriodStartUtc) : null,
      endUtc: row.PeriodEndUtc ? new Date(row.PeriodEndUtc) : null,
      monthlyPrice: row.MonthlyPriceAmount == null ? null : Number(row.MonthlyPriceAmount),
      currency: row.CurrencyCode,
    })),
  };
}
