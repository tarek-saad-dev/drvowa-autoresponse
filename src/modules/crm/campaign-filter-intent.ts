import type { AudienceFilterAst, AudiencePredicate } from "./types";

/**
 * A complete new request ("هات العملاء ...") replaces the old audience.
 * Follow-ups ("ومنهم ...", "كمان ...") retain the earlier predicates.
 * A separate "بحث جديد" button in the UI provides an explicit reset as well.
 */
export function isNewAudienceRequest(message: string): boolean {
  return /^(?:هات(?:لي)?|جيب(?:لي)?|اعرض(?:لي)?|وريني|طلع(?:لي)?|دور(?:لي)?\s+على|ابحث(?:لي)?\s+عن|find|show|list)(?:\s|$)/iu.test(message.trim());
}

function asksForMarketingEligibility(message: string): boolean {
  return /حملة|حملات|موافقة\s*(?:التسويق|الواتساب|واتساب)|إذن\s*(?:التسويق|الواتساب|واتساب)|اذن\s*(?:التسويق|الواتساب|واتساب)|مسموح\s*(?:لهم\s*)?(?:بالتسويق|بالرسائل)|مؤهل(?:ين)?\s*(?:للتسويق|للحملة)|ارسال\s*(?:رسالة|واتساب)|إرسال\s*(?:رسالة|واتساب)|ابعت\s*(?:رسالة|واتساب)|ابعث\s*(?:رسالة|واتساب)|opt.?in|consent|marketing|campaign/iu.test(message);
}

function asksForYesterdayInvoices(message: string): boolean {
  return /(?:فواتير|فاتور[ةه]|invoice|invoices)/iu.test(message) &&
    /(?:امبارح|إمبارح|أمس|امس|yesterday)/iu.test(message);
}

function previousCalendarDay(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) throw new Error("Invalid business calendar date");
  const date = new Date(iso + "T12:00:00.000Z");
  if (!Number.isFinite(date.valueOf()) || date.toISOString().slice(0, 10) !== iso) {
    throw new Error("Invalid business calendar date");
  }
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function unique(predicates: AudiencePredicate[] | undefined): AudiencePredicate[] | undefined {
  if (!predicates?.length) return undefined;
  const seen = new Set<string>();
  const out: AudiencePredicate[] = [];
  for (const pred of predicates) {
    const key = JSON.stringify(pred);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(pred);
  }
  return out.length ? out : undefined;
}

function expandServiceNames(pred: AudiencePredicate): AudiencePredicate {
  if (pred.type !== "erp_service" || pred.op !== "name_contains") return pred;
  const values = [...pred.values];
  if (values.some((v) => /بروتين/u.test(v)) && !values.some((v) => /protein/i.test(v))) {
    values.push("protein");
  } else if (values.some((v) => /protein/i.test(v)) && !values.some((v) => /بروتين/u.test(v))) {
    values.push("بروتين");
  }
  return { ...pred, values };
}

/**
 * The LLM can add marketing_permission to a simple customer lookup on a
 * campaign screen. Do not convert a read-only CRM search into "consented only"
 * unless the owner explicitly asked for a marketing-ready audience. Final
 * WhatsApp recipient selection always enforces channel consent separately.
 */
export function normalizeCampaignFilterForRequest(params: {
  filter: AudienceFilterAst;
  message: string;
  businessToday: string;
}): AudienceFilterAst {
  const shouldRestrictToConsented = asksForMarketingEligibility(params.message);
  const invoiceYesterday = asksForYesterdayInvoices(params.message);
  const transform = (items: AudiencePredicate[] | undefined, group: "all" | "any" | "exclude") => {
    const predicates = (items ?? [])
      .filter((p) => shouldRestrictToConsented || p.type !== "marketing_permission")
      // "عمل فواتير امبارح" is not "his LAST visit was yesterday".
      .filter((p) => !(invoiceYesterday && group === "all" && p.type === "erp_last_visit"))
      .map(expandServiceNames);
    return unique(predicates);
  };
  const all = transform(params.filter.all, "all") ?? [];
  if (invoiceYesterday && !all.some((p) => p.type === "erp_invoice_date")) {
    const day = previousCalendarDay(params.businessToday);
    all.push({ type: "erp_invoice_date", op: "between", from: day, to: day });
  }
  return {
    ...params.filter,
    all: unique(all),
    any: transform(params.filter.any, "any"),
    exclude: transform(params.filter.exclude, "exclude"),
  };
}
