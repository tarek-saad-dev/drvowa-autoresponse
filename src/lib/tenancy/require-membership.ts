import { getMembership } from "@/modules/businesses/repository";

import { ForbiddenError } from "./errors";

export async function requireBusinessMembership(
  userId: string,
  businessId: string,
) {
  const membership = await getMembership({ userId, businessId });
  if (!membership || membership.status !== "ACTIVE") {
    throw new ForbiddenError("Business membership required");
  }
  return membership;
}
