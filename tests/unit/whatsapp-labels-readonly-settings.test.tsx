import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SettingsWhatsAppLabels } from "@/components/dashboard/settings-whatsapp-labels";

describe("WhatsApp labels read-only settings", () => {
  it("shows a quiet, collapsed diagnostics entry without implying send readiness", () => {
    const html = renderToStaticMarkup(<SettingsWhatsAppLabels />);
    expect(html).toContain("قوائم واتساب (Labels)");
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain("إرسال الحملة");
    expect(html).not.toContain("اعتماد الحملة");
    expect(html).not.toContain("عدد العملاء المؤهلين");
  });
});
