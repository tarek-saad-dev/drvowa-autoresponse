import { randomUUID } from "node:crypto";

import { BUSINESS_ROLES } from "@/constants/roles";
import { withTransaction } from "@/lib/db";
import { NotFoundError } from "@/lib/tenancy/errors";
import { writeAuditEvent } from "@/modules/audit/service";
import { ensureDefaultSubscription } from "@/modules/billing/service";
import type { Business, BusinessStatus } from "@/types/domain";

import * as repo from "./repository";
import { buildUniqueSlugCandidate, slugifyBusinessName } from "./slug";

async function allocateUniqueSlug(baseName: string): Promise<string> {
  const base = slugifyBusinessName(baseName);
  for (let i = 0; i < 50; i += 1) {
    const candidate = buildUniqueSlugCandidate(base, i);
    const existing = await repo.findBusinessBySlug(candidate);
    if (!existing) {
      return candidate;
    }
  }
  return `${base.slice(0, 80)}-${randomUUID().slice(0, 8)}`;
}

export async function createBusiness(params: {
  ownerUserId: string;
  name: string;
  category: string;
  countryCode: string;
  locale: string;
  timezone: string;
}): Promise<Business> {
  const businessId = randomUUID();
  const slug = await allocateUniqueSlug(params.name);

  const business = await withTransaction(async (trx) => {
    const created = await repo.insertBusiness(
      {
        businessId,
        name: params.name.trim(),
        slug,
        category: params.category.trim(),
        countryCode: params.countryCode.trim().toUpperCase(),
        locale: params.locale.trim(),
        timezone: params.timezone.trim(),
      },
      trx,
    );

    await repo.insertBusinessMember(
      {
        businessId,
        userId: params.ownerUserId,
        role: BUSINESS_ROLES.OWNER,
      },
      trx,
    );

    return created;
  });

  await ensureDefaultSubscription({ businessId: business.businessId });

  await writeAuditEvent({
    businessId: business.businessId,
    actorUserId: params.ownerUserId,
    action: "business.create",
    entityType: "Business",
    entityId: business.businessId,
    metadata: { slug: business.slug },
  });

  return business;
}

export async function getBusinessById(params: {
  businessId: string;
}): Promise<Business> {
  const business = await repo.getBusinessById({
    businessId: params.businessId,
  });
  if (!business) {
    throw new NotFoundError("Business not found");
  }
  return business;
}

export async function listBusinessesForUser(
  userId: string,
): Promise<Business[]> {
  return repo.listBusinessesForUser(userId);
}

export async function updateBusiness(params: {
  businessId: string;
  name?: string;
  category?: string;
  countryCode?: string;
  locale?: string;
  timezone?: string;
  status?: BusinessStatus;
  onboardingCompletedAtUtc?: Date | null;
}): Promise<Business> {
  const updated = await repo.updateBusinessRecord(params);
  if (!updated) {
    throw new NotFoundError("Business not found");
  }
  return updated;
}

export async function getMembership(params: {
  userId: string;
  businessId: string;
}) {
  return repo.getMembership(params);
}
