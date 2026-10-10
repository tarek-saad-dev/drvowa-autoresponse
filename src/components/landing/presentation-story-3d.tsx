"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type StoryItem = {
  step: string;
  eyebrow: string;
  title: string;
  accent: string;
  body: string;
  bullets?: string[];
  scene: "orbit" | "business" | "agent" | "learn" | "guard" | "handoff" | "whatsapp" | "details" | "next" | "erp" | "daily" | "summary";
};

const story: StoryItem[] = [
  {
    step: "02",
    eyebrow: "أيًا كان شغلك",
    title: "جهّزه على احتياجك.",
    accent: "نفس المحرك، شخصية مختلفة لكل نشاط.",
    body: "شركة، متجر، عيادة، مركز تعليمي، مساعد شخصي أو أي نشاط تاني — تحدد دوره والمعلومات اللي يشتغل بيها، ويبدأ يرجع لعملائك على الأساس ده.",
    bullets: ["شركة", "متجر", "عيادة", "مركز تعليمي", "مساعد شخصي"],
    scene: "business",
  },
  {
    step: "03",
    eyebrow: "AI Agent",
    title: "عندك الـ AI Agent الخاص بيك.",
    accent: "مش ردود محفوظة.",
    body: "حدد دوره، أسلوب كلامه، وطريقة تعامله مع الناس. علّمه معلومات نشاطك والمعلومات اللي تسمح له يستخدمها، وسيبه يرد بالطريقة اللي تناسبك.",
    bullets: ["الدور", "أسلوب الكلام", "المعرفة", "طريقة التعامل"],
    scene: "agent",
  },
  {
    step: "04",
    eyebrow: "التعليم",
    title: "تعليمه سهل وتطويره مستمر.",
    accent: "ضيف، حدّث، صحّح.",
    body: "تضيف معلومات وخدمات وأسعار ومواعيد. تحدّث العروض والسياسات مع تغير شغلك. ولو رد بطريقة مش مناسبة، تصححه وتعلّمه الصح.",
    bullets: ["ضيف معلومات", "حدّث عروض وسياسات", "صحّح الردود"],
    scene: "learn",
  },
  {
    step: "05",
    eyebrow: "التحكم",
    title: "إنت بتحدد يرد على إيه.",
    accent: "والباقي يرجع لك.",
    body: "تحدد الموضوعات المسموحة، المعلومات اللي يقدر يشاركها، والحالات اللي لازم يحوّلها لمسؤول بدل ما يكمل لوحده.",
    bullets: ["موضوعات مسموحة", "معلومات مسموح بمشاركتها", "حالات تتصعّد لمسؤول"],
    scene: "guard",
  },
  {
    step: "06",
    eyebrow: "التدخل البشري",
    title: "اعرف مين محتاج تدخلك.",
    accent: "من غير ما تراجع كل الشاتات.",
    body: "المحادثات المهمة أو اللي محتاجة تدخل بتظهر بوضوح، والموظف يتنبه ويستلمها ويرجعها للـ AI لما يخلص.",
    bullets: ["محتاج متابعة", "استلام موظف", "إرجاع للـ AI"],
    scene: "handoff",
  },
  {
    step: "07",
    eyebrow: "واتساب",
    title: "وقت أقل في نفس الإجابات.",
    accent: "وردود أسرع على الأسئلة المتكررة.",
    body: "يستقبل رسائل واتساب ويرد بالمعلومات اللي علّمتهاله: مواعيد، أسعار، خدمات ومنتجات، وسياسات — وانت وفريقك تركزوا في الشغل اللي محتاجكم.",
    bullets: ["مواعيد وسياسات", "أسعار وباقات", "خدمات ومنتجات"],
    scene: "whatsapp",
  },
  {
    step: "08",
    eyebrow: "فهم التفاصيل",
    title: "يشرح التفاصيل… ويوضح الشروط.",
    accent: "مش مجرد يرسل سعر.",
    body: "يعرض الخدمة أو المنتج، يوضح السعر والمحتويات والشروط، ويشرح العرض المناسب بدل ما العميل يفضل يسأل سؤال وراء سؤال.",
    bullets: ["السعر", "المحتويات", "الشروط", "العروض"],
    scene: "details",
  },
  {
    step: "09",
    eyebrow: "الخطوة التالية",
    title: "ما بعد الرد… خطوة واضحة.",
    accent: "يكمّل الرحلة بدل ما يسيب العميل معلق.",
    body: "يوضح العنوان والمواعيد، يشارك الموقع، ويربط العميل بخطوة الحجز أو الطلب أو الإجراء التالي حسب طريقة تشغيلك.",
    bullets: ["Google Maps", "موقعك", "رابط الحجز", "موعد واضح"],
    scene: "next",
  },
  {
    step: "10",
    eyebrow: "ERP Connector",
    title: "إمكانية الربط بالـ ERP الخاص بيك.",
    accent: "يقرأ وينفذ المسموح فقط.",
    body: "يستخدم البيانات أو ينفذ الإجراءات اللي تسمح له بيها — مثل بيانات المنتجات والخدمات، حالة طلب، أو بيانات حجز.",
    bullets: ["بيانات خدمات ومنتجات", "حالة طلب", "بيانات حجز"],
    scene: "erp",
  },
  {
    step: "11",
    eyebrow: "تشغيل يومي",
    title: "الردود اليومية للمساعد… والقرارات ليك.",
    accent: "أتمتة لما ينفع، وتدخل بشري لما يلزم.",
    body: "المساعد يتولى الاستفسارات اليومية، وأنت أو فريقك تتدخلوا للحالات الحساسة أو اللي محتاجة قرار بشري.",
    bullets: ["المساعد", "أنت أو فريقك", "تحكم مستمر"],
    scene: "daily",
  },
  {
    step: "12",
    eyebrow: "الخلاصة",
    title: "وقت أكتر. تحكم أوضح. متابعة أسهل.",
    accent: "بمعلوماتك، بطريقتك، تحت إدارتك.",
    body: "حدد صلاحياته، طوّره باستمرار، وفر وقتك، تابع المهم، استخدمه بطريقتك، واربطه بأنظمتك لما تحتاج.",
    bullets: ["حدد صلاحياته", "طوّره باستمرار", "وفر وقتك", "تابع المهم", "اربطه بشغلك"],
    scene: "summary",
  },
];

function useTilt() {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;

    const onMove = (event: PointerEvent) => {
      const rect = element.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width - 0.5;
      const y = (event.clientY - rect.top) / rect.height - 0.5;
      element.style.setProperty("--tilt-x", `${(-y * 7).toFixed(2)}deg`);
      element.style.setProperty("--tilt-y", `${(x * 9).toFixed(2)}deg`);
      element.style.setProperty("--glow-x", `${((x + 0.5) * 100).toFixed(1)}%`);
      element.style.setProperty("--glow-y", `${((y + 0.5) * 100).toFixed(1)}%`);
    };
    const reset = () => {
      element.style.setProperty("--tilt-x", "0deg");
      element.style.setProperty("--tilt-y", "0deg");
    };
    element.addEventListener("pointermove", onMove);
    element.addEventListener("pointerleave", reset);
    return () => {
      element.removeEventListener("pointermove", onMove);
      element.removeEventListener("pointerleave", reset);
    };
  }, []);

  return ref;
}

function MiniCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-2xl border border-white/12 bg-white/[0.065] px-3 py-2.5 text-[11px] font-black text-white/90 shadow-[0_16px_45px_rgba(0,0,0,.22)] backdrop-blur-xl ${className}`}
    >
      {children}
    </div>
  );
}

function Scene({ item }: { item: StoryItem }) {
  const ref = useTilt();
  const cards = item.bullets ?? [];

  return (
    <div
      ref={ref}
      className="story-3d-card relative min-h-[330px] overflow-hidden rounded-[32px] border border-white/10 bg-[linear-gradient(145deg,#05090b_0%,#071319_46%,#004a66_135%)] shadow-[0_34px_100px_rgba(0,74,102,.24)] sm:min-h-[390px]"
      style={{ perspective: "1200px" }}
    >
      <div className="story-3d-glow absolute inset-0 opacity-80" />
      <div className="absolute inset-0 [background-image:radial-gradient(circle_at_center,rgba(255,255,255,.13)_0_1px,transparent_1px)] [background-size:22px_22px] opacity-20" />

      <div className="story-3d-stage absolute inset-0">
        <div className="story-orb absolute left-1/2 top-1/2 grid h-28 w-28 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-cyan-200/30 bg-[radial-gradient(circle_at_34%_30%,#52d5f5_0%,#0b8bb5_30%,#00759a_56%,#00384c_100%)] shadow-[0_0_60px_rgba(11,139,181,.65)] sm:h-32 sm:w-32">
          <div className="absolute inset-3 rounded-full border border-white/25" />
          <div className="absolute inset-7 rounded-full border border-white/20" />
          <span className="relative text-lg font-black tracking-tight text-white">DRVO</span>
          <span className="absolute bottom-8 text-[8px] font-bold tracking-[.15em] text-white/65">AI</span>
        </div>

        <div className="absolute left-1/2 top-1/2 h-[210px] w-[210px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-300/15 sm:h-[250px] sm:w-[250px]" />
        <div className="absolute left-1/2 top-1/2 h-[286px] w-[286px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-300/10 sm:h-[320px] sm:w-[320px]" />

        {cards.map((label, index) => {
          const positions = [
            "left-[6%] top-[12%]",
            "right-[6%] top-[15%]",
            "left-[8%] bottom-[14%]",
            "right-[8%] bottom-[14%]",
            "left-1/2 top-[5%] -translate-x-1/2",
          ];
          return (
            <MiniCard key={label} className={`absolute ${positions[index % positions.length]}`}>
              {label}
            </MiniCard>
          );
        })}

        {item.scene === "handoff" ? (
          <div className="absolute bottom-5 left-1/2 w-[72%] -translate-x-1/2 rounded-2xl border border-cyan-300/15 bg-[#08171e]/80 p-3 text-center text-xs font-black text-cyan-100 backdrop-blur">
            محتاج تدخل → تنبيه → استلام موظف
          </div>
        ) : null}

        {item.scene === "whatsapp" ? (
          <>
            <div className="absolute right-[8%] top-[31%] rounded-2xl rounded-br-md bg-[#005c4b] px-3 py-2 text-xs font-bold text-white shadow-xl">
              عندكم مواعيد النهارده؟
            </div>
            <div className="absolute bottom-[22%] left-[7%] rounded-2xl rounded-bl-md border border-white/10 bg-white/10 px-3 py-2 text-xs font-bold text-white shadow-xl">
              متاح 7:15 و 8:00
            </div>
          </>
        ) : null}

        {item.scene === "erp" ? (
          <div className="absolute bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-2xl border border-cyan-300/15 bg-[#061116]/85 px-4 py-3 text-[10px] font-black text-cyan-100 backdrop-blur">
            <span className="rounded-lg bg-cyan-400/10 px-2 py-1">ERP</span>
            <span>↔</span>
            <span className="rounded-lg bg-cyan-400/10 px-2 py-1">DRVO</span>
            <span>↔</span>
            <span className="rounded-lg bg-cyan-400/10 px-2 py-1">WhatsApp</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function StoryRow({ item, index }: { item: StoryItem; index: number }) {
  const [visible, setVisible] = useState(false);
  const rowRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const node = rowRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setVisible(true);
      },
      { threshold: 0.18 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const flip = index % 2 === 1;

  return (
    <section
      ref={rowRef}
      className="scroll-mt-24 py-10 sm:py-14 lg:py-16"
      data-visible={visible ? "true" : "false"}
    >
      <div
        className={`story-row mx-auto grid max-w-7xl gap-8 px-4 sm:px-6 lg:grid-cols-2 lg:items-center lg:gap-14 ${
          flip ? "lg:[&>*:first-child]:order-2" : ""
        }`}
      >
        <div className="story-copy">
          <div className="flex items-center gap-3">
            <span className="text-[11px] font-black tracking-[.18em] text-primary">{item.step}/12</span>
            <span className="h-px w-12 bg-primary/30" />
            <span className="text-xs font-black text-muted-foreground">{item.eyebrow}</span>
          </div>
          <h2 className="mt-4 max-w-xl text-3xl font-black leading-[1.2] tracking-[-0.04em] text-foreground sm:text-4xl">
            {item.title}
          </h2>
          <p className="mt-3 text-base font-black text-primary">{item.accent}</p>
          <p className="mt-4 max-w-xl text-sm leading-7 text-muted-foreground sm:text-base">
            {item.body}
          </p>
          {item.bullets?.length ? (
            <div className="mt-6 flex flex-wrap gap-2">
              {item.bullets.map((bullet) => (
                <span
                  key={bullet}
                  className="rounded-full border border-border bg-card/80 px-3 py-1.5 text-[11px] font-black text-foreground shadow-sm"
                >
                  {bullet}
                </span>
              ))}
            </div>
          ) : null}
        </div>
        <Scene item={item} />
      </div>
    </section>
  );
}

export function PresentationStory3D() {
  const items = useMemo(() => story, []);

  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-y-0 left-1/2 hidden w-px -translate-x-1/2 bg-[linear-gradient(180deg,transparent,var(--border),transparent)] xl:block" />
      {items.map((item, index) => (
        <StoryRow key={item.step} item={item} index={index} />
      ))}
    </div>
  );
}
