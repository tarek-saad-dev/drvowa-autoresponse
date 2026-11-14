import { GoogleGenAI } from "@google/genai";

import { ValidationError } from "@/lib/tenancy/errors";
import { AiProviderError, resolveGeminiModel } from "@/modules/ai/gemini-provider";
import { recordAiProviderCall } from "@/modules/ai-cost/recorder";
import { getBusinessById } from "@/modules/businesses/service";

import {
  AudienceComplexityError,
  explainAudienceFilterAr,
  mergeAudienceFilters,
  parseAudienceFilterAst,
} from "./audience-ast";
import { previewAudience } from "./audience-service";
import { asksForMarketingEligibility, normalizeCampaignFilterForRequest } from "./campaign-filter-intent";
import { getErpSyncStatus } from "./erp-sync";
import * as repo from "./repository";
import { requireCrmWriteAccess } from "./service";
import type { AudienceFilterAst, CrmAudiencePreview } from "./types";

const DEFAULT_TZ = "Africa/Cairo";
const TIMEOUT_MS = 25_000;

export type CampaignAiTurnInput = {
  businessId: string;
  userId: string;
  message: string;
  mode?: "filter" | "refine" | "draft_message";
  priorFilter?: unknown;
  sessionId?: string | null;
  channelConnectionId?: string | null;
};

export type CampaignAiTurnResult = {
  kind: "filter" | "clarification" | "message_draft";
  assistantMessage: string;
  filter: AudienceFilterAst | null;
  explanationAr: string | null;
  clarificationNeeded: boolean;
  clarificationPromptAr: string | null;
  messageDraftAr: string | null;
  preview: CrmAudiencePreview | null;
  autoLaunch: false;
};

function extractResponseText(response: { text?: string | (() => string) }): string {
  if (typeof response.text === "function") return response.text() || "";
  return response.text || "";
}

function needsMonthVsRollingClarification(message: string): boolean {
  const text = message.trim();
  const mentionsMonth =
    /هذا الشهر|الشهر ده|الشهر الحالي|خلال الشهر|في الشهر|this month/i.test(text);
  const mentionsRolling =
    /آخر\s*30|اخر\s*30|آخر ثلاثين|خلال\s*30|last\s*30|past\s*30/i.test(text);
  const ambiguous =
    /الشهر|month/i.test(text)
    && !mentionsMonth
    && !mentionsRolling
    && /(زار|زيارة|إنفاق|صرف|عملاء|العملاء)/i.test(text);
  return ambiguous || (mentionsMonth && mentionsRolling);
}

function todayInTimezone(timeZone: string): string {
  const formatDate = (zone: string) => {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());
    const get = (part: string) => parts.find((p) => p.type === part)?.value ?? "";
    return `${get("year")}-${get("month")}-${get("day")}`;
  };
  try {
    return formatDate(timeZone);
  } catch {
    return formatDate(DEFAULT_TZ);
  }
}

async function generateJson(params: {
  businessId: string;
  system: string;
  user: string;
}): Promise<unknown> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new AiProviderError("GEMINI_API_KEY is not configured", "GEMINI_NOT_CONFIGURED");
  }
  const model = resolveGeminiModel();
  const client = new GoogleGenAI({ apiKey });
  const started = Date.now();
  const abortController = new AbortController();
  const timer = setTimeout(() => abortController.abort(), TIMEOUT_MS);
  let providerReturned = false;
  try {
    const response = await client.models.generateContent({
      model,
      contents: params.user,
      config: {
        systemInstruction: params.system,
        temperature: 0.1,
        responseMimeType: "application/json",
        maxOutputTokens: 2048,
        abortSignal: abortController.signal,
      },
    });
    providerReturned = true;
    await recordAiProviderCall({
      purpose: "CRM_CAMPAIGN_AI",
      model,
      businessId: params.businessId,
      startedAtMs: started,
      response,
    });
    const raw = extractResponseText(response).trim();
    if (!raw) throw new AiProviderError("Empty Gemini output", "GEMINI_EMPTY");
    return JSON.parse(raw) as unknown;
  } catch (error) {
    if (!providerReturned) {
      await recordAiProviderCall({
        purpose: "CRM_CAMPAIGN_AI",
        model,
        businessId: params.businessId,
        startedAtMs: started,
        error,
      });
    }
    if (error instanceof AiProviderError) throw error;
    if (error instanceof SyntaxError) {
      throw new ValidationError("تعذر تفسير رد الذكاء الاصطناعي");
    }
    throw new AiProviderError("Gemini generation failed", "GEMINI_FAILED");
  } finally {
    clearTimeout(timer);
  }
}

const FILTER_SCHEMA_HINT = `{
  "version": 1,
  "name": "optional Arabic segment name",
  "all": [AudiencePredicate],
  "any": [AudiencePredicate],
  "exclude": [AudiencePredicate],
  "limit": number,
  "orderBy": "spend_desc" | "visits_desc" | "last_visit_desc" | "name_asc"
}

AudiencePredicate types:
- { "type":"status","op":"eq"|"in","values":["ACTIVE"|"INACTIVE"|"LEAD"|"BLOCKED"|"MERGED"] }
- { "type":"source","op":"eq"|"in","values":["MANUAL"|"WHATSAPP"|"ERP"|"IMPORT"|"MERGE"] }
- { "type":"tag","op":"has_any"|"has_all","tagNames":[string] }
- { "type":"assigned_user","op":"eq"|"is_null","userId"?: uuid }
- { "type":"has_phone","value": boolean }
- { "type":"last_interaction"|"erp_last_visit","op":"before_days_ago"|"within_days"|"between","days"?:number,"from"?:YYYY-MM-DD,"to"?:YYYY-MM-DD }
- { "type":"erp_invoice_date","op":"between","from":YYYY-MM-DD,"to":YYYY-MM-DD } // ANY valid sales invoice in inclusive date range
- { "type":"erp_spend","op":"gte"|"lte"|"between","amount"?:number,"min"?:number,"max"?:number,"windowDays"?:number }
- { "type":"erp_visits","op":"gte"|"lte"|"eq","count":number,"windowDays"?:number }
- { "type":"erp_service","op":"name_contains"|"pro_id_in"|"category_contains","values":[string],"minTimes"?:number,"windowDays"?:number,"from"?:YYYY-MM-DD,"to"?:YYYY-MM-DD }
- { "type":"erp_product","op":"name_contains"|"pro_id_in","values":[string],"windowDays"?:number }
- { "type":"erp_branch","op":"id_in"|"name_contains","values":[string] }
- { "type":"excluded_from_campaign_days","days":number }
- { "type":"marketing_permission","op":"eligible"|"any" }
`;

export async function runCampaignAiTurn(
  params: CampaignAiTurnInput,
): Promise<CampaignAiTurnResult> {
  await requireCrmWriteAccess(params);
  const message = params.message.trim();
  if (message.length < 2) throw new ValidationError("اكتب طلبك أولاً");

  const business = await getBusinessById({ businessId: params.businessId });
  const timeZone = business?.timezone?.trim() || DEFAULT_TZ;
  const today = todayInTimezone(timeZone);
  const mode = params.mode ?? (params.priorFilter ? "refine" : "filter");

  if (mode !== "draft_message" && needsMonthVsRollingClarification(message)) {
    return {
      kind: "clarification",
      assistantMessage:
        "هل تقصد عملاء خلال أيام التقويم لهذا الشهر، أم خلال آخر 30 يومًا من اليوم؟",
      filter: null,
      explanationAr: null,
      clarificationNeeded: true,
      clarificationPromptAr:
        "حدّد: «هذا الشهر» (من أول الشهر) أو «آخر 30 يوم».",
      messageDraftAr: null,
      preview: null,
      autoLaunch: false,
    };
  }

  const catalog = await repo.listErpServiceCatalog({
    businessId: params.businessId,
    limit: 120,
  });
  const catalogSafe = catalog.map((s) => ({
    id: s.externalProId,
    name: s.proNameAr || s.proName,
  }));

  if (mode === "draft_message") {
    const prior = params.priorFilter
      ? parseAudienceFilterAst(params.priorFilter)
      : null;
    const draftJson = await generateJson({
      businessId: params.businessId,
      system: [
        "You draft short Arabic WhatsApp marketing messages for salon/clinic businesses.",
        "Return JSON only: {\"messageDraftAr\":\"...\",\"assistantMessage\":\"...\"}",
        "Never invent customer names or phone numbers.",
        "Message must be editable, polite Egyptian Arabic, under 500 characters.",
        "Do NOT launch or send anything — drafting only.",
        `Business timezone: ${timeZone}. Today: ${today}.`,
      ].join("\n"),
      user: JSON.stringify({
        request: message,
        audienceExplanationAr: prior ? explainAudienceFilterAr(prior) : null,
        // No customer PII — filter AST only
        priorFilter: prior,
      }),
    });
    const draftObj =
      draftJson && typeof draftJson === "object"
        ? (draftJson as Record<string, unknown>)
        : {};
    const messageDraftAr =
      typeof draftObj.messageDraftAr === "string"
        ? draftObj.messageDraftAr.trim()
        : "";
    if (!messageDraftAr) {
      throw new ValidationError("تعذر إنشاء مسودة الرسالة");
    }
    return {
      kind: "message_draft",
      assistantMessage:
        typeof draftObj.assistantMessage === "string"
          ? draftObj.assistantMessage
          : "تم تجهيز مسودة رسالة قابلة للتعديل. لن يتم الإرسال تلقائيًا.",
      filter: prior,
      explanationAr: prior ? explainAudienceFilterAr(prior) : null,
      clarificationNeeded: false,
      clarificationPromptAr: null,
      messageDraftAr,
      preview: null,
      autoLaunch: false,
    };
  }

  const json = await generateJson({
    businessId: params.businessId,
    system: [
      "You convert Arabic/English marketing audience requests into AudienceFilterAst JSON only.",
      "Output MUST be a single AudienceFilterAst object matching the schema. No markdown.",
      "Never include customer names, phones, emails, or PII lists.",
      "Prefer erp_* predicates for visit/spend/service history.",
      "Use marketing_permission eligible ONLY when user explicitly asks for consented / campaign-ready recipients. Simple customer lookup must include unconsented customers.",
      "Invoices yesterday = erp_invoice_date with FROM and TO both equal to the previous calendar date in the business timezone. Do NOT use erp_last_visit for invoices yesterday.",
      "Treat a new standalone request as a fresh audience; only combine when mode=refine.",
      "If refining, output only the refinement predicates to merge (still full AST shape).",
      `Business timezone: ${timeZone}. Today: ${today}.`,
      "Schema:",
      FILTER_SCHEMA_HINT,
    ].join("\n"),
    user: JSON.stringify({
      request: message,
      mode,
      // Safe context only — never customer PII
      priorFilter: params.priorFilter ?? null,
      serviceCatalog: catalogSafe,
    }),
  });

  let filter: AudienceFilterAst;
  try {
    const parsed = normalizeCampaignFilterForRequest({
      filter: parseAudienceFilterAst(json),
      message,
      businessToday: today,
    });
    const merged =
      mode === "refine" && params.priorFilter
        ? mergeAudienceFilters(parseAudienceFilterAst(params.priorFilter), parsed)
        : parsed;
    filter = parseAudienceFilterAst(merged);
  } catch (error) {
    if (error instanceof AudienceComplexityError) {
      throw new ValidationError(error.message);
    }
    throw new ValidationError("الذكاء الاصطناعي أرجع فلترًا غير صالح — أعد صياغة الطلب");
  }

  // Ensure at least one marketing-safe default when user asked for campaign audience
  if (
    asksForMarketingEligibility(message)
    && !(filter.all ?? []).some((p) => p.type === "marketing_permission")
  ) {
    filter = {
      ...filter,
      all: [
        ...(filter.all ?? []),
        { type: "marketing_permission", op: "eligible" },
        { type: "has_phone", value: true },
      ],
    };
  }

  const preview = await previewAudience({
    businessId: params.businessId,
    userId: params.userId,
    filter,
    naturalLanguage: message,
    channelConnectionId: params.channelConnectionId,
  });

  const pageEligibleNote =
    preview.countsScope === "preview_page"
      ? ` (مؤهلو صفحة المعاينة ${preview.eligibleMarketing} من ${preview.customers.length} ظاهرين — العدد النهائي يتأكد بعد تثبيت الجمهور)`
      : "";
  let erpHint = "";
  if (preview.totalMatched === 0 && ["all", "any", "exclude"].some((key) =>
    (filter[key as "all" | "any" | "exclude"] ?? []).some((p) => p.type.startsWith("erp_"))
  )) {
    // A zero-result query is not evidence of an empty ERP: first check sync.
    // Do not fetch or log any raw customer / invoice data here.
    const status = await getErpSyncStatus({ businessId: params.businessId }).catch(() => null);
    const invoiceState = status?.resources.find((r) => r.resource === "invoices");
    if (!status?.connected) {
      erpHint = " ملحوظة: ربط ERP غير متصل؛ راجع صفحة مزامنة ERP.";
    } else if (!invoiceState || invoiceState.status !== "SUCCESS") {
      erpHint = " ملحوظة: مزامنة فواتير ERP لسه مش مكتملة؛ راجع صفحة مزامنة ERP وشغّل المزامنة لحد ما تبقى SUCCESS.";
    } else if (status.mirrorCounts.validInvoices === 0) {
      erpHint = " ملحوظة: نسخة CRM مفيهاش فواتير بيع متزامنة حاليًا، رغم ظهور حالة نجاح المزامنة؛ راجع مصدر ERP والربط.";
    } else if (status.mirrorCounts.erpCustomers === 0) {
      erpHint = " ملحوظة: نسخة CRM مفيهاش عملاء ERP مربوطين؛ راجع مزامنة العملاء وربطهم بالفواتير.";
    } else {
      erpHint = " تم العثور على صفر بهذا الفلتر رغم وجود بيانات ERP؛ جرّب بحث أوسع أو راجع أسماء الخدمات والتواريخ.";
    }
  }

  return {
    kind: "filter",
    assistantMessage: `وجدت حوالي ${preview.totalMatched} عميل مطابقين.${pageEligibleNote}${erpHint}`,
    filter: preview.filter,
    explanationAr: preview.explanationAr,
    clarificationNeeded: false,
    clarificationPromptAr: null,
    messageDraftAr: null,
    preview,
    autoLaunch: false,
  };
}
