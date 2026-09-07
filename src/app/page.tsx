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
    title: "درّب وكيل الاستقبال",
    body: "أضف معلومات النشاط والأسئلة الشائعة والسياسات ليُجيب بثقة.",
  },
  {
    title: "اربط قنوات التواصل لاحقاً",
    body: "ربط واتساب والردود الحية يصل في المرحلة التالية — بوضوح ودون وعود مبالغ فيها.",
  },
];

const faqItems = [
  {
    q: "هل المنصة تدعم العربية؟",
    a: "نعم. الواجهة عربية أولاً مع دعم RTL، ويمكن ضبط لغة ولهجة الوكيل لاحقاً.",
  },
  {
    q: "هل واتساب متصل الآن؟",
    a: "لا في هذه المرحلة. البنية جاهزة للربط، وواجهة الاتصال ستُفعَّل في المرحلة التالية.",
  },
  {
    q: "هل يوجد تكامل مع ERP؟",
    a: "التكامل مع DRVO ERP مخطط له لاحقاً عبر واجهات واضحة — غير مفعّل حالياً.",
  },
  {
    q: "هل الأسعار نهائية؟",
    a: "لا. صفحة التسعير حالياً مكان محجوز. سنعلن الخطط عند جاهزية الفوترة.",
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
          title="وكيل يتحدث باسم نشاطك"
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
          description="أضف عن النشاط، الخدمات، السياسات، والمواقع يدوياً. لا متجهات ولا وعود RAG في هذه المرحلة — معرفة واضحة يمكنك مراجعتها."
        />

        <LandingSection
          eyebrow="واتساب"
          title="ربط واتساب في المرحلة التالية"
          description="نجهّز البنية لقنوات الاتصال دون تشغيل الربط الآن. ستظهر واجهة الإعداد بصدق عندما تكون جاهزة — بدون ادّعاءات شراكة أو ضمانات حظر."
        />

        <LandingSection
          eyebrow="على مدار الساعة"
          title="محادثات جاهزة عندما يصل الربط"
          description="الهدف: استقبال العملاء حتى خارج أوقات العمل. صندوق الوارد والمحادثات يظهران بعد تفعيل واتساب."
        />

        <LandingSection
          eyebrow="التكاملات"
          title="تكاملات اختيارية لاحقاً"
          description="أساس التكامل موجود في المنصة. ربط DRVO ERP وغيرها سيأتي عبر واجهات صريحة — وليس جزءاً من هذه المرحلة."
        />

        <LandingSection
          eyebrow="التسعير"
          title="الأسعار تُعلن عند الجاهزية"
          description="لا نعرض أسعاراً تجريبية أو وعوداً غير مؤكدة. بنية الاشتراكات جاهزة تقنياً، وبوابة الدفع مؤجلة."
        >
          <Card className="max-w-xl border-dashed">
            <CardContent className="py-8 text-sm text-muted-foreground">
              خطط الاستخدام والفوترة ستُنشر هنا عند اكتمال مرحلة الدفع.
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
                أنشئ حسابك، أضف نشاطك ومعرفتك، وكن جاهزاً لربط واتساب في المرحلة
                التالية.
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
