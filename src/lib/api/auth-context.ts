import {
  requireActiveBusinessId,
  requireAuthenticatedUser,
  type AuthenticatedUser,
} from "@/lib/tenancy";

export type ApiUserContext = AuthenticatedUser;

export type ApiBusinessContext = {
  user: AuthenticatedUser;
  businessId: string;
};

/** Requires a valid session cookie / authenticated user. */
export async function requireApiUser(): Promise<ApiUserContext> {
  return requireAuthenticatedUser();
}

/**
 * Resolves the workspace for the request.
 * Prefer session activeBusinessId; if an explicit businessId is provided
 * (body/query), membership is validated before use.
 */
export async function requireApiBusiness(options?: {
  businessId?: string | null;
}): Promise<ApiBusinessContext> {
  const user = await requireAuthenticatedUser();
  const explicit =
    options?.businessId && options.businessId.trim().length > 0
      ? options.businessId.trim()
      : null;

  const businessId = await requireActiveBusinessId({
    userId: user.userId,
    activeBusinessId: user.activeBusinessId,
    preferredBusinessId: explicit,
  });

  return { user, businessId };
}
