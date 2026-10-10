"use client";

import { useEffect, useRef, useState } from "react";

import { LottieAsset } from "@/components/landing/lottie-asset";

type StoryScene =
  | "business"
  | "agent"
  | "learn"
  | "guard"
  | "handoff"
  | "whatsapp"
  | "details"
  | "next"
  | "erp"
  | "daily"
  | "summary";

type StoryStep = {
  step: string;
  kicker: string;
  title: string;
  line: string;
  scene: StoryScene;
};

const steps: StoryStep[] = [
  {
    step: "02",
    kicker: "أيًا كان شغلك",
    title: "جهّزه على احتياجك.",
    line: "شركة، متجر، عيادة أو نشاط مختلف — نفس المحرك، بشكل يناسبك.",
    scene: "business",
  },
  {
    step: "03",
    kicker: "AI Agent",
    title: "مساعد خاص بيك.",
    line: "دوره، أسلوبه، معرفته وطريقة تعامله — إنت اللي تحددهم.",
    scene: "agent",
  },
  {
    step: "04",
    kicker: "التعليم",
    title: "علّمه. حدّثه. صحّحه.",
    line: "معرفة البيزنس تتطور معاك بدل ما تبدأ من جديد كل مرة.",
    scene: "learn",
  },
  {
    step: "05",
    kicker: "الصلاحيات",
    title: "يرد على المسموح فقط.",
    line: "والحالات الحساسة أو غير المسموحة ترجع لك.",
    scene: "guard",
  },
  {
    step: "06",
    kicker: "التدخل البشري",
    title: "اعرف مين محتاجك.",
    line: "المحادثة المهمة تظهر، والموظف يستلمها فورًا.",
    scene: "handoff",
  },
  {
    step: "07",
    kicker: "WhatsApp",
    title: "نفس الأسئلة؟ خلاص.",
    line: "مواعيد، أسعار، خدمات وسياسات — الرد جاهز طول الوقت.",
    scene: "whatsapp",
  },
  {
    step: "08",
    kicker: "التفاصيل",
    title: "مش مجرد سعر.",
    line: "يشرح المحتويات، الشروط والعرض المناسب بوضوح.",
    scene: "details",
  },
  {
    step: "09",
    kicker: "الخطوة التالية",
    title: "بعد الرد… يكمل.",
    line: "موقع، موعد، رابط حجز أو خطوة شراء — حسب شغلك.",
    scene: "next",
  },
  {
    step: "10",
    kicker: "ERP Connector",
    title: "اربطه بشغلك الحقيقي.",
    line: "يقرأ البيانات وينفذ الإجراءات اللي إنت سامح بيها.",
    scene: "erp",
  },
  {
    step: "11",
    kicker: "التشغيل اليومي",
    title: "هو يتابع. إنت تقرر.",
    line: "الروتيني على المساعد، والمهم عندك أو عند فريقك.",
    scene: "daily",
  },
  {
    step: "12",
    kicker: "الخلاصة",
    title: "وقت أكتر. تحكم أوضح.",
    line: "بمعلوماتك. بطريقتك. تحت إدارتك.",
    scene: "summary",
  },
];

const lottieByScene: Record<StoryScene, string> = {
  business: "https://assets8.lottiefiles.com/packages/lf20_7pzyukmv.json",
  agent: "https://assets2.lottiefiles.com/packages/lf20_muccxgoz.json",
  learn: "https://assets2.lottiefiles.com/packages/lf20_muccxgoz.json",
  guard: "https://assets3.lottiefiles.com/packages/lf20_msdmfngy.json",
  handoff: "https://assets3.lottiefiles.com/packages/lf20_msdmfngy.json",
  whatsapp: "https://assets8.lottiefiles.com/packages/lf20_7pzyukmv.json",
  details: "https://assets2.lottiefiles.com/packages/lf20_cdwc9fys.json",
  next: "https://assets2.lottiefiles.com/packages/lf20_cdwc9fys.json",
  erp: "https://assets2.lottiefiles.com/packages/lf20_cdwc9fys.json",
  daily: "https://assets2.lottiefiles.com/packages/lf20_muccxgoz.json",
  summary: "https://assets8.lottiefiles.com/packages/lf20_7pzyukmv.json",
};

function SceneChrome({ scene }: { scene: StoryScene }) {
  if (scene === "whatsapp") {
    return (
      <>
        <div className="absolute right-[7%] top-[18%] max-w-[44%] rounded-2xl rounded-br-md bg-[#005c4b] px-4 py-3 text-xs font-bold text-white shadow-xl sm:text-sm">
          عندكم مواعيد النهارده؟
        </div>
        <div className="absolute bottom-[17%] left-[7%] max-w-[48%] rounded-2xl rounded-bl-md bg-[#202c33] px-4 py-3 text-xs font-bold text-white shadow-xl sm:text-sm">
          متاح 7:15 و 8:00
        </div>
      </>
    );
  }

  if (scene === "erp") {
    return (
      <div className="absolute bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-2xl border border-cyan-300/15 bg-[#061116]/88 px-4 py-3 text-[10px] font-black text-cyan-50 shadow-xl backdrop-blur sm:text-xs">
        <span className="rounded-lg bg-cyan-400/10 px-2 py-1">ERP</span>
        <span>↔</span>
        <span className="rounded-lg bg-cyan-400/10 px-2 py-1">DRVO</span>
        <span>↔</span>
        <span className="rounded-lg bg-cyan-400/10 px-2 py-1">WhatsApp</span>
      </div>
    );
  }

  if (scene === "handoff") {
    return (
      <div className="absolute bottom-6 left-1/2 w-[82%] -translate-x-1/2 rounded-2xl border border-cyan-300/15 bg-[#071319]/88 p-3 text-center text-[11px] font-black text-cyan-50 shadow-xl backdrop-blur sm:w-[72%] sm:text-xs">
        محتاج تدخل → تنبيه → استلام موظف
      </div>
    );
  }

  if (scene === "details") {
    return (
      <div className="absolute bottom-6 left-1/2 flex -translate-x-1/2 gap-2">
        {["السعر", "المحتويات", "الشروط"].map((label) => (
          <span
            key={label}
            className="rounded-full border border-white/10 bg-black/25 px-3 py-1.5 text-[9px] font-black text-white/85 backdrop-blur sm:text-[10px]"
          >
            {label}
          </span>
        ))}
      </div>
    );
  }

  if (scene === "next") {
    return (
      <div className="absolute bottom-6 left-1/2 flex -translate-x-1/2 gap-2">
        {["موقع", "موعد", "حجز"].map((label) => (
          <span
            key={label}
            className="rounded-full border border-white/10 bg-black/25 px-3 py-1.5 text-[9px] font-black text-white/85 backdrop-blur sm:text-[10px]"
          >
            {label}
          </span>
        ))}
      </div>
    );
  }

  if (scene === "guard") {
    return (
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 rounded-full border border-white/10 bg-black/25 px-4 py-2 text-[10px] font-black text-white/85 backdrop-blur sm:text-xs">
        المسموح فقط
      </div>
    );
  }

  if (scene === "business") {
    return (
      <div className="absolute inset-x-5 bottom-5 flex flex-wrap justify-center gap-2 sm:inset-x-8 sm:bottom-7">
        {["شركة", "متجر", "عيادة", "تعليم"].map((label) => (
          <span
            key={label}
            className="rounded-full border border-white/10 bg-black/25 px-3 py-1.5 text-[9px] font-black text-white/85 backdrop-blur sm:text-[10px]"
          >
            {label}
          </span>
        ))}
      </div>
    );
  }

  return null;
}

function SceneVisual({
  scene,
  compact = false,
}: {
  scene: StoryScene;
  compact?: boolean;
}) {
  return (
    <div
      className={`relative h-full overflow-hidden border border-white/10 bg-[linear-gradient(145deg,#04090c_0%,#071319_52%,#004a66_145%)] shadow-[0_36px_120px_rgba(0,74,102,.28)] ${
        compact
          ? "min-h-[54svh] rounded-[28px]"
          : "min-h-[440px] rounded-[34px] sm:min-h-[520px]"
      }`}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_48%,rgba(30,190,235,.13),transparent_34%),radial-gradient(circle_at_15%_12%,rgba(0,117,154,.14),transparent_34%)]" />
      <div className="absolute inset-0 [background-image:radial-gradient(circle_at_center,rgba(255,255,255,.11)_0_1px,transparent_1px)] [background-size:26px_26px] opacity-[0.1]" />

      <div className="absolute inset-[7%] z-10 sm:inset-[6%]">
        <LottieAsset
          src={lottieByScene[scene]}
          className="h-full w-full"
          speed={scene === "handoff" ? 0.8 : 1}
          ariaLabel={`Lottie motion graphic for ${scene}`}
        />
      </div>

      <div className="pointer-events-none absolute inset-0 z-20 bg-[linear-gradient(180deg,rgba(4,9,12,.08),transparent_45%,rgba(4,9,12,.28))]" />
      <div className="pointer-events-none absolute inset-0 z-30">
        <SceneChrome scene={scene} />
      </div>
    </div>
  );
}

export function PresentationScrollytelling() {
  const [activeIndex, setActiveIndex] = useState(0);
  const desktopSectionRef = useRef<HTMLDivElement | null>(null);
  const mobileTriggerRefs = useRef<Array<HTMLElement | null>>([]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const media = window.matchMedia("(min-width: 1024px)");
    let mobileObserver: IntersectionObserver | null = null;
    let ticking = false;

    const setDesktopFromScroll = () => {
      ticking = false;
      if (!media.matches) return;
      const section = desktopSectionRef.current;
      if (!section) return;

      const top = section.offsetTop;
      const maxTravel = Math.max(1, section.offsetHeight - window.innerHeight);
      const progress = Math.min(0.999999, Math.max(0, (window.scrollY - top) / maxTravel));
      const nextIndex = Math.min(steps.length - 1, Math.floor(progress * steps.length));
      setActiveIndex((current) => (current === nextIndex ? current : nextIndex));
    };

    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(setDesktopFromScroll);
    };

    const connectMobile = () => {
      mobileObserver?.disconnect();
      if (media.matches) {
        setDesktopFromScroll();
        return;
      }

      mobileObserver = new IntersectionObserver(
        (entries) => {
          const visible = entries
            .filter((entry) => entry.isIntersecting)
            .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
          if (!visible) return;
          const index = Number((visible.target as HTMLElement).dataset.index ?? 0);
          setActiveIndex(index);
        },
        {
          rootMargin: "-30% 0px -48% 0px",
          threshold: [0, 0.2, 0.5, 0.8],
        },
      );

      mobileTriggerRefs.current
        .filter(Boolean)
        .forEach((node) => mobileObserver?.observe(node as HTMLElement));
    };

    const onMediaChange = () => {
      connectMobile();
      setDesktopFromScroll();
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    media.addEventListener("change", onMediaChange);
    connectMobile();
    setDesktopFromScroll();

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      media.removeEventListener("change", onMediaChange);
      mobileObserver?.disconnect();
    };
  }, []);

  const active = steps[activeIndex] ?? steps[0];

  const goToDesktopStep = (index: number) => {
    const section = desktopSectionRef.current;
    if (!section) return;
    const travel = Math.max(1, section.offsetHeight - window.innerHeight);
    const target =
      section.offsetTop
      + (index / Math.max(1, steps.length - 1)) * travel
      + 2;
    window.scrollTo({ top: target, behavior: "smooth" });
  };

  return (
    <section id="story" className="relative scroll-mt-20 bg-background">
      <div
        ref={desktopSectionRef}
        className="relative hidden lg:block"
        style={{ height: `${100 + steps.length * 72}vh` }}
      >
        <div className="sticky top-16 mx-auto flex h-[calc(100svh-4rem)] max-w-7xl items-center px-6 py-5 xl:px-8 xl:py-7 2xl:max-w-[1480px]">
          <div className="grid w-full grid-cols-[0.70fr_1.30fr] items-center gap-8 xl:grid-cols-[0.66fr_1.34fr] xl:gap-14">
            <div className="relative z-20">
              <div className="flex items-center gap-3">
                <span className="text-[11px] font-black tracking-[.2em] text-primary">
                  {active.step}/12
                </span>
                <span className="h-px w-12 bg-primary/30" />
                <span className="text-xs font-black text-muted-foreground">
                  {active.kicker}
                </span>
              </div>

              <div key={active.step} className="cinema-copy-enter">
                <h2 className="mt-5 max-w-xl text-[3.25rem] font-black leading-[1.05] tracking-[-0.055em] text-foreground xl:text-[4rem] 2xl:text-[4.45rem]">
                  {active.title}
                </h2>
                <p className="mt-5 max-w-lg text-[1.05rem] leading-8 text-muted-foreground xl:text-lg xl:leading-9">
                  {active.line}
                </p>
              </div>

              <div className="mt-9 flex items-center gap-2">
                {steps.map((step, index) => (
                  <button
                    type="button"
                    key={step.step}
                    onClick={() => goToDesktopStep(index)}
                    className={`h-1.5 rounded-full transition-all duration-500 ${
                      index === activeIndex
                        ? "w-10 bg-primary"
                        : index < activeIndex
                          ? "w-4 bg-primary/40"
                          : "w-4 bg-border"
                    }`}
                    aria-label={`اذهب إلى الخطوة ${step.step}`}
                  />
                ))}
              </div>
            </div>

            <div className="relative h-[72vh] min-h-[500px] max-h-[720px] xl:h-[77vh] xl:min-h-[590px] xl:max-h-[820px] 2xl:h-[80vh]">
              <div className="pointer-events-none absolute -left-3 top-1/2 z-30 hidden -translate-y-1/2 flex-col items-center gap-3 xl:flex">
                <span className="text-[10px] font-black tracking-[.18em] text-primary">
                  {active.step}
                </span>
                <span className="h-14 w-px bg-[linear-gradient(180deg,var(--primary),transparent)]" />
                <span className="text-[9px] font-bold text-muted-foreground">12</span>
              </div>

              {steps.map((step, index) => (
                <div
                  key={step.step}
                  className={`absolute inset-0 transition-all duration-700 [transition-timing-function:cubic-bezier(.22,1,.36,1)] ${
                    index === activeIndex
                      ? "translate-y-0 scale-100 opacity-100"
                      : index < activeIndex
                        ? "-translate-y-8 scale-[.965] opacity-0"
                        : "translate-y-8 scale-[.965] opacity-0"
                  }`}
                  aria-hidden={index !== activeIndex}
                >
                  <SceneVisual scene={step.scene} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="lg:hidden">
        <div className="sticky top-16 z-20 border-y border-border/60 bg-background/88 px-4 py-2.5 backdrop-blur-xl">
          <div className="mx-auto flex max-w-xl items-center gap-2">
            <span className="text-[10px] font-black tracking-[.16em] text-primary">
              {steps[activeIndex]?.step}/12
            </span>
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-border/70">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-500"
                style={{ width: `${((activeIndex + 1) / steps.length) * 100}%` }}
              />
            </div>
            <span className="text-[10px] font-bold text-muted-foreground">
              {steps[activeIndex]?.kicker}
            </span>
          </div>
        </div>

        {steps.map((step, index) => (
          <article
            key={step.step}
            ref={(node) => {
              mobileTriggerRefs.current[index] = node;
            }}
            data-index={index}
            className={`mobile-story-chapter border-b border-border/60 px-3 py-5 transition-opacity duration-500 ${
              index === activeIndex ? "opacity-100" : "opacity-[0.72]"
            }`}
          >
            <div className="mx-auto flex min-h-[calc(100svh-4rem)] max-w-xl flex-col justify-center">
              <div className="order-2 px-1 pb-3 pt-5">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black tracking-[.16em] text-primary">
                    {step.step}/12
                  </span>
                  <span className="h-px w-8 bg-primary/30" />
                  <span className="text-[11px] font-black text-muted-foreground">
                    {step.kicker}
                  </span>
                </div>
                <h2 className="mt-3 text-[2rem] font-black leading-[1.05] tracking-[-0.05em] text-foreground">
                  {step.title}
                </h2>
                <p className="mt-3 max-w-[34rem] text-sm leading-6 text-muted-foreground">
                  {step.line}
                </p>
              </div>

              <div
                className={`order-1 transition-all duration-700 [transition-timing-function:cubic-bezier(.22,1,.36,1)] ${
                  index === activeIndex
                    ? "translate-y-0 scale-100"
                    : "translate-y-2 scale-[.985]"
                }`}
              >
                <SceneVisual scene={step.scene} compact />
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
