import { NextResponse } from "next/server";

import { getPublishedBrandImage, isBrandVariant } from "@/modules/brand/assets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const fallback: Record<string, string> = {
  "primary-dark": "/brand/logo-on-dark.png",
  "primary-light": "/brand/logo-on-light.png",
  compact: "/brand/logo-on-dark.png",
  stacked: "/brand/logo-on-dark.png",
  icon: "/favicon.ico",
  navigation: "/brand/logo-on-dark.png",
};

export async function GET(request: Request, ctx: { params: Promise<{ variant: string }> }) {
  const { variant } = await ctx.params;
  if (!isBrandVariant(variant)) return new Response("Not found", { status: 404 });
  // Keep old URLs and the previously published shared navigation image working.
  // A theme-specific publication overrides only that theme.
  const navigationVariant = variant === "navigation"
    ? new URL(request.url).searchParams.get("surface") === "light" ? "navigation-light" : "navigation-dark"
    : variant === "navigation-light" || variant === "navigation-dark" ? variant : null;
  const fallbackVariant = navigationVariant
    ? navigationVariant === "navigation-light" ? "primary-light" : "primary-dark"
    : null;
  try {
    const asset = (await getPublishedBrandImage(navigationVariant ?? variant)) ??
      (navigationVariant ? await getPublishedBrandImage("navigation") : null) ??
      (fallbackVariant ? await getPublishedBrandImage(fallbackVariant) : null);
    if (asset) {
      return new Response(Uint8Array.from(asset.data), {
        headers: {
          "Content-Type": asset.mime,
          "Content-Length": String(asset.data.length),
          "Cache-Control": "no-store, max-age=0",
          "Content-Security-Policy": "default-src 'none'; sandbox",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
  } catch (error) {
    // Preserve the bundled logo if asset storage is briefly unavailable.
    console.error("[brand] published asset lookup failed", error instanceof Error ? error.name : "unknown");
  }
  const response = NextResponse.redirect(new URL(fallback[fallbackVariant ?? variant], request.url), { status: 307 });
  response.headers.set("Cache-Control", "no-store, max-age=0");
  return response;
}
