import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("next/navigation",()=>({useRouter:()=>({refresh:()=>{}})}));
import { ReviewChatPopup } from "@/components/dashboard/pulse/review-chat-popup";
import type { PulseReview } from "@/modules/pulse/report";

const review: PulseReview = {
  conversationId: "d6e05bff-397c-498c-b0fe-2f92ffa5adad",
  intent: "FOLLOW_UP",
  label: "محتاج رد يدوي",
  evidence: "وشوف لو حد عاوز يدخل ونبي",
  priority: "URGENT",
  actionType: "REVIEW",
  name: "Shrouk Abdo",
  at: "2026-11-06T10:00:00Z",
  kind: "ESCALATION",
};

describe("Messenger-style Pulse review popup", () => {
  it("shows the selected customer and a reply composer without navigating away", () => {
    const html = renderToStaticMarkup(<ReviewChatPopup
      item={review} onClose={()=>{}} onHandled={()=>{}} onResolved={()=>{}} />);
    expect(html).toContain('role="dialog"');
    expect(html).toContain("Shrouk Abdo");
    expect(html).toContain("اكتب ردك للعميل");
    expect(html).toContain("إرسال");
    expect(html).toContain("الشات الكامل");
    expect(html).toContain("d6e05bff-397c-498c-b0fe-2f92ffa5adad");
    expect(html).toContain("sm:bottom-5");
  });

  it("keeps the chat-specific preview separate from the backend send confirmation", () => {
    const html = renderToStaticMarkup(<ReviewChatPopup
      item={{...review,name:"201014861062",kind:"SIGNAL",intent:"PRICE"}}
      onClose={()=>{}} onHandled={()=>{}} onResolved={()=>{}} />);
    expect(html).toContain("201014861062");
    expect(html).toContain("اقرأ طلب العميل");
    expect(html).not.toContain("تم إرسال الرد");
  });
});
