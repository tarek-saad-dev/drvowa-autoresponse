import { z } from "zod";

import type { AudienceFilterAst, AudiencePredicate } from "./types";

const statusEnum = z.enum(["ACTIVE", "INACTIVE", "LEAD", "BLOCKED", "MERGED"]);
const sourceEnum = z.enum(["MANUAL", "WHATSAPP", "ERP", "IMPORT", "MERGE"]);

const predicateSchema: z.ZodType<AudiencePredicate> = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("status"),
    op: z.enum(["eq", "in"]),
    values: z.array(statusEnum).min(1).max(5),
  }),
  z.object({
    type: z.literal("source"),
    op: z.enum(["eq", "in"]),
    values: z.array(sourceEnum).min(1).max(5),
  }),
  z.object({
    type: z.literal("tag"),
    op: z.enum(["has_any", "has_all"]),
    tagNames: z.array(z.string().trim().min(1).max(80)).min(1).max(20),
  }),
  z.object({
    type: z.literal("assigned_user"),
    op: z.enum(["eq", "is_null"]),
    userId: z.string().uuid().optional(),
  }),
  z.object({
    type: z.literal("has_phone"),
    value: z.boolean(),
  }),
  z.object({
    type: z.literal("last_interaction"),
    op: z.enum(["before_days_ago", "within_days", "between"]),
    days: z.number().int().min(1).max(3650).optional(),
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  }),
  z.object({
    type: z.literal("erp_last_visit"),
    op: z.enum(["before_days_ago", "within_days", "between"]),
    days: z.number().int().min(1).max(3650).optional(),
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  }),
  z.object({
    type: z.literal("erp_invoice_date"),
    op: z.literal("between"),
    from: z.string().regex(/^\\d{4}-\\d{2}-\\d{2}$/),
    to: z.string().regex(/^\\d{4}-\\d{2}-\\d{2}$/),
  }),
  z.object({
    type: z.literal("erp_spend"),
    op: z.enum(["gte", "lte", "between"]),
    amount: z.number().finite().min(0).max(10_000_000).optional(),
    min: z.number().finite().min(0).max(10_000_000).optional(),
    max: z.number().finite().min(0).max(10_000_000).optional(),
    windowDays: z.number().int().min(1).max(3650).optional(),
  }),
  z.object({
    type: z.literal("erp_visits"),
    op: z.enum(["gte", "lte", "eq"]),
    count: z.number().int().min(0).max(100_000),
    windowDays: z.number().int().min(1).max(3650).optional(),
  }),
  z.object({
    type: z.literal("erp_service"),
    op: z.enum(["name_contains", "pro_id_in", "category_contains"]),
    values: z.array(z.string().trim().min(1).max(200)).min(1).max(50),
    minTimes: z.number().int().min(1).max(1000).optional(),
    windowDays: z.number().int().min(1).max(3650).optional(),
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  }),
  z.object({
    type: z.literal("erp_product"),
    op: z.enum(["name_contains", "pro_id_in"]),
    values: z.array(z.string().trim().min(1).max(200)).min(1).max(50),
    windowDays: z.number().int().min(1).max(3650).optional(),
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  }),
  z.object({
    type: z.literal("erp_branch"),
    op: z.enum(["id_in", "name_contains"]),
    values: z.array(z.string().trim().min(1).max(200)).min(1).max(50),
  }),
  z.object({
    type: z.literal("excluded_from_campaign_days"),
    days: z.number().int().min(1).max(365),
  }),
  z.object({
    type: z.literal("marketing_permission"),
    op: z.enum(["eligible", "any"]),
  }),
]);

export const audienceFilterAstSchema = z
  .object({
    version: z.literal(1),
    name: z.string().trim().min(1).max(160).optional(),
    all: z.array(predicateSchema).max(25).optional(),
    any: z.array(predicateSchema).max(25).optional(),
    exclude: z.array(predicateSchema).max(25).optional(),
    limit: z.number().int().min(1).max(5000).optional(),
    orderBy: z.enum(["spend_desc", "visits_desc", "last_visit_desc", "name_asc"]).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const total =
      (value.all?.length ?? 0) + (value.any?.length ?? 0) + (value.exclude?.length ?? 0);
    if (total === 0) {
      ctx.addIssue({
        code: "custom",
        message: "Audience filter must include at least one predicate",
      });
    }
    if (total > 40) {
      ctx.addIssue({
        code: "custom",
        message: "Audience filter exceeds complexity limit",
      });
    }
  });

export function parseAudienceFilterAst(input: unknown): AudienceFilterAst {
  return audienceFilterAstSchema.parse(input);
}

const MAX_PREDICATES_PER_GROUP = 25;
const MAX_PREDICATES_TOTAL = 40;

export class AudienceComplexityError extends Error {
  readonly code = "AUDIENCE_COMPLEXITY_LIMIT";
  constructor(message: string) {
    super(message);
    this.name = "AudienceComplexityError";
  }
}

/**
 * Merges refinement predicates into the base audience.
 * Never silently drops predicates — throws if complexity limits would be exceeded.
 */
export function mergeAudienceFilters(
  base: AudienceFilterAst | null | undefined,
  refinement: AudienceFilterAst,
): AudienceFilterAst {
  if (!base) return refinement;
  const all = [...(base.all ?? []), ...(refinement.all ?? [])];
  const exclude = [...(base.exclude ?? []), ...(refinement.exclude ?? [])];
  const any = refinement.any?.length ? refinement.any : base.any;
  if (all.length > MAX_PREDICATES_PER_GROUP || exclude.length > MAX_PREDICATES_PER_GROUP) {
    throw new AudienceComplexityError(
      "Audience filter group exceeds the maximum predicate limit",
    );
  }
  const total = all.length + exclude.length + (any?.length ?? 0);
  if (total > MAX_PREDICATES_TOTAL) {
    throw new AudienceComplexityError(
      "Audience filter exceeds complexity limit; simplify or start a new audience",
    );
  }
  return {
    version: 1,
    name: refinement.name ?? base.name,
    all: all.length ? all : undefined,
    any,
    exclude: exclude.length ? exclude : undefined,
    limit: refinement.limit ?? base.limit,
    orderBy: refinement.orderBy ?? base.orderBy,
  };
}

export function explainAudienceFilterAr(filter: AudienceFilterAst): string {
  const parts: string[] = [];
  for (const pred of filter.all ?? []) parts.push(explainPredicate(pred));
  if (filter.any?.length) {
    parts.push(`أي من: ${filter.any.map(explainPredicate).join(" أو ")}`);
  }
  for (const pred of filter.exclude ?? []) parts.push(`استبعاد: ${explainPredicate(pred)}`);
  if (filter.limit) parts.push(`أقصى عدد: ${filter.limit}`);
  if (filter.orderBy === "spend_desc") parts.push("ترتيب حسب أعلى إنفاق");
  if (filter.orderBy === "visits_desc") parts.push("ترتيب حسب أكثر زيارات");
  if (filter.orderBy === "last_visit_desc") parts.push("ترتيب حسب آخر زيارة");
  return parts.filter(Boolean).join(" · ") || "بدون فلاتر واضحة";
}

function explainPredicate(pred: AudiencePredicate): string {
  switch (pred.type) {
    case "status":
      return `الحالة: ${pred.values.join(", ")}`;
    case "source":
      return `المصدر: ${pred.values.join(", ")}`;
    case "tag":
      return `وسوم: ${pred.tagNames.join(", ")}`;
    case "has_phone":
      return pred.value ? "لديهم رقم هاتف" : "بدون رقم هاتف";
    case "erp_last_visit":
      if (pred.op === "before_days_ago") return `آخر زيارة قبل أكثر من ${pred.days} يوم`;
      if (pred.op === "within_days") return `زاروا خلال آخر ${pred.days} يوم`;
      return `آخر زيارة بين ${pred.from} و ${pred.to}`;
    case "erp_invoice_date":
      return `فواتير بتاريخ ${pred.from}${pred.to !== pred.from ? ` إلى ${pred.to}` : ""}`;
    case "erp_spend":
      if (pred.op === "gte") return `إنفاق ≥ ${pred.amount}${pred.windowDays ? ` خلال ${pred.windowDays} يوم` : ""}`;
      if (pred.op === "lte") return `إنفاق ≤ ${pred.amount}`;
      return `إنفاق بين ${pred.min} و ${pred.max}`;
    case "erp_visits":
      return `عدد الزيارات ${pred.op} ${pred.count}${pred.windowDays ? ` خلال ${pred.windowDays} يوم` : ""}`;
    case "erp_service":
      return `خدمة: ${pred.values.join(", ")}${pred.minTimes ? ` ≥ ${pred.minTimes} مرات` : ""}`;
    case "erp_product":
      return `منتج: ${pred.values.join(", ")}`;
    case "erp_branch":
      return `فرع: ${pred.values.join(", ")}`;
    case "excluded_from_campaign_days":
      return `لم تصلهم حملة خلال ${pred.days} يوم`;
    case "marketing_permission":
      return pred.op === "eligible" ? "مسموح لهم بالتسويق" : "أي حالة موافقة";
    case "assigned_user":
      return pred.op === "is_null" ? "بدون موظف مسؤول" : "موظف مسؤول محدد";
    case "last_interaction":
      if (pred.op === "before_days_ago") return `آخر تواصل قبل أكثر من ${pred.days} يوم`;
      if (pred.op === "within_days") return `تواصل خلال آخر ${pred.days} يوم`;
      return `تواصل بين ${pred.from} و ${pred.to}`;
    default:
      return "شرط";
  }
}
