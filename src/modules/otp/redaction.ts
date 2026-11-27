/**
 * WhatsApp sync may mirror messages sent by the DRVO API from the owner's
 * device. Do not persist OTP content in the SaaS message history.
 * Restrict matching to the exact application-generated outbound format.
 */
export const OTP_INBOX_MARKER = "🔐 تم إرسال رمز تحقق (OTP). تم إخفاء الرمز لحماية العميل.";
const OTP_OUTBOUND_PREFIX = /^رمز التحقق الخاص بك في (?:CUT CLUB|حسابك): \*\d{6}\*\nصالح لمدة 5 دقائق\./u;

export function redactMirroredOtp(params: {
  direction: "INBOUND" | "OUTBOUND";
  text: string | null | undefined;
}): string | null {
  if (params.text == null) return null;
  if (params.direction !== "OUTBOUND") return params.text;
  return OTP_OUTBOUND_PREFIX.test(params.text)
    ? OTP_INBOX_MARKER
    : params.text;
}
