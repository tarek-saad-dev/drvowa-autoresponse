export const PLATFORM_SIGNUP_OTP_TYPE = "PLATFORM_SIGNUP_OTP" as const;
export type ExternalIntegrationScope = "erp" | "otp";

export function allowsExternalIntegration(type: string, scope: ExternalIntegrationScope): boolean {
  return type === "DRVO_ERP" || (type === PLATFORM_SIGNUP_OTP_TYPE && scope === "otp");
}
export function allowsOtpPurpose(type: string, purpose: string): boolean {
  return type === "DRVO_ERP" || (type === PLATFORM_SIGNUP_OTP_TYPE && purpose === "SIGNUP");
}
