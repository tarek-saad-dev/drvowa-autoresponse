import { z } from "zod";
import { handleApiError, jsonOk, parseJsonBody } from "@/lib/api/http";
import { requirePlatformAdmin } from "@/modules/platform-admin/service";
import { setPrivateUnlimited } from "@/modules/billing/private-unlimited";

const schema = z.object({ action: z.enum(["assign","revoke"]), reason: z.string().trim().min(1).max(1000) }).strict();

export async function POST(request: Request, context: { params: Promise<{ businessId: string }> }) {
  try {
    const admin = await requirePlatformAdmin({ roles: ["SUPER_ADMIN"] });
    const { businessId } = await context.params;
    const id = z.string().uuid().parse(businessId);
    const body = schema.parse(await parseJsonBody(request));
    return jsonOk(await setPrivateUnlimited({ businessId: id, actorUserId: admin.userId, ...body }));
  } catch (error) {
    return handleApiError(error);
  }
}
