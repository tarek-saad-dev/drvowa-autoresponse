import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { LabelCampaignChat } from "@/components/dashboard/label-campaign-chat";

describe("calm progressive campaign flow",()=>{
  it("starts with audience selection rather than stacked management, draft history and chat",()=>{
    const html=renderToStaticMarkup(<LabelCampaignChat />);
    expect(html).toContain("محادثة حملات القوائم");
    expect(html).toContain("حملة جديدة");
    expect(html).toContain("١ · الجمهور");
    expect(html).toContain("٢ · الرسالة");
    expect(html).toContain("٣ · المراجعة");
    expect(html).toContain("اختار القائمة اللي هتبعت لها");
    expect(html).toContain("الحملات السابقة");
    expect(html).not.toContain("إضافة عملاء إلى");
    expect(html).not.toContain("مراجعة المستلمين");
    expect(html).not.toContain("تأكيد بدء الإرسال");
  });
  it("keeps natural-language campaign command as a secondary opt-in affordance",()=>{
    const html=renderToStaticMarkup(<LabelCampaignChat />);
    expect(html).toContain("اكتب طلبك بطريقتك");
    expect(html).toContain("تجهيز الطلب");
  });
});
