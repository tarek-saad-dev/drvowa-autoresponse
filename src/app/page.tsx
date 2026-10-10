import Link from "next/link";

import { LandingFooter } from "@/components/landing/footer";
import { LandingHeader } from "@/components/landing/header";
import { LandingHero } from "@/components/landing/hero";
import { LandingSection } from "@/components/landing/section";
import { Button } from "@/components/ui/button";

const flow = [
  {
    number: "01",
    title: "العميل يبعت",
    body: "رسالة واتساب عادية: سؤال، حجز، سعر، متابعة أو طلب.",
    icon: "💬",
  },
  {
    number: "02",
    title: "الـ AI يفهم",
    body: "يقرأ سياق المحادثة ومعرفة البيزنس ويحدد المطلوب.",
    icon: "✦",
  },
  {
    number: "03",
    title: "DRVO يتصرف",
    body: "يرد، يجيب بيانات من الـ ERP أو ينفّذ Action مسموح.",
    icon: "↗",
  },
  {
    number: "04",
    title: "الموظف يدخل وقت ما يحب",
    body: "يستلم الشات ويرجعه للـ AI من غير ما تضيع المحادثة.",
    icon: "◉",
  },
];

const powers = [
  {
    title: "اتعلّمه بطريقتك",
    body: "الخدمات والأسعار والسياسات والعروض وطريقة الكلام — معرفة قابلة للمراجعة والتحديث.",
    eyebrow: "KNOWLEDGE",
  },
  {
    title: "شغال على واتساب الحقيقي",
    body: "صندوق وارد، ردود AI، تدخل بشري، وحالة المحادثة كلها في مكان واحد.",
    eyebrow: "WHATSAPP",
  },
  {
    title: "مش مجرد شات بوت",
    body: "مع ERP Connector يقدر يقرأ مواعيد وبيانات وينفّذ إجراءات زي الحجز والإلغاء حسب صلاحياتك.",
    eyebrow: "ERP ACTIONS",
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
          eyebrow="الفكرة ببساطة"
          title="من رسالة عميل… لنتيجة."
          description="بدل ما يكون الـ AI مجرد شخص بيرد، DRVO AutoRespond يبقى جزء من تشغيل البيزنس."
        >
          <div className="relative grid gap-3 md:grid-cols-4">
            <div className="pointer-events-none absolute left-[8%] right-[8%] top-8 hidden h-px bg-[linear-gradient(90deg,transparent,var(--border),var(--primary),var(--border),transparent)] md:block" />
            {flow.map((item) => (
              <div
                key={item.number}
                className="group relative rounded-[24px] border border-border/75 bg-card/78 p-5 shadow-sm backdrop-blur transition duration-300 hover:-translate-y-1 hover:border-primary/30 hover:shadow-md"
              >
                <div className="relative z-10 flex items-center justify-between">
                  <span className="grid h-10 w-10 place-items-center rounded-2xl bg-primary/10 text-lg">
                    {item.icon}
                  </span>
                  <span className="text-xs font-black tracking-[.16em] text-primary">
                    {item.number}
                  </span>
                </div>
                <h3 className="mt-5 text-base font-black text-foreground">{item.title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.body}</p>
              </div>
            ))}
          </div>
        </LandingSection>

        <section className="py-8 sm:py-14">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <div className="overflow-hidden rounded-[34px] border border-border bg-[linear-gradient(145deg,#05090b_0%,#071319_48%,#004a66_130%)] px-5 py-8 text-white shadow-[0_32px_90px_rgba(0,74,102,.22)] sm:px-8 sm:py-10 lg:px-10">
              <div className="grid gap-7 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
                <div>
                  <p className="text-xs font-black tracking-[.16em] text-[#42c5eb]">LIVE OPERATIONS</p>
                  <h2 className="mt-3 text-3xl font-black tracking-[-0.04em] sm:text-4xl">
                    شغال حتى وإنت مش فاتح الشات.
                  </h2>
                  <p className="mt-4 max-w-xl text-sm leading-7 text-white/65 sm:text-base">
                    عميل يسأل، التاني يحجز، والثالث محتاج موظف. السيستم يفرز كل محادثة ويتعامل معاها حسب حالتها.
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  {[
                    ["12", "محادثة شغالة", "AI بيرد"],
                    ["3", "محتاجة موظف", "تم التنبيه"],
                    ["7", "إجراء ERP", "اتنفذ"],
                  ].map(([value, title, hint]) => (
                    <div key={title} className="rounded-3xl border border-white/10 bg-white/[0.055] p-5 backdrop-blur">
                      <div className="text-3xl font-black text-white">{value}</div>
                      <div className="mt-3 text-sm font-black">{title}</div>
                      <div className="mt-1 text-xs text-white/45">{hint}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <LandingSection
          eyebrow="قدرات المنتج"
          title="ثلاث طبقات بتخليه موظف فعلي."
          description="المعرفة، المحادثة، والتنفيذ — كلهم متوصلين ببعض بدل أدوات منفصلة."
        >
          <div className="grid gap-4 lg:grid-cols-3">
            {powers.map((item, index) => (
              <article
                key={item.title}
                className="relative overflow-hidden rounded-[28px] border border-border bg-card p-6 shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-md"
              >
                <div className="absolute -left-12 -top-12 h-32 w-32 rounded-full bg-primary/8 blur-3xl" />
                <p className="relative text-[10px] font-black tracking-[.2em] text-primary">{item.eyebrow}</p>
                <div className="relative mt-8 text-4xl font-black text-primary/15">0{index + 1}</div>
                <h3 className="relative mt-3 text-xl font-black text-foreground">{item.title}</h3>
                <p className="relative mt-3 text-sm leading-7 text-muted-foreground">{item.body}</p>
              </article>
            ))}
          </div>
        </LandingSection>

        <LandingSection
          eyebrow="Human + AI"
          title="الـ AI مش بيحبسك برّه المحادثة."
          description="الموظف يقدر يستلم أي شات، يرد بنفسه، وبعد فترة ترجع المحادثة للـ AI حسب إعدادات النشاط."
        >
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-[26px] border border-border bg-card p-6 shadow-sm">
              <div className="text-xs font-black text-primary">AUTO MODE</div>
              <h3 className="mt-3 text-xl font-black">الـ AI مسؤول عن المحادثة</h3>
              <p className="mt-2 text-sm leading-7 text-muted-foreground">
                يرد من المعرفة، يستخدم الأدوات المسموحة، ويتابع سياق العميل.
              </p>
            </div>
            <div className="rounded-[26px] border border-border bg-card p-6 shadow-sm">
              <div className="text-xs font-black text-success">HUMAN MODE</div>
              <h3 className="mt-3 text-xl font-black">الموظف يستلم وقت الحاجة</h3>
              <p className="mt-2 text-sm leading-7 text-muted-foreground">
                استلام واضح، تنبيهات للرسائل الجديدة، وإرجاع تلقائي للـ AI حسب المدة المحددة.
              </p>
            </div>
          </div>
        </LandingSection>

        <section className="pb-20 pt-8">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <div className="relative overflow-hidden rounded-[34px] border border-white/10 bg-[linear-gradient(125deg,#05090b,#071319_50%,#004a66)] px-6 py-12 text-white shadow-[0_30px_90px_rgba(0,74,102,.25)] sm:px-10 lg:px-12">
              <div className="absolute -left-20 -top-24 h-64 w-64 rounded-full bg-[#0B8BB5]/20 blur-3xl" />
              <div className="relative max-w-2xl">
                <p className="text-xs font-black tracking-[.18em] text-[#42c5eb]">DRVO AUTORESPOND</p>
                <h2 className="mt-3 text-3xl font-black tracking-[-0.04em] sm:text-4xl">
                  خلي المحادثات تتحرك لوحدها.
                </h2>
                <p className="mt-4 text-sm leading-7 text-white/65 sm:text-base">
                  علّمه البيزنس، وصّل واتساب والـ ERP، وسيب DRVO يتعامل مع أول رسالة لحد آخر إجراء.
                </p>
                <div className="mt-7">
                  <Link href="/signup">
                    <Button size="lg" className="rounded-xl">
                      ابدأ إعداد موظفك
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
      <LandingFooter />
    </div>
  );
}
