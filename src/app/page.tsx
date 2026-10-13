import type { Metadata } from "next";
import { MarketingPage } from "@/components/landing/marketing-page";
export const metadata: Metadata = {
  title: "DRVO AutoRespond — خليك حاضر، حتى وإنت مشغول",
  description:
    "مساعد واتساب يتعلّم تفاصيل نشاطك، يرد على عملائك بطريقتك، ويرجع لك وقت التدخل البشري. اكتشف طريقة الاستخدام والأسعار وابدأ تجربة مجانية.",
};
export default function HomePage() {
  return <MarketingPage />;
}
