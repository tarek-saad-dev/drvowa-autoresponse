import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const app = read("src/constants/app.ts");
const root = read("src/app/layout.tsx");
const home = read("src/app/page.tsx");
const legalTerms = read("src/app/terms/page.tsx");
const legalPrivacy = read("src/app/privacy/page.tsx");
const deploy = read(".github/workflows/deploy-production.yml");
const releasePR = read(".github/workflows/validate-pr.yml");
const logo = read("src/components/brand/brand-logo.tsx");
const invoice = read("src/app/(app)/dashboard/billing/documents/page.tsx");
const payment = read("src/components/dashboard/billing-plans-client.tsx");

describe("Brand V2 public name, metadata and safe-release gate", () => {
  it("publishes AutoRespond, not AutoResponse, in legal and marketing copy", () => {
    for (const source of [app, home, legalTerms, legalPrivacy]) {
      expect(source).toContain("DRVO AutoRespond");
      expect(source).not.toContain("AutoResponse");
    }
    expect(legalTerms).toContain("شروط الاستخدام");
    expect(legalPrivacy).toContain("سياسة الخصوصية");
    expect(legalTerms).toContain("الدفع اليدوي عبر InstaPay");
    expect(legalPrivacy).toContain("إشعار تشغيلي");
  });

  it("keeps the metadata and official images referencing the public brand", () => {
    expect(root).toContain("APP_TAGLINE");
    expect(root).toContain("metadata");
    expect(root).toContain("og-image.jpg");
    expect(root).toContain("ar_EG");
    expect(root).toContain('dir="rtl"');
    expect(existsSync(resolve(process.cwd(), "public/og-image.jpg"))).toBe(true);
    expect(logo).toContain("/brand/logo-on-dark.png");
    expect(logo).toContain("/brand/logo-on-light.png");
    expect(existsSync(resolve(process.cwd(), "public/brand/logo-on-dark.png"))).toBe(true);
    expect(existsSync(resolve(process.cwd(), "public/brand/logo-on-light.png"))).toBe(true);
  });

  it("has no old public product name in scanned UI TypeScript/CSS source", () => {
    const audit = JSON.parse(execFileSync("node", ["scripts/brand-v2-audit.mjs", "--json"], {
      cwd: process.cwd(),
      encoding: "utf8",
    })) as { totals: { legacyProductName: number }; files: Array<{ path: string; legacyProductName: number }> };
    expect(audit.totals.legacyProductName, JSON.stringify(
      audit.files.filter((f) => f.legacyProductName),
    )).toBe(0);
  });

  it("does not recast manual transfer as an approved payment", () => {
    expect(payment).toContain("بانتظار اعتماد التحويل");
    expect(payment).toContain("إرسال تأكيد التحويل للمراجعة");
    expect(payment).toContain("تحويل يدوي • مراجعة بشرية");
    expect(invoice).toContain("إيصال RCT-");
  });

  it("keeps main-only production deployment and pre-deploy checks explicit", () => {
    expect(deploy).toContain("      - main");
    expect(deploy).toContain("billing-checks");
    expect(deploy).toContain("whatsapp-source-checks");
    expect(deploy).toContain("npm run build");
    expect(deploy).toContain("npm run db:migrate");
    expect(deploy).toContain("scripts/billing-production-smoke.ts");
    expect(deploy).toContain("http://127.0.0.1:3100/api/health");
    expect(releasePR).toContain("pull_request:");
    expect(releasePR).toContain("branches: [main, 'feat/brand-v2']");
    // Branding must never silently change production financial / send features.
    expect(deploy).not.toContain("for key in DRVO_PRICING_V1_PAYMENTS");
    expect(deploy).not.toContain("DRVO_LABEL_CAMPAIGNS_SEND_ENABLED=true");
    expect(deploy).toContain("recent production SQL full-backup metadata");
  });

  it("keeps temporary bundled logos and an explicit Super Admin upload path", () => {
    const brandAdmin = read("src/components/admin/admin-navigation.tsx");
    const editor = read("src/app/admin/brand-assets/page.tsx");
    expect(logo).toContain("/api/brand/assets/primary-dark");
    expect(logo).toContain("/api/brand/assets/primary-light");
    expect(brandAdmin).toContain('href: "/admin/brand-assets"');
    expect(brandAdmin).toContain("superAdminOnly: true");
    expect(editor).toContain('roles: ["SUPER_ADMIN"]');
    expect(existsSync(resolve(process.cwd(), "db/migrations/104_brand_asset_gallery.sql"))).toBe(true);
  });
});
