import { z } from "zod";

import { requireApiBusiness } from "@/lib/api/auth-context";
import { handleApiError, jsonOk, parseJsonBody } from "@/lib/api/http";
import { assertRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { getCustomerProfile, updateCustomer } from "@/modules/crm/service";

type RouteContext = { params: Promise<{ customerId: string }> };

const patchSchema = z
  .object({
    fullName: z.string().trim().min(2).max(200).optional(),
    primaryPhone: z.string().trim().max(32).nullable().optional(),
    email: z.string().trim().email().max(320).nullable().optional(),
    status: z.enum(["ACTIVE", "INACTIVE", "LEAD", "BLOCKED"]).optional(),
    assignedUserId: z.string().uuid().nullable().optional(),
  })
  .strict();

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { user, businessId } = await requireApiBusiness();
    const { customerId } = await context.params;
    const safeId = z.string().uuid().parse(customerId);
    const profile = await getCustomerProfile({
      businessId,
      userId: user.userId,
      customerId: safeId,
    });
    return jsonOk({ profile });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { user, businessId } = await requireApiBusiness();
    assertRateLimit("crm-customers-update:" + businessId, RATE_LIMITS.labelCampaignAction);
    const { customerId } = await context.params;
    const safeId = z.string().uuid().parse(customerId);
    const input = patchSchema.parse(await parseJsonBody(request));
    const customer = await updateCustomer({
      businessId,
      userId: user.userId,
      customerId: safeId,
      ...input,
    });
    return jsonOk({ customer });
  } catch (error) {
    return handleApiError(error);
  }
}
