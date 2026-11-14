import { createHash } from "node:crypto";

import sql from "mssql";

import type { QueryInput } from "@/lib/db";
import { ValidationError } from "@/lib/tenancy/errors";

import type { AudienceFilterAst, AudiencePredicate } from "./types";

export const AUDIENCE_MAX_ROWS = 2000;
export const AUDIENCE_QUERY_TIMEOUT_MS = 8_000;

export type CompiledAudienceQuery = {
  sqlText: string;
  countSqlText: string;
  inputs: QueryInput[];
  sqlHash: string;
  limit: number;
};

type CompileCtx = {
  businessId: string;
  channelConnectionId: string | null;
  inputs: QueryInput[];
  paramIndex: number;
};

function addParam(ctx: CompileCtx, nameHint: string, type: QueryInput["type"], value: unknown): string {
  const name = `${nameHint}${ctx.paramIndex++}`;
  ctx.inputs.push({ name, type, value });
  return `@${name}`;
}

function validInvoiceJoin(): string {
  return `FROM dbo.TblErpInvoiceMirror inv WITH (NOLOCK)
    WHERE inv.BusinessID = @businessId
      AND inv.IsValidSale = 1
      AND inv.IsDeleted = 0
      AND inv.CustomerID = c.CustomerID`;
}

function compilePredicate(pred: AudiencePredicate, ctx: CompileCtx): string {
  switch (pred.type) {
    case "status": {
      const names = pred.values.map((v, i) =>
        addParam(ctx, `status${i}_`, sql.NVarChar(32), v),
      );
      return names.length === 1
        ? `c.Status = ${names[0]}`
        : `c.Status IN (${names.join(", ")})`;
    }
    case "source": {
      const names = pred.values.map((v, i) =>
        addParam(ctx, `source${i}_`, sql.NVarChar(64), v),
      );
      return names.length === 1
        ? `c.Source = ${names[0]}`
        : `c.Source IN (${names.join(", ")})`;
    }
    case "tag": {
      if (pred.op === "has_any") {
        const names = pred.tagNames.map((v, i) =>
          addParam(ctx, `tag${i}_`, sql.NVarChar(80), v),
        );
        return `EXISTS (
          SELECT 1 FROM dbo.TblCrmCustomerTag ct
          INNER JOIN dbo.TblCrmTag t ON t.TagID = ct.TagID AND t.BusinessID = ct.BusinessID
          WHERE ct.BusinessID = @businessId AND ct.CustomerID = c.CustomerID
            AND t.Name IN (${names.join(", ")})
        )`;
      }
      const checks = pred.tagNames.map((v, i) => {
        const p = addParam(ctx, `tagAll${i}_`, sql.NVarChar(80), v);
        return `EXISTS (
          SELECT 1 FROM dbo.TblCrmCustomerTag ct
          INNER JOIN dbo.TblCrmTag t ON t.TagID = ct.TagID AND t.BusinessID = ct.BusinessID
          WHERE ct.BusinessID = @businessId AND ct.CustomerID = c.CustomerID AND t.Name = ${p}
        )`;
      });
      return `(${checks.join(" AND ")})`;
    }
    case "assigned_user": {
      if (pred.op === "is_null") return `c.AssignedUserID IS NULL`;
      if (!pred.userId) throw new ValidationError("assigned_user requires userId");
      const p = addParam(ctx, "assigned_", sql.UniqueIdentifier, pred.userId);
      return `c.AssignedUserID = ${p}`;
    }
    case "has_phone":
      return pred.value
        ? `c.PrimaryPhoneNormalized IS NOT NULL`
        : `c.PrimaryPhoneNormalized IS NULL`;
    case "last_interaction":
      return compileDaysPredicate("c.LastInteractionAtUtc", pred, ctx, "li");
    case "erp_last_visit": {
      const lastVisit = `(SELECT MAX(inv.InvDate) ${validInvoiceJoin()})`;
      if (pred.op === "before_days_ago") {
        // Never-visited customers qualify as "away longer than N days".
        return compileDaysPredicate(lastVisit, pred, ctx, "elv", true);
      }
      return `(${lastVisit} IS NOT NULL AND ${compileDaysPredicate(lastVisit, pred, ctx, "elv", true)})`;
    }
    case "erp_invoice_date": {
      const from = addParam(ctx, "invFrom_", sql.Date, pred.from);
      const to = addParam(ctx, "invTo_", sql.Date, pred.to);
      // Any valid sales invoice on the exact calendar date, NOT just the latest
      // visit. Half-open end covers invoice timestamps throughout the final day.
      return `EXISTS (SELECT 1 ${validInvoiceJoin()}
        AND inv.InvDate >= ${from}
        AND inv.InvDate < DATEADD(day, 1, ${to}))`;
    }
    case "erp_spend": {
      const window = pred.windowDays
        ? `AND inv.InvDate >= DATEADD(day, -CAST(${addParam(ctx, "spendWin_", sql.Int, pred.windowDays)} AS INT), CAST(SYSUTCDATETIME() AS DATE))`
        : "";
      const sumExpr = `(SELECT ISNULL(SUM(inv.GrandTotal), 0) ${validInvoiceJoin()} ${window})`;
      if (pred.op === "gte") {
        const amt = addParam(ctx, "spendGte_", sql.Decimal(18, 2), pred.amount ?? 0);
        return `${sumExpr} >= ${amt}`;
      }
      if (pred.op === "lte") {
        const amt = addParam(ctx, "spendLte_", sql.Decimal(18, 2), pred.amount ?? 0);
        return `${sumExpr} <= ${amt}`;
      }
      const min = addParam(ctx, "spendMin_", sql.Decimal(18, 2), pred.min ?? 0);
      const max = addParam(ctx, "spendMax_", sql.Decimal(18, 2), pred.max ?? 0);
      return `${sumExpr} BETWEEN ${min} AND ${max}`;
    }
    case "erp_visits": {
      const window = pred.windowDays
        ? `AND inv.InvDate >= DATEADD(day, -CAST(${addParam(ctx, "visWin_", sql.Int, pred.windowDays)} AS INT), CAST(SYSUTCDATETIME() AS DATE))`
        : "";
      const countExpr = `(SELECT COUNT(1) ${validInvoiceJoin()} ${window})`;
      const n = addParam(ctx, "visCount_", sql.Int, pred.count);
      if (pred.op === "gte") return `${countExpr} >= ${n}`;
      if (pred.op === "lte") return `${countExpr} <= ${n}`;
      return `${countExpr} = ${n}`;
    }
    case "erp_service":
    case "erp_product": {
      const isProduct = pred.type === "erp_product";
      const typeFilter = isProduct
        ? `AND (line.ProType = N'pro' OR line.ProType = N'product')`
        : `AND (line.ProType IS NULL OR line.ProType IN (N'serv', N'service'))`;
      const minTimes = !isProduct && "minTimes" in pred && pred.minTimes
        ? pred.minTimes
        : 1;
      const minP = addParam(ctx, "svcMin_", sql.Int, minTimes);
      const dateParts: string[] = [];
      if (pred.windowDays) {
        const w = addParam(ctx, "svcWin_", sql.Int, pred.windowDays);
        dateParts.push(`inv.InvDate >= DATEADD(day, -CAST(${w} AS INT), CAST(SYSUTCDATETIME() AS DATE))`);
      }
      if (pred.from) {
        const f = addParam(ctx, "svcFrom_", sql.Date, pred.from);
        dateParts.push(`inv.InvDate >= ${f}`);
      }
      if (pred.to) {
        const t = addParam(ctx, "svcTo_", sql.Date, pred.to);
        dateParts.push(`inv.InvDate <= ${t}`);
      }
      const dateSql = dateParts.length ? `AND ${dateParts.join(" AND ")}` : "";
      let matchSql = "1=0";
      if (pred.op === "pro_id_in") {
        const ids = pred.values.map((v, i) =>
          addParam(ctx, `proId${i}_`, sql.NVarChar(64), v),
        );
        matchSql = `line.ExternalProId IN (${ids.join(", ")})`;
      } else if (pred.op === "category_contains") {
        const likes = pred.values.map((v, i) => {
          const p = addParam(ctx, `cat${i}_`, sql.NVarChar(220), `%${v}%`);
          return `sc.CategoryName LIKE ${p} OR sc.ProName LIKE ${p} OR sc.ProNameAr LIKE ${p}`;
        });
        matchSql = `(${likes.join(" OR ")})`;
      } else {
        const likes = pred.values.map((v, i) => {
          const p = addParam(ctx, `svcName${i}_`, sql.NVarChar(220), `%${v}%`);
          return `line.ProName LIKE ${p} OR sc.ProName LIKE ${p} OR sc.ProNameAr LIKE ${p}`;
        });
        matchSql = `(${likes.join(" OR ")})`;
      }
      return `(
        SELECT COUNT(1)
        FROM dbo.TblErpInvoiceMirror inv
        INNER JOIN dbo.TblErpInvoiceLineMirror line
          ON line.BusinessID = inv.BusinessID AND line.InvoiceMirrorID = inv.InvoiceMirrorID
        LEFT JOIN dbo.TblErpServiceCatalog sc
          ON sc.BusinessID = inv.BusinessID AND sc.ExternalProId = line.ExternalProId
        WHERE inv.BusinessID = @businessId
          AND inv.CustomerID = c.CustomerID
          AND inv.IsValidSale = 1 AND inv.IsDeleted = 0
          ${typeFilter}
          ${dateSql}
          AND (${matchSql})
      ) >= ${minP}`;
    }
    case "erp_branch": {
      if (pred.op === "id_in") {
        const ids = pred.values.map((v, i) =>
          addParam(ctx, `brId${i}_`, sql.Int, Number(v)),
        );
        return `EXISTS (
          SELECT 1 ${validInvoiceJoin()} AND inv.BranchId IN (${ids.join(", ")})
        )`;
      }
      const likes = pred.values.map((v, i) => {
        const p = addParam(ctx, `brName${i}_`, sql.NVarChar(220), `%${v}%`);
        return `inv.BranchName LIKE ${p}`;
      });
      return `EXISTS (
        SELECT 1 ${validInvoiceJoin()} AND (${likes.join(" OR ")})
      )`;
    }
    case "excluded_from_campaign_days": {
      const d = addParam(ctx, "campDays_", sql.Int, pred.days);
      return `NOT EXISTS (
        SELECT 1
        FROM dbo.TblWhatsAppCampaignRunItem ri
        INNER JOIN dbo.TblWhatsAppCampaignRun r
          ON r.BusinessID = ri.BusinessID AND r.CampaignRunID = ri.CampaignRunID
        WHERE ri.BusinessID = @businessId
          AND ri.PhoneNormalized = c.PrimaryPhoneNormalized
          AND r.CreatedAtUtc >= DATEADD(day, -CAST(${d} AS INT), SYSUTCDATETIME())
          AND ri.Status IN (N'SENT', N'QUEUED', N'SENDING')
      )`;
    }
    case "marketing_permission":
      if (pred.op === "any") return `1=1`;
      if (!ctx.channelConnectionId) {
        throw new ValidationError("Marketing permission audience requires an explicit WhatsApp channel");
      }
      return `c.PrimaryPhoneNormalized IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM dbo.TblWhatsAppCampaignPermission p
          WHERE p.BusinessID = @businessId
            AND p.ChannelConnectionID = @channelConnectionId
            AND p.PhoneNormalized = c.PrimaryPhoneNormalized
        )
        AND NOT EXISTS (
          SELECT 1 FROM dbo.TblWhatsAppCampaignOptOut o
          WHERE o.BusinessID = @businessId
            AND o.ChannelConnectionID = @channelConnectionId
            AND o.PhoneNormalized = c.PrimaryPhoneNormalized
        )`;
    default:
      throw new ValidationError("Unsupported audience predicate");
  }
}

function compileDaysPredicate(
  columnExpr: string,
  pred: Extract<AudiencePredicate, { type: "last_interaction" | "erp_last_visit" }>,
  ctx: CompileCtx,
  prefix: string,
  dateOnly = false,
): string {
  if (pred.op === "before_days_ago") {
    const d = addParam(ctx, `${prefix}Before_`, sql.Int, pred.days ?? 30);
    if (dateOnly) {
      return `(${columnExpr} IS NULL OR ${columnExpr} < DATEADD(day, -CAST(${d} AS INT), CAST(SYSUTCDATETIME() AS DATE)))`;
    }
    return `(${columnExpr} IS NULL OR ${columnExpr} < DATEADD(day, -CAST(${d} AS INT), SYSUTCDATETIME()))`;
  }
  if (pred.op === "within_days") {
    const d = addParam(ctx, `${prefix}Within_`, sql.Int, pred.days ?? 30);
    if (dateOnly) {
      return `${columnExpr} >= DATEADD(day, -CAST(${d} AS INT), CAST(SYSUTCDATETIME() AS DATE))`;
    }
    return `${columnExpr} >= DATEADD(day, -CAST(${d} AS INT), SYSUTCDATETIME())`;
  }
  if (!pred.from || !pred.to) {
    throw new ValidationError("between requires from/to dates");
  }
  const from = addParam(ctx, `${prefix}From_`, sql.Date, pred.from);
  const to = addParam(ctx, `${prefix}To_`, sql.Date, pred.to);
  return `${columnExpr} BETWEEN ${from} AND ${to}`;
}

function compileGroup(
  preds: AudiencePredicate[] | undefined,
  joiner: "AND" | "OR",
  ctx: CompileCtx,
): string | null {
  if (!preds?.length) return null;
  return `(${preds.map((p) => compilePredicate(p, ctx)).join(` ${joiner} `)})`;
}

/**
 * Compiles a validated audience AST into parameterized, tenant-scoped, read-only SQL.
 * The LLM never supplies SQL text — only the AST reaches this function.
 */
export function compileAudienceFilter(params: {
  businessId: string;
  filter: AudienceFilterAst;
  channelConnectionId?: string | null;
}): CompiledAudienceQuery {
  const limit = Math.min(params.filter.limit ?? AUDIENCE_MAX_ROWS, AUDIENCE_MAX_ROWS);
  const ctx: CompileCtx = {
    businessId: params.businessId,
    channelConnectionId: params.channelConnectionId ?? null,
    inputs: [
      { name: "businessId", type: sql.UniqueIdentifier, value: params.businessId },
      { name: "limit", type: sql.Int, value: limit },
      ...(params.channelConnectionId
        ? [{ name: "channelConnectionId", type: sql.UniqueIdentifier, value: params.channelConnectionId }]
        : []),
    ],
    paramIndex: 0,
  };

  const whereParts = [
    "c.BusinessID = @businessId",
    "c.Status <> N'MERGED'",
    "c.MergedIntoCustomerID IS NULL",
  ];
  const allSql = compileGroup(params.filter.all, "AND", ctx);
  const anySql = compileGroup(params.filter.any, "OR", ctx);
  const excludeSql = compileGroup(params.filter.exclude, "OR", ctx);
  if (allSql) whereParts.push(allSql);
  if (anySql) whereParts.push(anySql);
  if (excludeSql) whereParts.push(`NOT ${excludeSql}`);

  let orderBy = "c.FullName ASC, c.CustomerID ASC";
  if (params.filter.orderBy === "spend_desc") {
    orderBy = `(SELECT ISNULL(SUM(inv.GrandTotal),0) ${validInvoiceJoin()}) DESC, c.CustomerID ASC`;
  } else if (params.filter.orderBy === "visits_desc") {
    orderBy = `(SELECT COUNT(1) ${validInvoiceJoin()}) DESC, c.CustomerID ASC`;
  } else if (params.filter.orderBy === "last_visit_desc") {
    orderBy = `(SELECT MAX(inv.InvDate) ${validInvoiceJoin()}) DESC, c.CustomerID ASC`;
  } else if (params.filter.orderBy === "name_asc") {
    orderBy = "c.FullName ASC, c.CustomerID ASC";
  }

  const fromWhere = `
    FROM dbo.TblCrmCustomer c
    WHERE ${whereParts.join("\n      AND ")}
  `;

  const sqlText = `
    SELECT TOP (@limit)
      c.CustomerID,
      c.FullName,
      c.PrimaryPhoneNormalized,
      c.Status,
      c.Source,
      c.LastInteractionAtUtc,
      (SELECT ISNULL(SUM(inv.GrandTotal),0) ${validInvoiceJoin()}) AS TotalSpend,
      (SELECT MAX(inv.InvDate) ${validInvoiceJoin()}) AS LastVisitAt
    ${fromWhere}
    ORDER BY ${orderBy}
  `;

  const countSqlText = `SELECT COUNT(1) AS TotalCount ${fromWhere}`;
  const sqlHash = createHash("sha256").update(sqlText.replace(/\s+/g, " ").trim()).digest("hex");

  return { sqlText, countSqlText, inputs: ctx.inputs, sqlHash, limit };
}
