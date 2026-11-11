import { handleApiError, jsonError } from "@/lib/api/http";
import { getBrandImageById } from "@/modules/brand/assets";
import { requirePlatformAdmin } from "@/modules/platform-admin/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requirePlatformAdmin({ roles: ["SUPER_ADMIN"] });
    const { id } = await ctx.params;
    if (!/^[a-f0-9-]{36}$/i.test(id)) return jsonError("Invalid asset", 400);
    const image = await getBrandImageById(id);
    if (!image) return jsonError("Asset not found", 404);
    return new Response(Uint8Array.from(image.data), {
      headers: {
        "Content-Type": image.mime,
        "Content-Length": String(image.data.length),
        "Cache-Control": "private, no-store",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
