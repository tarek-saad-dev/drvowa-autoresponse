/**
 * Server-authoritative post-login destination.
 * Platform admin always wins over workspace/onboarding checks.
 */
export type PostLoginPath = "/admin" | "/dashboard" | "/onboarding";

export function resolvePostLoginPath(params: {
  isPlatformAdmin: boolean;
  hasBusiness: boolean;
}): PostLoginPath {
  if (params.isPlatformAdmin) {
    return "/admin";
  }
  if (params.hasBusiness) {
    return "/dashboard";
  }
  return "/onboarding";
}
