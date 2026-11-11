import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { BRAND_VARIANTS, MAX_BRAND_FILE_BYTES, isBrandVariant, validateBrandImage } from "@/modules/brand/assets";

const read = (path: string): string => readFileSync(resolve(process.cwd(), path), "utf8");
const migration = read("db/migrations/104_brand_asset_gallery.sql");
const adminNav = read("src/components/admin/admin-navigation.tsx");
const adminLayout = read("src/app/admin/layout.tsx");
const page = read("src/app/admin/brand-assets/page.tsx");
const ui = read("src/components/admin/admin-brand-assets.tsx");
const uploadRoute = read("src/app/api/admin/brand-assets/route.ts");
const publishRoute = read("src/app/api/admin/brand-assets/[id]/route.ts");
const previewRoute = read("src/app/api/admin/brand-assets/[id]/image/route.ts");
const publicRoute = read("src/app/api/brand/assets/[variant]/route.ts");
const brandLogo = read("src/components/brand/brand-logo.tsx");
const root = read("src/app/layout.tsx");

function testFile(bytes: Buffer, type: string): File {
  return new File([new Uint8Array(bytes)], "test-file", { type });
}
function minimalPng(): Buffer {
  const b = Buffer.alloc(24);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(b);
  b.write("IHDR", 12, 4, "ascii");
  b.writeUInt32BE(1, 16);
  b.writeUInt32BE(1, 20);
  return b;
}

describe("DRVO Brand Assets admin upload and safe publication", () => {
  it("supports exactly five stable logo slots, rejecting arbitrary variants", () => {
    expect(BRAND_VARIANTS).toEqual(["primary-dark", "primary-light", "compact", "stacked", "icon"]);
    for (const variant of BRAND_VARIANTS) expect(isBrandVariant(variant)).toBe(true);
    for (const bad of ["../../admin", "favicon.svg", "script", "__proto__", ""]) {
      expect(isBrandVariant(bad)).toBe(false);
    }
  });

  it("validates content bytes, not just MIME or filename, and limits file size", async () => {
    const image = await validateBrandImage(testFile(minimalPng(), "image/png"));
    expect(image.mime).toBe("image/png");
    expect(image.data.length).toBe(24);
    await expect(validateBrandImage(testFile(Buffer.from("<svg onload='alert(1)'/>"), "image/svg+xml")))
      .rejects.toThrow("SVG");
    await expect(validateBrandImage(testFile(Buffer.from("<svg/>"), "image/png")))
      .rejects.toThrow();
    const huge = Buffer.alloc(MAX_BRAND_FILE_BYTES + 1, 1);
    await expect(validateBrandImage(testFile(huge, "image/png"))).rejects.toThrow("2 ميجابايت");
  });

  it("does not accept absurd image dimensions for PNG", async () => {
    const b = minimalPng();
    b.writeUInt32BE(50_000, 16);
    await expect(validateBrandImage(testFile(b, "image/png"))).rejects.toThrow("4096");
  });

  it("stores independent unpublished versions with one active asset per slot", () => {
    expect(migration).toContain("ImageBytes VARBINARY(MAX)");
    expect(migration).toContain("UploadedByUserID UNIQUEIDENTIFIER");
    expect(migration).toContain("IsActive BIT NOT NULL");
    expect(migration).toContain("UX_TblBrandAsset_Active");
    expect(migration).toContain("WHERE IsActive = 1");
    expect(migration).toContain("N'primary-dark'");
    expect(migration).toContain("N'primary-light'");
    expect(migration).toContain("N'compact'");
    expect(migration).toContain("N'stacked'");
    expect(migration).toContain("N'icon'");
  });

  it("requires SUPER_ADMIN and a same-origin request for changes", () => {
    for (const code of [uploadRoute, publishRoute, previewRoute]) {
      expect(code).toContain('requirePlatformAdmin({ roles: ["SUPER_ADMIN"] })');
    }
    expect(page).toContain('roles: ["SUPER_ADMIN"]');
    expect(uploadRoute).toContain('request.headers.get("origin")');
    expect(publishRoute).toContain('request.headers.get("origin")');
    expect(uploadRoute).toContain("MAX_BRAND_FILE_BYTES");
    expect(uploadRoute).not.toContain("activateBrandAsset");
    expect(adminLayout).toContain('adminCtx.admin.role === "SUPER_ADMIN"');
    expect(adminNav).toContain("canManageBrand");
  });

  it("publishes only after an explicit admin action and supports rollback", () => {
    expect(ui).toContain("رفع كمسودة");
    expect(ui).toContain("اعتماد ونشر");
    expect(ui).toContain("window.confirm");
    expect(ui).toContain('action === "publish" ? "PATCH" : "DELETE"');
    expect(ui).toContain("النسخ السابقة والمسودات");
    expect(publishRoute).toContain('activateBrandAsset(id)');
    expect(publishRoute).toContain('deleteDraftBrandAsset(id)');
  });

  it("serves only published variants publicly, while drafts remain admin-only", () => {
    expect(publicRoute).toContain("getPublishedBrandImage");
    expect(publicRoute).not.toContain("getBrandImageById");
    expect(publicRoute).toContain('Cache-Control');
    expect(publicRoute).toContain('"no-store, max-age=0"');
    expect(previewRoute).toContain('getBrandImageById(id)');
    expect(previewRoute).toContain('"private, no-store"');
    expect(previewRoute).toContain('"Content-Security-Policy"');
    expect(brandLogo).toContain("/api/brand/assets/primary-dark");
    expect(brandLogo).toContain("/api/brand/assets/primary-light");
    expect(brandLogo).toContain("/brand/logo-on-dark.png");
    expect(brandLogo).toContain("/brand/logo-on-light.png");
    expect(root).toContain('/api/brand/assets/icon');
  });

  it("keeps public asset response strict and avoids SVG/XSS uploads", () => {
    expect(migration).not.toContain("image/svg+xml");
    expect(uploadRoute).toContain("stageBrandAsset");
    expect(previewRoute).toContain('"X-Content-Type-Options": "nosniff"');
    expect(publicRoute).toContain('"X-Content-Type-Options": "nosniff"');
    expect(publicRoute).toContain("fallback[variant]");
  });
});
