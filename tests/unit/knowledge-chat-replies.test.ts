import { describe, expect, it } from "vitest";
import { trainingReplyForAnalysis } from "@/lib/ui/knowledge-chat-replies";

describe("trainingReplyForAnalysis", () => {
  it("does not show technical ingest counters", () => {
    const result = trainingReplyForAnalysis([{ action: "CREATE", proposedTitle: "رابط فرع جليم" }]);
    expect(result).toContain("فهمت منك");
    expect(result).not.toContain("حللت المعلومات");
    expect(result).not.toContain("0 تحديثات");
  });
  it("never claims automation was activated", () => {
    const result = trainingReplyForAnalysis(
      [{ action: "CREATE", proposedTitle: "تقييم العميل" }],
      { sourceText: "لما العميل يشكرنا ابعت رابط التقييم" },
    );
    expect(result).toContain("مش معناه تشغيل إرسال تلقائي");
    expect(result).not.toContain("اتفعّل");
  });
  it("asks to resolve conflicts", () => {
    expect(trainingReplyForAnalysis([{ action: "CONFLICT", proposedTitle: "مواعيد الفرع" }])).toContain("محتاج اختيارك");
  });
  it("handles known and unclear information", () => {
    expect(trainingReplyForAnalysis([{ action: "NOOP", proposedTitle: "العنوان" }])).toContain("عندي بالفعل");
    expect(trainingReplyForAnalysis([], { clarification: "أنهي فرع؟" })).toContain("أنهي فرع؟");
  });
});
