import { handleApiError, jsonOk } from "@/lib/api/http";
import { ValidationError } from "@/lib/tenancy/errors";
import { assertBrandAdminSameOrigin } from "@/lib/security/brand-origin";
import { activateBrandAsset, deleteDraftBrandAsset } from "@/modules/brand/assets";
import { requirePlatformAdmin } from "@/modules/platform-admin/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export async function PATCH(request: Request, ctx: Params) {
  try {
    await requirePlatformAdmin({ roles: ["SUPER_ADMIN"] });
    assertBrandAdminSameOrigin(request);
    const { id } = await ctx.params;
    if (!uuid.test(id)) throw new ValidationError("معرّف اللوجو غير صالح.");
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || !("action" in body) ||
      (body as { action: unknown }).action !== "publish") {
      throw new ValidationError("إجراء الاعتماد غير صالح.");
    }
    await activateBrandAsset(id);
    return jsonOk({ id, status: "ACTIVE" });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: Request, ctx: Params) {
  try {
    await requirePlatformAdmin({ roles: ["SUPER_ADMIN"] });
    assertBrandAdminSameOrigin(request);
    const { id } = await ctx.params;
    if (!uuid.test(id)) throw new ValidationError("معرّف اللوجو غير صالح.");
    await deleteDraftBrandAsset(id);
    return jsonOk({ id, deleted: true });
  } catch (error) {
    return handleApiError(error);
  }
}
