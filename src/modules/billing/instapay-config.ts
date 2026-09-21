/**
 * Server-only InstaPay display config for manual customer payment instructions.
 * Never hard-code personal payment details in source.
 */

export type InstaPayDisplayConfig = {
  displayName: string;
  handle: string;
  instructions: string;
  configured: boolean;
};

export function getInstaPayDisplayConfig(): InstaPayDisplayConfig {
  const displayName = process.env.INSTAPAY_PAYMENT_DISPLAY_NAME?.trim() ?? "";
  const handle = process.env.INSTAPAY_PAYMENT_HANDLE?.trim() ?? "";
  const instructions =
    process.env.INSTAPAY_PAYMENT_INSTRUCTIONS?.trim()
    || "حوّل المبلغ عبر InstaPay باستخدام البيانات أعلاه، ثم أرسل تأكيد التحويل من صفحة الفوترة.";

  return {
    displayName: displayName || "InstaPay",
    handle: handle || "—",
    instructions,
    configured: Boolean(displayName && handle),
  };
}

export function isManualInstaPayEnabled(): boolean {
  // Manual billing is the V1 payment method whenever InstaPay display is configured,
  // or always available in development so local/e2e can exercise the flow.
  if (process.env.MANUAL_INSTAPAY_ENABLED === "0") return false;
  if (process.env.MANUAL_INSTAPAY_ENABLED === "1") return true;
  if (getInstaPayDisplayConfig().configured) return true;
  return process.env.NODE_ENV !== "production";
}
