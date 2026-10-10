"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

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

function Orb() {
  return (
    <div className="absolute left-1/2 top-1/2 h-36 w-36 -translate-x-1/2 -translate-y-1/2 sm:h-44 sm:w-44">
      <div className="cinema-orb absolute inset-0 rounded-full border border-cyan-200/30 bg-[radial-gradient(circle_at_32%_28%,#5de0ff_0%,#0b8bb5_28%,#00759a_55%,#00394e_100%)] shadow-[0_0_90px_rgba(11,139,181,.62)]" />
      <div className="absolute inset-5 rounded-full border border-white/20" />
      <div className="absolute inset-10 rounded-full border border-white/15" />
      <div className="absolute inset-0 grid place-items-center">
        <div className="text-center text-white">
          <div className="text-xl font-black tracking-[-0.05em]">DRVO</div>
          <div className="mt-0.5 text-[9px] font-black tracking-[.22em] text-white/65">AI</div>
        </div>
      </div>
    </div>
  );
}

function FloatCard({
  children,
  className = "",
  delay = "0s",
}: {
  children: ReactNode;
  className?: string;
  delay?: string;
}) {
  return (
    <div
      className={`cinema-float absolute rounded-2xl border border-white/10 bg-white/[0.075] px-3 py-2.5 text-xs font-black text-white/90 shadow-[0_20px_50px_rgba(0,0,0,.24)] backdrop-blur-xl ${className}`}
      style={{ animationDelay: delay }}
    >
      {children}
    </div>
  );
}

function SceneVisual({ scene }: { scene: StoryScene }) {
  return (
    <div className="relative h-full min-h-[440px] overflow-hidden rounded-[34px] border border-white/10 bg-[linear-gradient(145deg,#04090c_0%,#071319_46%,#004a66_140%)] shadow-[0_36px_120px_rgba(0,74,102,.30)] sm:min-h-[520px]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_55%_44%,rgba(30,190,235,.16),transparent_28%),radial-gradient(circle_at_15%_12%,rgba(0,117,154,.16),transparent_30%)]" />
      <div className="absolute inset-0 [background-image:radial-gradient(circle_at_center,rgba(255,255,255,.13)_0_1px,transparent_1px)] [background-size:24px_24px] opacity-[0.13]" />

      <Orb />

      {scene === "business" ? (
        <>
          <FloatCard className="left-[7%] top-[16%]" delay=".1s">شركة</FloatCard>
          <FloatCard className="right-[7%] top-[18%]" delay=".4s">عيادة</FloatCard>
          <FloatCard className="left-[9%] bottom-[17%]" delay=".8s">متجر</FloatCard>
          <FloatCard className="right-[8%] bottom-[16%]" delay="1.1s">مركز تعليمي</FloatCard>
          <FloatCard className="left-1/2 top-[7%] -translate-x-1/2" delay="1.4s">مساعد شخصي</FloatCard>
        </>
      ) : null}

      {scene === "agent" ? (
        <>
          <div className="cinema-phone absolute left-1/2 top-1/2 h-[300px] w-[164px] -translate-x-1/2 -translate-y-1/2 rounded-[34px] border border-cyan-200/25 bg-black/35 p-3 shadow-[0_35px_80px_rgba(0,0,0,.38)] backdrop-blur">
            <div className="h-full rounded-[26px] border border-white/10 bg-[linear-gradient(180deg,rgba(15,139,181,.18),rgba(255,255,255,.035))] p-3">
              <div className="mx-auto mt-2 h-14 w-14 rounded-full border border-cyan-200/20 bg-cyan-400/10 shadow-[0_0_30px_rgba(11,139,181,.35)]" />
              <div className="mt-5 h-2 rounded-full bg-white/15" />
              <div className="mt-2 h-2 w-3/4 rounded-full bg-white/10" />
              <div className="mt-7 h-14 rounded-2xl border border-white/10 bg-white/[0.05]" />
              <div className="mt-3 h-14 rounded-2xl border border-white/10 bg-white/[0.05]" />
            </div>
          </div>
          <FloatCard className="left-[6%] top-[18%]">الدور</FloatCard>
          <FloatCard className="right-[7%] top-[20%]" delay=".4s">أسلوب الكلام</FloatCard>
          <FloatCard className="left-[7%] bottom-[17%]" delay=".8s">المعرفة</FloatCard>
          <FloatCard className="right-[7%] bottom-[19%]" delay="1.2s">طريقة التعامل</FloatCard>
        </>
      ) : null}

      {scene === "learn" ? (
        <>
          <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 gap-3">
            {["ضيف", "حدّث", "صحّح"].map((label, index) => (
              <div
                key={label}
                className="cinema-stack flex h-40 w-24 items-end rounded-[24px] border border-cyan-200/15 bg-white/[0.06] p-3 shadow-xl backdrop-blur sm:h-48 sm:w-28"
                style={{ animationDelay: `${index * 0.35}s` }}
              >
                <div>
                  <div className="mb-2 h-8 w-8 rounded-xl bg-cyan-400/10" />
                  <div className="text-sm font-black text-white">{label}</div>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : null}

      {scene === "guard" ? (
        <>
          <div className="cinema-shield absolute left-1/2 top-1/2 h-64 w-52 -translate-x-1/2 -translate-y-1/2 [clip-path:polygon(50%_0,92%_17%,88%_69%,50%_100%,12%_69%,8%_17%)] border border-cyan-200/20 bg-[linear-gradient(180deg,rgba(11,139,181,.18),rgba(0,57,78,.40))] shadow-[0_0_80px_rgba(11,139,181,.25)]" />
          <FloatCard className="left-[8%] top-[18%]">يرد</FloatCard>
          <FloatCard className="right-[8%] top-[18%]">مسموح</FloatCard>
          <FloatCard className="left-1/2 bottom-[11%] -translate-x-1/2">يرجع لك عند الحاجة</FloatCard>
        </>
      ) : null}

      {scene === "handoff" ? (
        <>
          {[["عميل 1","left-[7%] top-[12%]"],["عميل 2","right-[8%] top-[14%]"],["عميل 3","left-[11%] bottom-[20%]"],["عميل 4","right-[10%] bottom-[22%]"]].map(([label,pos],i)=>(
            <FloatCard key={label} className={pos} delay={`${i*.3}s`}>{label}</FloatCard>
          ))}
          <div className="absolute bottom-6 left-1/2 w-[74%] -translate-x-1/2 rounded-2xl border border-cyan-300/15 bg-[#071319]/85 p-4 text-center text-xs font-black text-cyan-50 backdrop-blur">
            محتاج تدخل → تنبيه → استلام موظف
          </div>
        </>
      ) : null}

      {scene === "whatsapp" ? (
        <>
          <div className="cinema-phone absolute left-[9%] top-1/2 h-[330px] w-[176px] -translate-y-1/2 rounded-[34px] border border-white/15 bg-black/45 p-2.5 shadow-2xl">
            <div className="h-full rounded-[27px] bg-[#0b141a] p-3">
              <div className="mt-10 ml-auto w-[86%] rounded-2xl rounded-br-md bg-[#005c4b] px-3 py-2 text-[11px] font-bold text-white">كام سعر الخدمة؟</div>
              <div className="mt-3 mr-auto w-[88%] rounded-2xl rounded-bl-md bg-[#202c33] px-3 py-2 text-[11px] font-bold text-white">الخدمة تبدأ من 200 جنيه</div>
              <div className="mt-3 ml-auto w-[72%] rounded-2xl rounded-br-md bg-[#005c4b] px-3 py-2 text-[11px] font-bold text-white">في مواعيد النهارده؟</div>
              <div className="mt-3 mr-auto w-[82%] rounded-2xl rounded-bl-md bg-[#202c33] px-3 py-2 text-[11px] font-bold text-white">متاح 7:15 و 8:00</div>
            </div>
          </div>
          <FloatCard className="right-[7%] top-[18%]">أسعار</FloatCard>
          <FloatCard className="right-[10%] top-[42%]" delay=".4s">مواعيد</FloatCard>
          <FloatCard className="right-[7%] bottom-[18%]" delay=".8s">سياسات</FloatCard>
        </>
      ) : null}

      {scene === "details" ? (
        <>
          <div className="absolute left-1/2 top-1/2 h-[270px] w-[220px] -translate-x-1/2 -translate-y-1/2 rounded-[28px] border border-cyan-200/15 bg-white/[0.055] p-4 shadow-2xl backdrop-blur">
            <div className="h-28 rounded-2xl bg-[linear-gradient(135deg,rgba(11,139,181,.22),rgba(255,255,255,.04))]" />
            <div className="mt-4 h-3 w-2/3 rounded-full bg-white/18" />
            <div className="mt-2 h-2 w-full rounded-full bg-white/10" />
            <div className="mt-2 h-2 w-4/5 rounded-full bg-white/10" />
          </div>
          <FloatCard className="left-[7%] top-[16%]">السعر</FloatCard>
          <FloatCard className="right-[7%] top-[18%]">المحتويات</FloatCard>
          <FloatCard className="left-[8%] bottom-[17%]">الشروط</FloatCard>
          <FloatCard className="right-[8%] bottom-[18%]">العرض</FloatCard>
        </>
      ) : null}

      {scene === "next" ? (
        <>
          <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-3">
            {["موقع", "موعد", "حجز"].map((label, index) => (
              <div key={label} className="cinema-node grid h-24 w-24 place-items-center rounded-[26px] border border-cyan-200/15 bg-white/[0.06] text-sm font-black text-white shadow-xl" style={{ animationDelay: `${index*.35}s` }}>
                {label}
              </div>
            ))}
          </div>
          <div className="absolute left-[23%] right-[23%] top-1/2 h-px bg-[linear-gradient(90deg,transparent,rgba(93,224,255,.45),transparent)]" />
        </>
      ) : null}

      {scene === "erp" ? (
        <>
          <div className="absolute left-[7%] top-1/2 flex h-52 w-28 -translate-y-1/2 flex-col justify-center gap-2 rounded-[22px] border border-cyan-200/15 bg-[#071319]/80 p-3 shadow-xl">
            {[1,2,3,4].map((n)=><div key={n} className="h-5 rounded-lg border border-white/8 bg-white/[0.055]" />)}
            <div className="mt-2 text-center text-sm font-black text-white">ERP</div>
          </div>
          <div className="absolute right-[8%] top-1/2 grid -translate-y-1/2 gap-3">
            <FloatCard className="relative">بيانات حجز</FloatCard>
            <FloatCard className="relative" delay=".4s">حالة طلب</FloatCard>
            <FloatCard className="relative" delay=".8s">خدمات ومنتجات</FloatCard>
          </div>
        </>
      ) : null}

      {scene === "daily" ? (
        <>
          <div className="absolute left-[6%] top-[20%] h-24 w-24 rounded-full border border-white/10 bg-white/[0.055] shadow-xl" />
          <div className="absolute right-[6%] top-[20%] h-24 w-24 rounded-full border border-white/10 bg-white/[0.055] shadow-xl" />
          <div className="absolute bottom-[14%] left-1/2 w-[78%] -translate-x-1/2 rounded-3xl border border-cyan-200/15 bg-white/[0.055] p-4 text-center text-xs font-black text-white/85 backdrop-blur">
            الروتيني للمساعد · المهم لفريقك
          </div>
        </>
      ) : null}

      {scene === "summary" ? (
        <>
          {["صلاحيات", "تطوير", "وقت", "متابعة", "ربط"].map((label, i) => {
            const pos = [
              "left-[7%] top-[17%]",
              "right-[7%] top-[18%]",
              "left-[8%] bottom-[18%]",
              "right-[8%] bottom-[18%]",
              "left-1/2 top-[7%] -translate-x-1/2",
            ][i];
            return <FloatCard key={label} className={pos ?? ""} delay={`${i*.25}s`}>{label}</FloatCard>;
          })}
        </>
      ) : null}
    </div>
  );
}

export function PresentationScrollytelling() {
  const [activeIndex, setActiveIndex] = useState(0);
  const triggerRefs = useRef<Array<HTMLDivElement | null>>([]);

  const observer = useMemo(
    () =>
      typeof window === "undefined"
        ? null
        : new IntersectionObserver(
            (entries) => {
              const visible = entries
                .filter((entry) => entry.isIntersecting)
                .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
              if (!visible) return;
              const index = Number((visible.target as HTMLElement).dataset.index ?? 0);
              setActiveIndex(index);
            },
            {
              rootMargin: "-32% 0px -48% 0px",
              threshold: [0, 0.2, 0.5, 0.8, 1],
            },
          ),
    [],
  );

  useEffect(() => {
    if (!observer) return;
    const refs = triggerRefs.current.filter(Boolean) as HTMLDivElement[];
    refs.forEach((ref) => observer.observe(ref));
    return () => observer.disconnect();
  }, [observer]);

  const active = steps[activeIndex] ?? steps[0];

  return (
    <section id="story" className="relative scroll-mt-20 bg-background">
      <div className="hidden lg:block">
        <div className="relative mx-auto max-w-7xl px-6">
          <div className="sticky top-16 z-10 flex h-[calc(100svh-4rem)] items-center py-8">
            <div className="grid w-full grid-cols-[0.72fr_1.28fr] items-center gap-12">
              <div className="relative z-20">
                <div className="flex items-center gap-3">
                  <span className="text-[11px] font-black tracking-[.2em] text-primary">
                    {active.step}/12
                  </span>
                  <span className="h-px w-12 bg-primary/30" />
                  <span className="text-xs font-black text-muted-foreground">{active.kicker}</span>
                </div>

                <div key={active.step} className="cinema-copy-enter">
                  <h2 className="mt-5 max-w-xl text-5xl font-black leading-[1.08] tracking-[-0.055em] text-foreground xl:text-6xl">
                    {active.title}
                  </h2>
                  <p className="mt-5 max-w-lg text-lg leading-8 text-muted-foreground">
                    {active.line}
                  </p>
                </div>

                <div className="mt-9 flex items-center gap-2">
                  {steps.map((step, index) => (
                    <button
                      type="button"
                      key={step.step}
                      onClick={() => triggerRefs.current[index]?.scrollIntoView({ behavior: "smooth", block: "center" })}
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

              <div className="relative h-[76vh] min-h-[560px] max-h-[760px]">
                {steps.map((step, index) => (
                  <div
                    key={step.step}
                    className={`absolute inset-0 transition-all duration-700 [transition-timing-function:cubic-bezier(.22,1,.36,1)] ${
                      index === activeIndex
                        ? "translate-y-0 scale-100 opacity-100"
                        : index < activeIndex
                          ? "-translate-y-8 scale-[.96] opacity-0"
                          : "translate-y-8 scale-[.96] opacity-0"
                    }`}
                    aria-hidden={index !== activeIndex}
                  >
                    <SceneVisual scene={step.scene} />
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="-mt-[calc(100svh-4rem)]">
            {steps.map((step, index) => (
              <div
                key={step.step}
                ref={(node) => {
                  triggerRefs.current[index] = node;
                }}
                data-index={index}
                className="h-[82svh]"
              />
            ))}
          </div>
        </div>
      </div>

      <div className="lg:hidden">
        {steps.map((step) => (
          <article key={step.step} className="min-h-[92svh] border-b border-border/60 px-4 py-10">
            <div className="mx-auto max-w-xl">
              <div className="mb-5 flex items-center gap-3">
                <span className="text-[10px] font-black tracking-[.18em] text-primary">{step.step}/12</span>
                <span className="text-xs font-black text-muted-foreground">{step.kicker}</span>
              </div>
              <SceneVisual scene={step.scene} />
              <h2 className="mt-7 text-3xl font-black leading-[1.15] tracking-[-0.04em] text-foreground">
                {step.title}
              </h2>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">{step.line}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
