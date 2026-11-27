import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  BRAND_VARIANTS, MAX_BRAND_FILE_BYTES, activateBrandAsset,
  deleteDraftBrandAsset, getBrandImageById, getPublishedBrandImage,
  isBrandVariant, listBrandAssets, stageBrandAsset, validateBrandImage,
} from "@/modules/brand/assets";

import { GET as getPublicBrandAsset } from "@/app/api/brand/assets/[variant]/route";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const page = source("src/app/admin/brand-assets/page.tsx");
const adminNav = source("src/components/admin/admin-navigation.tsx");
const adminLayout = source("src/app/admin/layout.tsx");
const listRoute = source("src/app/api/admin/brand-assets/route.ts");
const modifyRoute = source("src/app/api/admin/brand-assets/[id]/route.ts");
const previewRoute = source("src/app/api/admin/brand-assets/[id]/image/route.ts");
const publicRoute = source("src/app/api/brand/assets/[variant]/route.ts");
const moduleSource = source("src/modules/brand/assets.ts");
const dashboardTopbar = source("src/components/dashboard/topbar.tsx");
const brandLogo = source("src/components/brand/brand-logo.tsx");
const adminAssets = source("src/components/admin/admin-brand-assets.tsx");

function minimalPng(): Buffer {
  const b = Buffer.alloc(24);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(b);
  b.write("IHDR", 12, 4, "ascii");
  b.writeUInt32BE(1, 16);
  b.writeUInt32BE(1, 20);
  return b;
}
const file = (name: string, bytes: Buffer, type = "image/png") =>
  new File([new Uint8Array(bytes)], name, { type });

let previousRoot: string | undefined;
let sandbox: string;
beforeAll(async () => {
  previousRoot = process.env.DRVO_BRAND_ASSET_DIR;
  sandbox = await mkdtemp(join(tmpdir(), "drvo-brand-assets-"));
  process.env.DRVO_BRAND_ASSET_DIR = sandbox;
});
afterAll(async () => {
  if (previousRoot === undefined) delete process.env.DRVO_BRAND_ASSET_DIR;
  else process.env.DRVO_BRAND_ASSET_DIR = previousRoot;
  await rm(sandbox, { recursive: true, force: true });
});

describe("DRVO Super Admin Brand Assets without SQL migration", () => {
  it("supports all known variants and rejects path traversal", () => {
    expect(BRAND_VARIANTS).toEqual(["primary-dark", "primary-light", "compact", "stacked", "icon", "navigation", "navigation-light", "navigation-dark"]);
    for (const variant of BRAND_VARIANTS) expect(isBrandVariant(variant)).toBe(true);
    for (const invalid of ["../../../etc", "favicon.svg", "__proto__", "", "primary-light/../icon"]) {
      expect(isBrandVariant(invalid)).toBe(false);
    }
  });

  it("enforces real image signatures, size limits and PNG dimension limits", async () => {
    const image = await validateBrandImage(file("brand.png", minimalPng()));
    expect(image.data.length).toBe(24);
    await expect(validateBrandImage(file("evil.svg", Buffer.from("<svg onload='alert(1)'/>"), "image/svg+xml")))
      .rejects.toThrow("SVG");
    await expect(validateBrandImage(file("fake.png", Buffer.from("<svg/>")))).rejects.toThrow();
    await expect(validateBrandImage(file("huge.png", Buffer.alloc(MAX_BRAND_FILE_BYTES + 1))))
      .rejects.toThrow("2 ميجابايت");
    const invalidDimensions = minimalPng();
    invalidDimensions.writeUInt32BE(50_000, 16);
    await expect(validateBrandImage(file("big.png", invalidDimensions))).rejects.toThrow("4096");
  });

  it("stages privately, publishes only on approval and rolls back to an older uploaded image", async () => {
    const first = minimalPng();
    const firstId = await stageBrandAsset({
      variant: "primary-dark", file: file("old-logo.png", first), userId: "test-super-admin",
    });
    expect(await getPublishedBrandImage("primary-dark")).toBeNull();
    expect((await listBrandAssets()).find((asset) => asset.id === firstId)?.active).toBe(false);
    expect(await getBrandImageById(firstId)).toEqual({ mime: "image/png", data: new Uint8Array(first) });
    await activateBrandAsset(firstId);
    expect((await listBrandAssets()).find((asset) => asset.id === firstId)?.active).toBe(true);
    expect(await getPublishedBrandImage("primary-dark")).toEqual({ mime: "image/png", data: new Uint8Array(first) });

    const second = minimalPng();
    second.writeUInt32BE(2, 16);
    const secondId = await stageBrandAsset({
      variant: "primary-dark", file: file("new-logo.png", second), userId: "test-super-admin",
    });
    expect((await listBrandAssets()).find((asset) => asset.id === firstId)?.active).toBe(true);
    await activateBrandAsset(secondId);
    const changed = await listBrandAssets();
    expect(changed.find((asset) => asset.id === secondId)?.active).toBe(true);
    expect(changed.find((asset) => asset.id === firstId)?.active).toBe(false);
    expect(await getPublishedBrandImage("primary-dark")).toEqual({ mime: "image/png", data: new Uint8Array(second) });
    await expect(deleteDraftBrandAsset(secondId)).rejects.toThrow("لا يمكن حذف اللوجو المنشور");
    await activateBrandAsset(firstId);
    await deleteDraftBrandAsset(secondId);
    expect(await getBrandImageById(secondId)).toBeNull();
    expect((await listBrandAssets()).map((asset) => asset.id)).not.toContain(secondId);
    expect(await getPublishedBrandImage("primary-dark")).toEqual({ mime: "image/png", data: new Uint8Array(first) });
  });

  it("keeps active versions independently isolated per variant", async () => {
    const iconId = await stageBrandAsset({
      variant: "icon", file: file("favicon.png", minimalPng()), userId: "test-super-admin",
    });
    await activateBrandAsset(iconId);
    expect(await getPublishedBrandImage("icon")).not.toBeNull();
    expect(await getPublishedBrandImage("primary-light")).toBeNull();
    const pointer = JSON.parse(await readFile(join(sandbox, "published", "icon.json"), "utf8")) as { id: string };
    expect(pointer.id).toBe(iconId);
  });

  it("manages the navigation image independently from all brand and favicon slots", async () => {
    const darkFallback = await getPublicBrandAsset(new Request("https://example.com/api/brand/assets/navigation?surface=dark"), { params: Promise.resolve({ variant: "navigation" }) });
    expect(darkFallback.status).toBe(200);
    expect(Buffer.from(await darkFallback.arrayBuffer())).toEqual(Buffer.from((await getPublishedBrandImage("primary-dark"))!.data));
    const lightFallback = await getPublicBrandAsset(new Request("https://example.com/api/brand/assets/navigation-light"), { params: Promise.resolve({ variant: "navigation-light" }) });
    expect(lightFallback.status).toBe(307);
    expect(lightFallback.headers.get("location")).toBe("https://example.com/brand/logo-on-light.png");
    const navigationId = await stageBrandAsset({
      variant: "navigation", file: file("nav-only.png", minimalPng()), userId: "test-super-admin",
    });
    expect(await getPublishedBrandImage("navigation")).toBeNull();
    await activateBrandAsset(navigationId);
    expect(await getPublishedBrandImage("navigation")).not.toBeNull();
    const active = await listBrandAssets();
    expect(active.find((item) => item.variant === "navigation")?.active).toBe(true);
    expect(active.find((item) => item.variant === "primary-dark")?.active).toBe(true);
    expect(active.find((item) => item.variant === "icon")?.active).toBe(true);
    expect(await getPublishedBrandImage("primary-light")).toBeNull();
    expect(brandLogo).toContain('navigation ? `/api/brand/assets/navigation?surface=${surface}` : logo.src');
    expect(dashboardTopbar).toContain("<BrandLogo navigation priority");
    expect(adminAssets).toContain('id: "navigation-light"');
    expect(adminAssets).toContain('id: "navigation-dark"');
    expect(publicRoute).toContain('variant === "navigation"');
    expect(publicRoute).toContain("fallbackVariant");
  });

  it("serves independent theme-specific navigation publications, preserving legacy and primary fallback", async () => {
    const responseFor = (variant: string, query = "") => getPublicBrandAsset(
      new Request("https://example.com/api/brand/assets/" + variant + query),
      { params: Promise.resolve({ variant }) },
    );
    const bytesFor = async (variant: string, query = "") => {
      const response = await responseFor(variant, query);
      expect(response.status).toBe(200);
      return Buffer.from(await response.arrayBuffer());
    };
    const legacy = await getPublishedBrandImage("navigation");
    expect(legacy).not.toBeNull();
    const legacyBytes = Buffer.from(legacy!.data);
    const light = minimalPng();
    light.writeUInt32BE(7, 16);
    const dark = minimalPng();
    dark.writeUInt32BE(8, 16);
    const lightId = await stageBrandAsset({ variant: "navigation-light", file: file("light.png", light), userId: "test-super-admin" });
    const darkId = await stageBrandAsset({ variant: "navigation-dark", file: file("dark.png", dark), userId: "test-super-admin" });
    expect(await bytesFor("navigation", "?surface=light")).toEqual(legacyBytes);
    expect(await bytesFor("navigation-dark")).toEqual(legacyBytes);
    await activateBrandAsset(lightId);
    expect(await bytesFor("navigation", "?surface=light")).toEqual(light);
    expect(await bytesFor("navigation-light")).toEqual(light);
    expect(await bytesFor("navigation", "?surface=dark")).toEqual(legacyBytes);
    await activateBrandAsset(darkId);
    expect(await bytesFor("navigation", "?surface=dark")).toEqual(dark);
    expect(await bytesFor("navigation-dark")).toEqual(dark);
    expect(await bytesFor("navigation-light")).toEqual(light);
    const replacement = minimalPng();
    replacement.writeUInt32BE(9, 16);
    const replacementId = await stageBrandAsset({ variant: "navigation-dark", file: file("dark-new.png", replacement), userId: "test-super-admin" });
    await activateBrandAsset(replacementId);
    expect(await bytesFor("navigation-dark")).toEqual(replacement);
    await activateBrandAsset(darkId);
    expect(await bytesFor("navigation-dark")).toEqual(dark);
    expect(await bytesFor("navigation-light")).toEqual(light);
    expect(await getPublishedBrandImage("primary-light")).toBeNull();
    expect((await listBrandAssets()).find((asset) => asset.variant === "primary-dark" && asset.active)).toBeDefined();
    expect(Buffer.from((await getPublishedBrandImage("navigation"))!.data)).toEqual(legacyBytes);
  });

  it("never imports SQL or creates database migration paths", () => {
    expect(moduleSource).toContain('from "node:fs/promises"');
    expect(moduleSource).not.toContain("@/lib/db");
    expect(moduleSource).not.toContain("TblBrandAsset");
    expect(moduleSource).toContain("/var/lib/drvowa/brand-assets");
  });

  it("enforces SUPER_ADMIN for management and preview, with same-origin mutation checks", () => {
    expect(page).toContain('roles: ["SUPER_ADMIN"]');
    for (const code of [listRoute, modifyRoute, previewRoute]) {
      expect(code).toContain('requirePlatformAdmin({ roles: ["SUPER_ADMIN"] })');
    }
    expect(listRoute).toContain("assertBrandAdminSameOrigin(request)");
    expect(modifyRoute.match(/assertBrandAdminSameOrigin\(request\)/g)).toHaveLength(2);
    expect(listRoute).not.toContain("activateBrandAsset");
    expect(adminLayout).toContain('adminCtx.admin.role === "SUPER_ADMIN"');
    expect(adminNav).toContain("canManageBrand");
    expect(previewRoute).toContain('Cache-Control": "private, no-store"');
    expect(previewRoute).toContain('"X-Content-Type-Options": "nosniff"');
  });

  it("publicly serves only published variants, retaining stock logo fallback", () => {
    expect(publicRoute).toContain("getPublishedBrandImage");
    expect(publicRoute).not.toContain("getBrandImageById");
    expect(publicRoute).toContain('Cache-Control", "no-store, max-age=0"');
    expect(publicRoute).toContain("/brand/logo-on-dark.png");
    expect(publicRoute).toContain("/brand/logo-on-light.png");
  });
});
