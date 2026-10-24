import { inboundIssueCopy } from "@/lib/dashboard/inbound-issue-copy";
import type {
  OperationalAttentionCode,
  ReceptionistOperationalHealth,
} from "@/modules/ai/operational-health";

export type ReceptionistStatusKind =
  | "working"
  | "checking"
  | "attention"
  | "whatsapp_disconnected"
  | "ai_paused"
  | "setup_incomplete"
  | "error";

export type ReceptionistStatusAction = {
  href: string;
  label: string;
};

export type ReceptionistStatus = {
  kind: ReceptionistStatusKind;
  headline: string;
  detail: string;
  whatsappLine: string;
  tone: "success" | "warning" | "danger" | "neutral";
  action: ReceptionistStatusAction | null;
};

export type ReceptionistStatusInput = {
  businessName: string;
  /** @deprecated Prefer operational health; kept for narrow unit tests. */
  whatsappStatus?: string | null;
  autoReplyEnabled?: boolean;
  hasActiveAgent?: boolean;
  hasActiveKnowledge?: boolean;
  health?: ReceptionistOperationalHealth | null;
};

function attentionCopy(
  code: OperationalAttentionCode,
  businessName: string,
): Pick<ReceptionistStatus, "headline" | "detail" | "whatsappLine" | "tone" | "action" | "kind"> {
  const name = businessName.trim() || "النشاط";
  switch (code) {
    case "whatsapp_disconnected":
      return {
        kind: "whatsapp_disconnected",
        headline: "الموظف محتاج مراجعة",
        detail: "واتساب مش متصل دلوقتي — الموظف مش هيستقبل رسائل العملاء.",
        whatsappLine: "واتساب غير متصل",
        tone: "warning",
        action: { href: "/dashboard/whatsapp", label: "راجع واتساب" },
      };
    case "inbound_degraded":
      return {
        kind: "attention",
        headline: "الموظف محتاج مراجعة",
        detail: "في مشكلة في استقبال رسائل واتساب.",
        whatsappLine: "واتساب متصل لكن الاستقبال متأثر",
        tone: "warning",
        action: { href: "/dashboard/whatsapp", label: "راجع واتساب" },
      };
    case "worker_unavailable":
      return {
        kind: "attention",
        headline: "الموظف محتاج مراجعة",
        detail: "الردود الآلية متوقفة مؤقتًا — نظام الرد غير متاح حاليًا.",
        whatsappLine: "واتساب متصل",
        tone: "warning",
        action: { href: "/dashboard/inbox", label: "راجع المحادثات" },
      };
    case "job_backlog":
      return {
        kind: "attention",
        headline: "الموظف محتاج مراجعة",
        detail: "في تأخير في معالجة الردود الآلية.",
        whatsappLine: "واتساب متصل",
        tone: "warning",
        action: { href: "/dashboard/inbox", label: "راجع المحادثات" },
      };
    case "outbound_failures":
      return {
        kind: "attention",
        headline: "الموظف محتاج مراجعة",
        detail: "في مشكلة في إرسال الردود.",
        whatsappLine: "واتساب متصل",
        tone: "warning",
        action: { href: "/dashboard/whatsapp", label: "راجع واتساب" },
      };
    case "ai_paused":
      return {
        kind: "ai_paused",
        headline: "الموظف محتاج مراجعة",
        detail: `الردود الآلية متوقفة مؤقتًا لـ ${name}.`,
        whatsappLine: "واتساب متصل",
        tone: "warning",
        action: { href: "/dashboard/agent", label: "شغّل الرد الآلي" },
      };
    case "setup_incomplete":
      return {
        kind: "setup_incomplete",
        headline: "الموظف محتاج مراجعة",
        detail: "لسه فيه خطوة ناقصة قبل ما يعتمد عليه العملاء.",
        whatsappLine: "إعداد غير مكتمل",
        tone: "neutral",
        action: { href: "/dashboard/agent", label: "كمّل الإعداد" },
      };
    case "runtime_error":
      return {
        kind: "error",
        headline: "الموظف محتاج مراجعة",
        detail: "في مشكلة في الاتصال بواتساب. رجّع الربط عشان الموظف يقدر يرد.",
        whatsappLine: "واتساب فيه خطأ",
        tone: "danger",
        action: { href: "/dashboard/whatsapp", label: "راجع واتساب" },
      };
    case "runtime_unknown":
    default:
      return {
        kind: "checking",
        headline: "جاري التحقق من تشغيل الموظف",
        detail: "بنراجع اتصال واتساب وحالة الرد الآلي دلوقتي.",
        whatsappLine: "جاري التحقق…",
        tone: "neutral",
        action: null,
      };
  }
}

/**
 * Derives receptionist UX from operational health.
 * Never returns `working` from persisted DB ACTIVE / config alone.
 */
export function deriveReceptionistStatus(
  input: ReceptionistStatusInput,
): ReceptionistStatus {
  const name = input.businessName.trim() || "النشاط";
  const health = input.health;

  if (health) {
    if (health.overall === "healthy") {
      const waLive = health.whatsappLiveState === "READY";
      return {
        kind: "working",
        headline: "موظفك شغّال",
        detail: `بيرد على عملاء ${name}`,
        whatsappLine: waLive ? "واتساب متصل" : "واتساب متصل",
        tone: "success",
        action: null,
      };
    }
    if (health.overall === "checking" || !health.attentionCode) {
      return attentionCopy("runtime_unknown", name);
    }
    if (health.attentionCode === "inbound_degraded") {
      const info = inboundIssueCopy(health.inboundIssue);
      return {
        ...attentionCopy("inbound_degraded", name),
        headline: info.title,
        detail: info.detail,
        action: { href: "/dashboard/whatsapp", label: "شوف السبب والحل" },
      };
    }
    return attentionCopy(health.attentionCode, name);
  }

  // Legacy narrow path for unit tests without full health aggregation.
  // Intentionally conservative: never report working without live health.
  const wa = (input.whatsappStatus ?? "").toUpperCase();
  if (wa === "ERROR") {
    return attentionCopy("runtime_error", name);
  }
  if (wa && wa !== "READY" && wa !== "ACTIVE") {
    return attentionCopy("whatsapp_disconnected", name);
  }
  if (input.hasActiveAgent === false || input.hasActiveKnowledge === false) {
    return attentionCopy("setup_incomplete", name);
  }
  if (input.autoReplyEnabled === false) {
    return attentionCopy("ai_paused", name);
  }
  return attentionCopy("runtime_unknown", name);
}
