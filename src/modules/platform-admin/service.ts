import { ForbiddenError } from "@/lib/tenancy/errors";
import { requireAuthenticatedUser } from "@/lib/tenancy/require-user";
import type { PlatformAdmin, PlatformAdminRole } from "@/types/domain";

import * as repo from "./repository";

export type PlatformAdminContext = {
  userId: string;
  email: string;
  fullName: string;
  sessionId: string;
  admin: PlatformAdmin;
};

const BILLING_ROLES: PlatformAdminRole[] = ["SUPER_ADMIN", "BILLING_ADMIN"];

/**
 * Server-side platform admin gate. Never trust client cookies alone for role —
 * membership is always re-read from TblPlatformAdmin.
 */
export async function requirePlatformAdmin(params?: {
  roles?: PlatformAdminRole[];
}): Promise<PlatformAdminContext> {
  const user = await requireAuthenticatedUser();
  const admin = await repo.findActivePlatformAdminByUserId(user.userId);
  if (!admin) {
    throw new ForbiddenError("Platform admin access required");
  }
  const allowed = params?.roles ?? BILLING_ROLES;
  if (!allowed.includes(admin.role)) {
    throw new ForbiddenError("Insufficient platform admin role");
  }
  return {
    userId: user.userId,
    email: user.email,
    fullName: user.fullName,
    sessionId: user.sessionId,
    admin,
  };
}

export async function isPlatformAdminUser(userId: string): Promise<boolean> {
  const admin = await repo.findActivePlatformAdminByUserId(userId);
  return Boolean(admin);
}

export { upsertPlatformAdmin } from "./repository";
