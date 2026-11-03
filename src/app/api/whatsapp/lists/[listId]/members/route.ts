import { z } from "zod";

import { requireApiBusiness } from "@/lib/api/auth-context";
import { handleApiError, jsonOk, parseJsonBody } from "@/lib/api/http";
import { assertRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { requireLabelCampaignOwner } from "@/modules/messaging/label-campaign-drafts";
import {
  addDrvoListPhones, listDrvoListMembers, parseListPhones, removeDrvoListPhone,
} from "@/modules/messaging/local-whatsapp-lists";

type Context = { params: Promise<{ listId: string }> };
const importSchema = z.object({ text: z.string().min(1).max(3000) }).strict();
const removeSchema = z.object({ phone: z.string().trim().min(8).max(32) }).strict();

export async function GET(_request: Request, context: Context) {
  try {
    const { user, businessId } = await requireApiBusiness();
    await requireLabelCampaignOwner({ businessId, userId: user.userId });
    const listId = (await context.params).listId;
    const members = await listDrvoListMembers({ businessId, listId });
    return jsonOk({ members, readLimit: 250 });
  } catch (error) { return handleApiError(error); }
}

export async function POST(request: Request, context: Context) {
  try {
    const { user, businessId } = await requireApiBusiness();
    await requireLabelCampaignOwner({ businessId, userId: user.userId });
    assertRateLimit("drvo-lists-import:" + businessId, RATE_LIMITS.labelCampaignAction);
    const { text } = importSchema.parse(await parseJsonBody(request));
    const phones = parseListPhones(text);
    const result = await addDrvoListPhones({
      businessId, listId: (await context.params).listId, phones,
    });
    return jsonOk({ ...result, source: "DRVO", sendsMessages: false });
  } catch (error) { return handleApiError(error); }
}

export async function DELETE(request: Request, context: Context) {
  try {
    const { user, businessId } = await requireApiBusiness();
    await requireLabelCampaignOwner({ businessId, userId: user.userId });
    assertRateLimit("drvo-lists-members-remove:" + businessId, RATE_LIMITS.labelCampaignAction);
    const { phone } = removeSchema.parse(await parseJsonBody(request));
    const removed = await removeDrvoListPhone({
      businessId, listId: (await context.params).listId, phone,
    });
    return jsonOk({ removed });
  } catch (error) { return handleApiError(error); }
}
