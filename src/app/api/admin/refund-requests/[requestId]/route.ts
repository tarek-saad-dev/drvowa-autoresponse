import { z } from "zod";
import { handleApiError, jsonOk, parseJsonBody } from "@/lib/api/http";
import { requirePlatformAdmin } from "@/modules/platform-admin/service";
import { rejectCustomerRefund } from "@/modules/billing/customer-account-actions";

type Context = { params: Promise<{ requestId: string }> };
const schema = z.object({
  action: z.literal("reject"),
  note: z.string().trim().min(5).max(1000),
});

export async function POST(request: Request, context: Context) {
  try {
    const admin = await requirePlatformAdmin();
    const { requestId } = await context.params;
    const validatedId = z.string().uuid().parse(requestId);
    const input = schema.parse(await parseJsonBody(request));
    return jsonOk(await rejectCustomerRefund({
      requestId: validatedId, adminUserId: admin.userId, note: input.note,
    }));
  } catch (error) {
    return handleApiError(error);
  }
}
