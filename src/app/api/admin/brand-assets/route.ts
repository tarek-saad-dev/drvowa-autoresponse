import { handleApiError, jsonOk } from "@/lib/api/http";
import { ValidationError } from "@/lib/tenancy/errors";
import { assertBrandAdminSameOrigin } from "@/lib/security/brand-origin";
import { isBrandVariant, listBrandAssets, MAX_BRAND_FILE_BYTES, stageBrandAsset } from "@/modules/brand/assets";
import { requirePlatformAdmin } from "@/modules/platform-admin/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requirePlatformAdmin({ roles: ["SUPER_ADMIN"] });
    return jsonOk({ assets: await listBrandAssets() });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const admin = await requirePlatformAdmin({ roles: ["SUPER_ADMIN"] });
    assertBrandAdminSameOrigin(request);
    const length = Number(request.headers.get("content-length") ?? "0");
    if (length > MAX_BRAND_FILE_BYTES + 64_000) {
      throw new ValidationError("حجم الملف يتجاوز 2 ميجابايت.");
    }
    const form = await request.formData();
    const variant = form.get("variant");
    const file = form.get("file");
    if (typeof variant !== "string" || !isBrandVariant(variant) || !(file instanceof File)) {
      throw new ValidationError("اختار نوع اللوجو وصورة صحيحة.");
    }
    const id = await stageBrandAsset({ variant, file, userId: admin.userId });
    return jsonOk({ id, status: "DRAFT" }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
