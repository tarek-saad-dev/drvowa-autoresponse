/** Shared Arabic labels for customer-facing status. */

import {
  KNOWLEDGE_CATEGORIES,
  type KnowledgeCategory,
} from "@/constants/knowledge";

export function knowledgeCategoryLabel(
  category: string | null | undefined,
): string {
  switch ((category ?? "").toUpperCase()) {
    case KNOWLEDGE_CATEGORIES.FAQ:
      return "سؤال وإجابة";
    case KNOWLEDGE_CATEGORIES.ABOUT:
      return "عن النشاط";
    case KNOWLEDGE_CATEGORIES.POLICY:
      return "سياسة";
    case KNOWLEDGE_CATEGORIES.SERVICE:
      return "الخدمات والأسعار";
    case KNOWLEDGE_CATEGORIES.LOCATION_INFO:
      return "ساعات العمل";
    case KNOWLEDGE_CATEGORIES.CUSTOM:
      return "معلومة أخرى";
    default:
      return "معلومة";
  }
}

export const KNOWLEDGE_CATEGORY_OPTIONS: {
  value: KnowledgeCategory;
  label: string;
}[] = [
  { value: KNOWLEDGE_CATEGORIES.FAQ, label: knowledgeCategoryLabel("FAQ") },
  { value: KNOWLEDGE_CATEGORIES.ABOUT, label: knowledgeCategoryLabel("ABOUT") },
  {
    value: KNOWLEDGE_CATEGORIES.SERVICE,
    label: knowledgeCategoryLabel("SERVICE"),
  },
  {
    value: KNOWLEDGE_CATEGORIES.POLICY,
    label: knowledgeCategoryLabel("POLICY"),
  },
  {
    value: KNOWLEDGE_CATEGORIES.LOCATION_INFO,
    label: knowledgeCategoryLabel("LOCATION_INFO"),
  },
  {
    value: KNOWLEDGE_CATEGORIES.CUSTOM,
    label: knowledgeCategoryLabel("CUSTOM"),
  },
];

export function whatsappStatusLabel(status: string | null | undefined): string {
  switch ((status ?? "").toUpperCase()) {
    case "ACTIVE":
    case "READY":
      return "متصل";
    case "PENDING":
    case "STARTING":
    case "CONNECTING":
      return "جارٍ الاتصال";
    case "QR_REQUIRED":
      return "بانتظار مسح الرمز";
    case "DISCONNECTED":
      return "غير متصل";
    case "LOGGED_OUT":
      return "يلزم إعادة الربط";
    case "ERROR":
      return "خطأ في الاتصال";
    case "INACTIVE":
      return "غير نشط";
    default:
      return status?.trim() ? "حالة غير معروفة" : "غير مربوط";
  }
}

export function subscriptionStatusLabel(
  status: string | null | undefined,
): string {
  switch ((status ?? "").toUpperCase()) {
    case "ACTIVE":
      return "نشط";
    case "TRIALING":
      return "تجريبي";
    case "PAST_DUE":
      return "متأخر الدفع";
    case "CANCELED":
      return "ملغى";
    case "INACTIVE":
      return "غير نشط";
    case "EXPIRED":
      return "منتهٍ";
    default:
      return "—";
  }
}

export function formatUsageRenewalAr(periodEndUtc: Date): string {
  const d = new Date(periodEndUtc);
  if (Number.isNaN(d.getTime())) return "بداية الشهر القادم";
  return new Intl.DateTimeFormat("ar-SA", {
    day: "numeric",
    month: "long",
  }).format(d);
}

export function messageBodyDisplay(params: {
  textContent: string | null;
  contentType: string;
}): string {
  const text = params.textContent?.trim();
  if (text) return text;
  const t = (params.contentType || "").toLowerCase();
  if (t.includes("image")) return "📷 صورة";
  if (t.includes("audio") || t.includes("ptt") || t.includes("voice")) {
    return "🎙️ رسالة صوتية";
  }
  if (t.includes("video")) return "🎬 فيديو";
  if (t.includes("document") || t.includes("file")) return "📎 ملف";
  if (t.includes("sticker")) return "ملصق";
  if (t.includes("location")) return "📍 موقع";
  if (t.includes("contact")) return "جهة اتصال";
  return "رسالة غير نصية";
}
