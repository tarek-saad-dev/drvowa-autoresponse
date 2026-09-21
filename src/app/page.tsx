import Link from "next/link";

import { LandingFooter } from "@/components/landing/footer";
import { LandingHeader } from "@/components/landing/header";
import { LandingHero } from "@/components/landing/hero";
import { LandingSection } from "@/components/landing/section";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const howSteps = [
  {
    title: "أنشئ مساحة عملك",
    body: "سجّل حساباً وأضف بيانات نشاطك الأساسية خلال دقائق.",
  },
  {
    title: "درّب موظف الاستقبال",
    body: "أضف معلومات النشاط والأسئلة الشائعة والسياسات ليُجيب بثقة.",
  },
  {
    title: "اربط واتساب وفعّل الرد الآلي",
    body: "امسح رمز QR، فعّل الرد الآلي، ودع المنصة ترد على الرسائل الجديدة — مع إمكانية الرد اليدوي في أي وقت.",
  },
];

const faqItems = [
  {
    q: "هل المنصة تدعم العربية؟",
    a: "نعم. الواجهة عربية أولاً مع دعم RTL، ويمكن ضبط لغة ولهجة موظف الاستقبال.",
  },
  {
    q: "هل واتساب متصل الآن؟",
    a: "نعم — يمكنك ربط رقم واتساب عبر رمز QR من لوحة التحكم بعد إنشاء مساحة العمل.",
  },
  {
    q: "هل يوجد تكامل مع ERP؟",
    a: "التكامل مع DRVO ERP مخطط له لاحقاً عبر واجهات واضحة — غير مفعّل حالياً.",
  },
  {
    q: "هل الأسعار نهائية؟",
    a: "لا. خطط الاشتراك وحدود الاستخدام جاهزة تقنياً، وبوابة الدفع الإلكتروني مؤجلة حتى اعتماد المزود.",
  },
];

export default function HomePage() {
  return (
    <div className="flex min-h-full flex-col">
      <LandingHeader />
      <main className="flex-1">
        <LandingHero />

        <LandingSection
          id="how-it-works"
          eyebrow="كيف يعمل"
          title="من الإعداد إلى الاستقبال — بخطوات واضحة"
          description="ثلاث خطوات أساسية لإطلاق موظف استقبال ذكي لنشاطك، دون تعقيد تقني."
        >
          <div className="grid gap-4 md:grid-cols-3">
            {howSteps.map((step, index) => (
              <Card key={step.title}>
                <CardContent className="pt-5">
                  <p className="text-sm font-semibold text-accent">
                    {index + 1}
                  </p>
                  <h3 className="mt-2 text-lg font-semibold">{step.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {step.body}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </LandingSection>

        <LandingSection
          eyebrow="موظف الاستقبال الذكي"
          title="يتحدث باسم نشاطك"
          description="عرّف الاسم والدور واللغة والنبرة والتعليمات — ليتعامل مع الاستفسارات بأسلوب يناسب علامتك."
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {["الاسم والدور", "اللغة واللهجة", "النبرة", "التعليمات"].map(
              (item) => (
                <div
                  key={item}
                  className="rounded-xl border border-border bg-card/80 px-4 py-5 text-sm font-medium shadow-sm"
                >
                  {item}
                </div>
              ),
            )}
          </div>
        </LandingSection>

        <LandingSection
          eyebrow="المعرفة"
          title="درّبه بمعلومات نشاطك"
          description="أضف عن النشاط، الخدمات، السياسات، وساعات العمل يدوياً — معرفة واضحة يمكنك مراجعتها وتفعيلها."
        />

        <LandingSection
          eyebrow="واتساب"
          title="اربط واتساب وادِر المحادثات"
          description="امسح رمز QR، راقب حالة الاتصال، وفعّل الرد الآلي. صندوق الوارد يتيح للموظف الرد يدوياً وإيقاف الذكاء الاصطناعي عند الحاجة."
        />

        <LandingSection
          eyebrow="صندوق الوارد"
          title="الرد اليدوي والتدخل البشري"
          description="الموظف يرد من الوارد في أي وقت. أي رد يدوي يوقف الرد الآلي لتلك المحادثة بأمان، مع إمكانية الاستئناف بعد المراجعة."
        />

        <LandingSection
          eyebrow="التحكم والأمان"
          title="أنت تتحكم في الرد الآلي"
          description="تفعيل/إيقاف الرد الآلي، حدود الخطة، وحماية من السباقات بين الموظف والرد الآلي. لسنا شريكاً رسمياً لواتساب ولا نضمن عدم قيود المنصة."
        />

        <LandingSection
          eyebrow="التكاملات"
          title="تكاملات اختيارية لاحقاً"
          description="أساس التكامل موجود في المنصة. ربط DRVO ERP وغيرها سيأتي عبر واجهات صريحة — وليس جزءاً من V1."
        />

        <LandingSection
          eyebrow="التسعير"
          title="حدود الاستخدام جاهزة — الدفع لاحقاً"
          description="خطة مجانية بحدود واضحة للاستخدام. بوابة الدفع الإلكتروني مؤجلة حتى اعتماد مزود الدفع."
        >
          <Card className="max-w-xl border-dashed">
            <CardContent className="py-8 text-sm text-muted-foreground">
              يمكنك البدء الآن على الخطة المجانية. الأسعار المدفوعة تُعلن عند اكتمال بوابة الدفع.
            </CardContent>
          </Card>
        </LandingSection>

        <LandingSection
          eyebrow="أسئلة شائعة"
          title="إجابات مباشرة"
          description="شفافية حول ما هو متاح الآن وما هو قادم."
        >
          <div className="grid gap-3">
            {faqItems.map((item) => (
              <details
                key={item.q}
                className="group rounded-xl border border-border bg-card px-5 py-4 shadow-sm open:shadow-md"
              >
                <summary className="cursor-pointer list-none font-medium marker:content-none">
                  {item.q}
                </summary>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {item.a}
                </p>
              </details>
            ))}
          </div>
        </LandingSection>

        <section className="pb-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="rounded-2xl border border-border bg-[linear-gradient(120deg,#0b1f26,#134e4a)] px-6 py-12 text-sidebar-foreground shadow-md sm:px-10">
              <h2 className="text-2xl font-bold sm:text-3xl">
                ابدأ إعداد موظف الاستقبال اليوم
              </h2>
              <p className="mt-3 max-w-xl text-sm leading-7 text-sidebar-muted sm:text-base">
                أنشئ حسابك، اربط واتساب، درّب موظف الاستقبال — وابدأ استقبال العملاء اليوم.
              </p>
              <div className="mt-6">
                <Link href="/signup">
                  <Button
                    size="lg"
                    className="bg-accent text-accent-foreground hover:opacity-95"
                  >
                    ابدأ الآن
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>
      <LandingFooter />
    </div>
  );
}
