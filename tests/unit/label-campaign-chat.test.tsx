import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { LabelCampaignChat } from "@/components/dashboard/label-campaign-chat";

describe("label campaigns chat only prepares drafts until owner confirms", () => {
  it("promises an explicit owner confirmation, never auto-sends from chat", () => {
    const html = renderToStaticMarkup(<LabelCampaignChat />);
    expect(html).toContain("محادثة حملات القوائم");
    expect(html).toContain("تجهيز");
    expect(html).toContain("قوائم عملائك على واتساب");
    expect(html).toContain("مفيش إرسال إلا بعد مراجعة الرسالة وتأكيد الحملة");
    expect(html).not.toContain("إرسال الحملة");
    expect(html).not.toContain("ابدأ الإرسال");
  });
});
