export type ReceptionistStatusKind =
  | "working"
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
  whatsappStatus: string | null | undefined;
  autoReplyEnabled: boolean;
  hasActiveAgent: boolean;
  hasActiveKnowledge: boolean;
};

function isWhatsAppActive(status: string | null | undefined): boolean {
  const value = (status ?? "").toUpperCase();
  return value === "ACTIVE" || value === "READY";
}

function isWhatsAppError(status: string | null | undefined): boolean {
  const value = (status ?? "").toUpperCase();
  return value === "ERROR";
}

/**
 * Derives receptionist health from verified backend signals.
 * WhatsApp connected alone never implies the AI worker is operational.
 */
export function deriveReceptionistStatus(
  input: ReceptionistStatusInput,
): ReceptionistStatus {
  const name = input.businessName.trim() || "النشاط";
  const waActive = isWhatsAppActive(input.whatsappStatus);
  const waError = isWhatsAppError(input.whatsappStatus);
  const setupReady = input.hasActiveAgent && input.hasActiveKnowledge;

  if (waError) {
    return {
      kind: "error",
      headline: "في مشكلة في الاتصال",
      detail: "واتساب رجّع حالة خطأ. رجّع الربط عشان الموظف يقدر يرد.",
      whatsappLine: "واتساب فيه خطأ",
      tone: "danger",
      action: { href: "/dashboard/whatsapp", label: "راجع واتساب" },
    };
  }

  if (!waActive) {
    return {
      kind: "whatsapp_disconnected",
      headline: "واتساب مش متصل",
      detail: "من غير واتساب، الموظف مش هيستقبل رسائل العملاء.",
      whatsappLine: "واتساب غير متصل",
      tone: "warning",
      action: { href: "/dashboard/whatsapp", label: "اربط واتساب" },
    };
  }

  if (!setupReady) {
    const next = !input.hasActiveAgent
      ? { href: "/dashboard/agent", label: "جهّز الموظف" }
      : { href: "/dashboard/knowledge", label: "علّمه معلومة" };
    return {
      kind: "setup_incomplete",
      headline: "لسه فيه خطوة ناقصة",
      detail: !input.hasActiveAgent
        ? "كمّل إعداد موظف الاستقبال عشان يبدأ يرد باحتراف."
        : "علّم الموظف معلومات النشاط قبل ما يعتمد عليه العملاء.",
      whatsappLine: "واتساب متصل",
      tone: "neutral",
      action: next,
    };
  }

  if (!input.autoReplyEnabled) {
    return {
      kind: "ai_paused",
      headline: "الموظف الذكي متوقف",
      detail: `واتساب متصل، لكن الرد الآلي متوقف حاليًا لـ ${name}.`,
      whatsappLine: "واتساب متصل",
      tone: "warning",
      action: { href: "/dashboard/agent", label: "شغّل الرد الآلي" },
    };
  }

  return {
    kind: "working",
    headline: "موظفك شغّال",
    detail: `بيرد على عملاء ${name}`,
    whatsappLine: "واتساب متصل",
    tone: "success",
    action: null,
  };
}
