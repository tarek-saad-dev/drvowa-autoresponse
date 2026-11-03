import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { LabelCampaignChat } from "@/components/dashboard/label-campaign-chat";

describe("label campaigns UI does not dispatch any WhatsApp messages", () => {
  it("promises a review-only chat, never mass-send controls", () => {
    const html = renderToStaticMarkup(<LabelCampaignChat />);
    expect(html).toContain("محادثة حملات القوائم");
    expect(html).toContain("تجهيز");
    expect(html).toContain("مسودات فقط");
    expect(html).not.toContain("إرسال الحملة");
    expect(html).not.toContain("ابدأ الإرسال");
  });
});
