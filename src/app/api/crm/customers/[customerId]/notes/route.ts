import { z } from "zod";

import { requireApiBusiness } from "@/lib/api/auth-context";
import { handleApiError, jsonOk, parseJsonBody } from "@/lib/api/http";
import { assertRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import {
  addCustomerNote,
  listCustomerNotes,
  updateCustomerNote,
} from "@/modules/crm/service";

type RouteContext = { params: Promise<{ customerId: string }> };

const createSchema = z
  .object({
    body: z.string().trim().min(1).max(4000),
  })
  .strict();

const patchSchema = z
  .object({
    noteId: z.string().uuid(),
    body: z.string().trim().min(1).max(4000),
  })
  .strict();

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { user, businessId } = await requireApiBusiness();
    const { customerId } = await context.params;
    const safeId = z.string().uuid().parse(customerId);
    const notes = await listCustomerNotes({
      businessId,
      userId: user.userId,
      customerId: safeId,
    });
    return jsonOk({ notes });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { user, businessId } = await requireApiBusiness();
    assertRateLimit("crm-notes-create:" + businessId, RATE_LIMITS.labelCampaignAction);
    const { customerId } = await context.params;
    const safeId = z.string().uuid().parse(customerId);
    const input = createSchema.parse(await parseJsonBody(request));
    const note = await addCustomerNote({
      businessId,
      userId: user.userId,
      customerId: safeId,
      body: input.body,
    });
    return jsonOk({ note }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { user, businessId } = await requireApiBusiness();
    assertRateLimit("crm-notes-update:" + businessId, RATE_LIMITS.labelCampaignAction);
    const { customerId } = await context.params;
    const safeId = z.string().uuid().parse(customerId);
    const input = patchSchema.parse(await parseJsonBody(request));
    const note = await updateCustomerNote({
      businessId,
      userId: user.userId,
      customerId: safeId,
      noteId: input.noteId,
      body: input.body,
    });
    return jsonOk({ note });
  } catch (error) {
    return handleApiError(error);
  }
}
