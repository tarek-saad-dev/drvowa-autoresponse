import type { BusinessRole } from "@/constants/roles";

import { ForbiddenError } from "./errors";
import { requireBusinessMembership } from "./require-membership";

export async function requireBusinessRole(
  userId: string,
  businessId: string,
  roles: BusinessRole[],
) {
  const membership = await requireBusinessMembership(userId, businessId);
  if (!roles.includes(membership.role)) {
    throw new ForbiddenError("Insufficient business role");
  }
  return membership;
}
