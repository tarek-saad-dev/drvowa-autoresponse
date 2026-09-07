import { setSessionActiveBusiness } from "@/modules/auth/session";
import { listBusinessesForUser } from "@/modules/businesses/repository";

import { NotFoundError } from "./errors";
import { requireBusinessMembership } from "./require-membership";

/**
 * Resolves which business is active for the user.
 * Prefers an explicitly requested id (after membership check), then falls back
 * to the first membership. Never trusts client ids without membership.
 */
export async function resolveActiveBusiness(
  userId: string,
  preferredBusinessId?: string | null,
): Promise<string | null> {
  if (preferredBusinessId) {
    await requireBusinessMembership(userId, preferredBusinessId);
    return preferredBusinessId;
  }

  const businesses = await listBusinessesForUser(userId);
  return businesses[0]?.businessId ?? null;
}

export async function setActiveBusiness(params: {
  sessionId: string;
  userId: string;
  businessId: string;
}): Promise<void> {
  await requireBusinessMembership(params.userId, params.businessId);
  await setSessionActiveBusiness({
    sessionId: params.sessionId,
    activeBusinessId: params.businessId,
  });
}

export async function clearActiveBusiness(params: {
  sessionId: string;
}): Promise<void> {
  await setSessionActiveBusiness({
    sessionId: params.sessionId,
    activeBusinessId: null,
  });
}

export async function requireActiveBusinessId(params: {
  userId: string;
  activeBusinessId: string | null;
  preferredBusinessId?: string | null;
}): Promise<string> {
  const businessId = await resolveActiveBusiness(
    params.userId,
    params.preferredBusinessId ?? params.activeBusinessId,
  );
  if (!businessId) {
    throw new NotFoundError("No business workspace available");
  }
  return businessId;
}
