export const PRIVACY_MODES = ["ALL", "BUSINESS_ONLY", "MANUAL"] as const;
export type PrivacyMode = typeof PRIVACY_MODES[number];
export type PrivacyModePolicy = { mode: PrivacyMode; updatedAtUtc: Date | null; approved: { phone: string; at: Date }[] };
export function modeAllowsCapture(policy: PrivacyModePolicy, phone: string | null | undefined) {
  return policy.mode !== "BUSINESS_ONLY" || Boolean(phone && policy.approved.some(p => p.phone === phone));
}
export function modeAllowsAi(policy: PrivacyModePolicy, phone: string | null | undefined, at: Date) {
  if (policy.updatedAtUtc && at < policy.updatedAtUtc) return false;
  if (policy.mode === "ALL") return true;
  return Boolean(phone && policy.approved.some(p => p.phone === phone && at >= p.at));
}
