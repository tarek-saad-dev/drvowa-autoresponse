import { z } from "zod";

import { requireApiBusiness } from "@/lib/api/auth-context";
import { handleApiError, jsonOk, parseJsonBody } from "@/lib/api/http";
import { assertRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import {
  attachCustomerTag,
  detachCustomerTag,
  listCustomerTags,
} from "@/modules/crm/service";

type RouteContext = { params: Promise<{ customerId: string }> };

const attachSchema = z
  .object({
    tagId: z.string().uuid().optional(),
    tagName: z.string().trim().min(1).max(80).optional(),
    color: z.string().trim().max(32).nullable().optional(),
  })
  .strict()
  .refine((v) => Boolean(v.tagId || v.tagName), {
    message: "tagId أو tagName مطلوب",
  });

const detachSchema = z
  .object({
    tagId: z.string().uuid(),
  })
  .strict();

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { user, businessId } = await requireApiBusiness();
    const { customerId } = await context.params;
    const safeId = z.string().uuid().parse(customerId);
    const tags = await listCustomerTags({
      businessId,
      userId: user.userId,
      customerId: safeId,
    });
    return jsonOk({ tags });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { user, businessId } = await requireApiBusiness();
    assertRateLimit("crm-tags-attach:" + businessId, RATE_LIMITS.labelCampaignAction);
    const { customerId } = await context.params;
    const safeId = z.string().uuid().parse(customerId);
    const input = attachSchema.parse(await parseJsonBody(request));
    const tags = await attachCustomerTag({
      businessId,
      userId: user.userId,
      customerId: safeId,
      tagId: input.tagId,
      tagName: input.tagName,
      color: input.color,
    });
    return jsonOk({ tags });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const { user, businessId } = await requireApiBusiness();
    assertRateLimit("crm-tags-detach:" + businessId, RATE_LIMITS.labelCampaignAction);
    const { customerId } = await context.params;
    const safeId = z.string().uuid().parse(customerId);
    const url = new URL(request.url);
    const fromQuery = url.searchParams.get("tagId");
    const body = request.headers.get("content-type")?.includes("application/json")
      ? await parseJsonBody(request).catch(() => ({}))
      : {};
    const input = detachSchema.parse(
      fromQuery ? { tagId: fromQuery } : body,
    );
    const tags = await detachCustomerTag({
      businessId,
      userId: user.userId,
      customerId: safeId,
      tagId: input.tagId,
    });
    return jsonOk({ tags });
  } catch (error) {
    return handleApiError(error);
  }
}
