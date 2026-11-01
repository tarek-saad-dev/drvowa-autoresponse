import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
describe("pricing v1 guarded checkout display", () => {
  it("passes only server computed pricing to the plan dialog", () => {
    const page = readFileSync(resolve(process.cwd(), "src/app/(app)/dashboard/billing/page.tsx"), "utf8");
    expect(page).toContain("isPricingV1PaymentEnabled()");
    expect(page).toContain('quotePricingV1(code, "ANNUAL")');
    expect(page).toContain("v1Quotes=");
  });
  it("does not advertise twelve undiscounted months in the picker", () => {
    const ui = readFileSync(resolve(process.cwd(), "src/components/dashboard/billing-plans-client.tsx"), "utf8");
    expect(ui).not.toContain("سنوي — سعر 12 شهر");
    expect(ui).toContain("v1Quotes?.[plan.code]");
    expect(ui).toContain("سنوي — دفعة واحدة");
  });
});
