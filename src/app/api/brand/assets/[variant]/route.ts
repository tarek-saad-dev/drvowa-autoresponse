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
  // Until a navigation-only logo is published, preserve the active theme-aware
  // logo already used by the dashboard. Other brand variants stay unchanged.
  const fallbackVariant = variant === "navigation"
    ? new URL(request.url).searchParams.get("surface") === "light" ? "primary-light" : "primary-dark"
    : null;
  try {
    const asset = (await getPublishedBrandImage(variant)) ??
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
    // Preserve the bundled logo if DB is briefly unavailable.
    console.error("[brand] published asset lookup failed", error instanceof Error ? error.name : "unknown");
  }
  const response = NextResponse.redirect(new URL(fallback[fallbackVariant ?? variant], request.url), { status: 307 });
  response.headers.set("Cache-Control", "no-store, max-age=0");
  return response;
}
