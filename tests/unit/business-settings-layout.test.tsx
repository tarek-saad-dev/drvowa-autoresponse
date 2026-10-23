import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { BusinessSettingsForm } from "@/components/dashboard/business-settings-form";
import type { Business } from "@/types/domain";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

const baseBusiness: Business = {
  businessId: "business-1",
  name: "Cut Salon",
  slug: "cut-salon",
  category: "صالون حلاقة",
  countryCode: "EG",
  locale: "ar-SA",
  timezone: "Africa/Cairo",
  status: "ACTIVE",
  onboardingCompletedAtUtc: null,
  createdAtUtc: new Date("2026-01-01T00:00:00Z"),
  updatedAtUtc: new Date("2026-01-01T00:00:00Z"),
};

describe("BusinessSettingsForm layout", () => {
  it("focuses on activity identity and hides regional editing in a disclosure", () => {
    const html = renderToStaticMarkup(<BusinessSettingsForm business={baseBusiness} />);
    expect(html).toContain("Cut Salon");
    expect(html).toContain("اسم النشاط");
    expect(html).toContain("نوع النشاط");
    expect(html).toContain("اللغة والمنطقة");
    expect(html).toContain("مصر");
    expect(html).toContain("القاهرة");
    expect(html).toContain("<details");
    expect(html).not.toContain("تنبيهات التدخل البشري");
    expect(html).not.toContain("استعادة كلمة المرور");
  });

  it("preserves custom business categories and unsupported regional values", () => {
    const html = renderToStaticMarkup(
      <BusinessSettingsForm
        business={{
          ...baseBusiness,
          category: "شركة متخصصة",
          countryCode: "FR",
          timezone: "Europe/Paris",
        }}
      />,
    );
    expect(html).toContain("شركة متخصصة");
    expect(html).toContain('value="FR"');
    expect(html).toContain("Europe/Paris");
    expect(html).toContain('value="__custom__"');
  });
});
