import type {
  CrmCustomerSource,
  CrmCustomerStatus,
  CrmFollowUpPriority,
  CrmFollowUpStatus,
} from "@/modules/crm/types";

export const CRM_STATUS_LABELS: Record<CrmCustomerStatus, string> = {
  ACTIVE: "نشط",
  INACTIVE: "غير نشط",
  LEAD: "عميل محتمل",
  BLOCKED: "محظور",
  MERGED: "مدمج",
};

export const CRM_SOURCE_LABELS: Record<CrmCustomerSource, string> = {
  MANUAL: "يدوي",
  WHATSAPP: "واتساب",
  ERP: "ERP",
  IMPORT: "استيراد",
  MERGE: "دمج",
};

export const CRM_FOLLOWUP_STATUS_LABELS: Record<CrmFollowUpStatus, string> = {
  OPEN: "مفتوح",
  IN_PROGRESS: "قيد التنفيذ",
  COMPLETED: "مكتمل",
  CANCELLED: "ملغى",
};

export const CRM_PRIORITY_LABELS: Record<CrmFollowUpPriority, string> = {
  LOW: "منخفض",
  MEDIUM: "متوسط",
  HIGH: "مرتفع",
  URGENT: "عاجل",
};

export function formatCrmDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("ar-EG", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatCrmMoney(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toLocaleString("ar-EG", {
    style: "currency",
    currency: "EGP",
    maximumFractionDigits: 0,
  });
}

export async function readApiJson<T>(response: Response): Promise<T & { error?: string; code?: string }> {
  return (await response.json().catch(() => ({}))) as T & { error?: string; code?: string };
}
