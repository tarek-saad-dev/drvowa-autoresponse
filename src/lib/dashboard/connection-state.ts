export type OverviewWhatsAppState =
  | "NOT_CONNECTED" | "STARTING" | "QR_REQUIRED" | "CONNECTING"
  | "READY" | "DISCONNECTED" | "LOGGED_OUT" | "ERROR"
  | "RUNTIME_DISABLED";

export type OverviewInboundHealth = "healthy" | "degraded" | "unknown" | null;

export type OverviewConnectionState = {
  title: string;
  detail: string;
  tone: "success" | "warning" | "danger" | "neutral";
  canSend: boolean;
  actionLabel: string | null;
};

export function describeOverviewConnection(
  state: OverviewWhatsAppState | null,
  inbound: OverviewInboundHealth,
): OverviewConnectionState {
  switch (state) {
    case "READY":
      if (inbound === "degraded") {
        return {
          title: "واتساب متصل، والاستقبال محتاج مراجعة",
          detail: "تقدر تراجع المحادثات المحفوظة، لكن وصول الرسائل الجديدة ممكن يتأثر.",
          tone: "warning", canSend: true, actionLabel: "راجع واتساب",
        };
      }
      if (inbound !== "healthy") {
        return {
          title: "واتساب متصل — بنراجع الاستقبال",
          detail: "تم تأكيد الاتصال، لكن حالة استقبال الرسائل لسه مش مؤكدة.",
          tone: "neutral", canSend: true, actionLabel: "حالة واتساب",
        };
      }
      return {
        title: "واتساب متصل وجاهز",
        detail: "الاتصال واستقبال الرسائل شغالين بشكل طبيعي.",
        tone: "success", canSend: true, actionLabel: null,
      };
    case "STARTING":
    case "CONNECTING":
      return {
        title: "بنستعيد اتصال واتساب",
        detail: "الإرسال والرد التلقائي غير متاحين لحد ما الاتصال يكتمل.",
        tone: "neutral", canSend: false, actionLabel: "حالة الاتصال",
      };
    case "QR_REQUIRED":
    case "LOGGED_OUT":
      return {
        title: "واتساب محتاج إعادة ربط",
        detail: "امسح رمز QR من الموبايل لاستعادة استقبال الرسائل والردود.",
        tone: "warning", canSend: false, actionLabel: "اربط واتساب",
      };
    case "DISCONNECTED":
    case "NOT_CONNECTED":
      return {
        title: "واتساب غير متصل",
        detail: "الردود والإرسال متوقفين، لكن المحادثات المحفوظة لسه متاحة.",
        tone: "warning", canSend: false, actionLabel: "إعادة الاتصال",
      };
    case "ERROR":
    case "RUNTIME_DISABLED":
      return {
        title: "في مشكلة في اتصال واتساب",
        detail: "الردود والإرسال متوقفين. راجع الاتصال لاستعادة الخدمة.",
        tone: "danger", canSend: false, actionLabel: "راجع المشكلة",
      };
    default:
      return {
        title: "جارٍ التحقق من واتساب",
        detail: "مش قادرين نؤكد الاتصال دلوقتي. البيانات المحفوظة متاحة للقراءة.",
        tone: "neutral", canSend: false, actionLabel: "حالة واتساب",
      };
  }
}
