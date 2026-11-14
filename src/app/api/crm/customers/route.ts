import { z } from "zod";

import { requireApiBusiness } from "@/lib/api/auth-context";
import { handleApiError, jsonOk, parseJsonBody } from "@/lib/api/http";
import { assertRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { createCustomer, listCustomers } from "@/modules/crm/service";

const listQuerySchema = z
  .object({
    q: z.string().trim().max(200).optional(),
    status: z.enum(["ACTIVE", "INACTIVE", "LEAD", "BLOCKED", "MERGED"]).optional(),
    tagId: z.string().uuid().optional(),
    source: z.enum(["MANUAL", "WHATSAPP", "ERP", "IMPORT", "MERGE"]).optional(),
    assignedUserId: z.string().uuid().optional(),
    lastInteractionFrom: z.string().trim().min(1).max(40).optional(),
    lastInteractionTo: z.string().trim().min(1).max(40).optional(),
    sort: z.enum(["name", "lastInteraction", "created", "spend"]).optional(),
    sortDir: z.enum(["asc", "desc"]).optional(),
    page: z.coerce.number().int().min(1).max(1000).optional(),
    pageSize: z.coerce.number().int().min(1).max(100).optional(),
  })
  .strict();

const createSchema = z
  .object({
    fullName: z.string().trim().min(2).max(200),
    primaryPhone: z.string().trim().max(32).nullable().optional(),
    email: z.string().trim().email().max(320).nullable().optional(),
    source: z.enum(["MANUAL", "WHATSAPP", "ERP", "IMPORT", "MERGE"]).optional(),
    status: z.enum(["ACTIVE", "INACTIVE", "LEAD", "BLOCKED"]).optional(),
    assignedUserId: z.string().uuid().nullable().optional(),
  })
  .strict();

export async function GET(request: Request) {
  try {
    const { user, businessId } = await requireApiBusiness();
    assertRateLimit("crm-customers-list:" + businessId, RATE_LIMITS.labelCampaignAction);
    const url = new URL(request.url);
    const raw = Object.fromEntries(url.searchParams.entries());
    const filters = listQuerySchema.parse(raw);
    const result = await listCustomers({
      businessId,
      userId: user.userId,
      filters,
    });
    return jsonOk(result);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const { user, businessId } = await requireApiBusiness();
    assertRateLimit("crm-customers-create:" + businessId, RATE_LIMITS.labelCampaignDraft);
    const input = createSchema.parse(await parseJsonBody(request));
    const customer = await createCustomer({
      businessId,
      userId: user.userId,
      ...input,
    });
    return jsonOk({ customer }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
