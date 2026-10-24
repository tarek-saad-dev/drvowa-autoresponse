import type { InboundDeliveryIssue } from "@/modules/channels/whatsapp-service";

/** Clear customer-safe explanation and next step for an active inbound issue. */
export function inboundIssueCopy(issue: InboundDeliveryIssue | null | undefined): {
  title: string;
  detail: string;
  nextStep: string;
} {
  switch (issue) {
    case "delivery_stopped":
      return {
        title: "خدمة توصيل الرسائل متوقفة",
        detail: "رقم واتساب متصل، لكن خدمة نقل الرسائل الجديدة للتطبيق متوقفة حاليًا.",
        nextStep: "أعد فحص الحالة. لو المشكلة مستمرة، بلّغ الدعم الفني؛ مش مطلوب تفصل رقم واتساب.",
      };
    case "config_missing":
      return {
        title: "إعدادات استقبال الرسائل ناقصة",
        detail: "في إعدادات مطلوبة على السيرفر قبل ما الرسائل الجديدة توصل للتطبيق.",
        nextStep: "تواصل مع الدعم لاستكمال إعدادات السيرفر. ما تفصلش الرقم.",
      };
    case "auth_config":
      return {
        title: "مشكلة في صلاحية تسليم الرسائل",
        detail: "السيرفر مش قادر يؤكد صلاحية إرسال الرسائل الواردة للنظام.",
        nextStep: "الدعم الفني محتاج يراجع إعدادات المصادقة على السيرفر. ما تعيدش ربط واتساب.",
      };
    case "mapping_config":
      return {
        title: "مشكلة في ربط الرسائل بالنشاط",
        detail: "الرسائل الجديدة مش متطابقة مع ربط حساب واتساب بالنشاط داخل النظام.",
        nextStep: "تواصل مع الدعم لمراجعة ربط الحساب. ما تفصلش الرقم.",
      };
    case "capture_listener_stopped":
      return {
        title: "متابعة بعض الرسائل متوقفة",
        detail: "في رسائل منتظرة استكمال بياناتها، لكن خدمة متابعتها مش شغالة.",
        nextStep: "أعد الفحص، ولو المشكلة مستمرة تواصل مع الدعم الفني.",
      };
    case "decrypt_failures":
      return {
        title: "بعض الرسائل الجديدة مش قابلة للقراءة",
        detail: "تم رصد إخفاقات حديثة ومتكررة في قراءة محتوى الرسائل، رغم إن واتساب متصل.",
        nextStep: "ابعت رسالة اختبار من رقم مختلف. لو ما ظهرتش في المحادثات، تواصل مع الدعم.",
      };
    default:
      return {
        title: "استقبال الرسائل غير مؤكد",
        detail: "واتساب متصل، لكن بيانات التشخيص مش كافية لتأكيد وصول الرسائل الجديدة.",
        nextStep: "أعد الفحص وجرّب رسالة من رقم مختلف؛ لو ما وصلتش، تواصل مع الدعم.",
      };
  }
}
