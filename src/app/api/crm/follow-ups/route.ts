import { z } from "zod";

import { requireApiBusiness } from "@/lib/api/auth-context";
import { handleApiError, jsonOk, parseJsonBody } from "@/lib/api/http";
import { assertRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { createFollowUp, listFollowUps } from "@/modules/crm/service";

const listSchema = z
  .object({
    customerId: z.string().uuid().optional(),
    status: z.enum(["OPEN", "IN_PROGRESS", "COMPLETED", "CANCELLED"]).optional(),
    page: z.coerce.number().int().min(1).max(1000).optional(),
    pageSize: z.coerce.number().int().min(1).max(100).optional(),
  })
  .strict();

const createSchema = z
  .object({
    customerId: z.string().uuid(),
    title: z.string().trim().min(2).max(200),
    description: z.string().trim().max(2000).nullable().optional(),
    dueAtUtc: z.string().datetime().nullable().optional(),
    priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
    assignedUserId: z.string().uuid().nullable().optional(),
    conversationId: z.string().uuid().nullable().optional(),
  })
  .strict();

export async function GET(request: Request) {
  try {
    const { user, businessId } = await requireApiBusiness();
    const url = new URL(request.url);
    const filters = listSchema.parse(Object.fromEntries(url.searchParams.entries()));
    const result = await listFollowUps({
      businessId,
      userId: user.userId,
      customerId: filters.customerId,
      status: filters.status,
      page: filters.page,
      pageSize: filters.pageSize,
    });
    return jsonOk(result);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const { user, businessId } = await requireApiBusiness();
    assertRateLimit("crm-followups-create:" + businessId, RATE_LIMITS.labelCampaignAction);
    const input = createSchema.parse(await parseJsonBody(request));
    const followUp = await createFollowUp({
      businessId,
      userId: user.userId,
      ...input,
    });
    return jsonOk({ followUp }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
