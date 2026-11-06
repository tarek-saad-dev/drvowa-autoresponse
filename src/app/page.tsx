import type { Metadata } from "next";
import { MarketingPage } from "@/components/landing/marketing-page";

export const metadata: Metadata = {
  title: "DRVO AutoRespond — خليك حاضر، حتى وإنت مشغول",
  description:
    "مساعد واتساب يتعلّم تفاصيل نشاطك، يرد على عملائك بطريقتك، ويرجع لك وقت التدخل البشري. اكتشف طريقة الاستخدام والأسعار وابدأ تجربة مجانية.",
  openGraph: {
    title: "DRVO AutoRespond — خليك حاضر، حتى وإنت مشغول",
    description:
      "مساعد واتساب يتعلّم تفاصيل نشاطك، يرد على عملائك بطريقتك، ويرجع لك وقت التدخل البشري. اكتشف طريقة الاستخدام والأسعار وابدأ تجربة مجانية.",
    images: [
      {
        url: "/og-image.jpg",
        width: 1024,
        height: 537,
        type: "image/jpeg",
        alt: "DRVO AutoRespond — خليك حاضر، حتى وإنت مشغول",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "DRVO AutoRespond — خليك حاضر، حتى وإنت مشغول",
    description:
      "مساعد واتساب يتعلّم تفاصيل نشاطك، يرد على عملائك بطريقتك، ويرجع لك وقت التدخل البشري. اكتشف طريقة الاستخدام والأسعار وابدأ تجربة مجانية.",
    images: ["/og-image.jpg"],
  },
};
export default function HomePage() {
  return <MarketingPage />;
}
