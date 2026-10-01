"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type Step =
  | "WELCOME"
  | "BUSINESS"
  | "KNOWLEDGE"
  | "PLAYGROUND"
  | "WHATSAPP"
  | "FIRST_MESSAGE"
  | "HUMAN_TAKEOVER"
  | "COMPLETED";

type MockState = "default" | "loading" | "success" | "error" | "compatibility-warning";

const FLOW: Array<{ key: Step; label: string; short: string }> = [
  { key: "WELCOME", label: "البداية", short: "ابدأ" },
  { key: "BUSINESS", label: "تعريف البيزنس", short: "البيزنس" },
  { key: "KNOWLEDGE", label: "تدريب الموظف", short: "التدريب" },
  { key: "PLAYGROUND", label: "تجربة الردود", short: "التجربة" },
  { key: "WHATSAPP", label: "ربط واتساب", short: "واتساب" },
  { key: "FIRST_MESSAGE", label: "أول رسالة", short: "أول رسالة" },
  { key: "HUMAN_TAKEOVER", label: "التحكم اليدوي", short: "التحكم" },
  { key: "COMPLETED", label: "جاهز", short: "جاهز" },
];

const businessQuestions = [
  { key: "name", label: "اسم البيزنس إيه؟", placeholder: "مثال: CUT SALON", kind: "text" },
  { key: "type", label: "نشاطك إيه؟", placeholder: "", kind: "type" },
  { key: "branches", label: "عندك كام فرع؟", placeholder: "", kind: "branches" },
  { key: "hours", label: "مواعيد العمل إيه؟", placeholder: "مثال: يوميًا من 11 ص إلى 2 ص", kind: "text" },
  { key: "link", label: "عندك موقع أو Instagram؟", placeholder: "اختياري", kind: "text" },
] as const;

const businessTypeChoices = ["صالون", "عيادة", "مطعم", "متجر", "خدمات", "أخرى"];
const branchChoices = ["فرع واحد", "فرعين", "3 فروع", "4+", "لسه ببدأ"];

const knowledgeChips = ["الخدمات", "الأسعار", "المواعيد", "الفروع", "السياسات", "العروض"];

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function GuidedOnboardingPreview() {
  const [step, setStep] = useState<Step>("WELCOME");
  const [mockState, setMockState] = useState<MockState>("default");
  const [businessQuestion, setBusinessQuestion] = useState(0);
  const [business, setBusiness] = useState<Record<string, string>>({});
  const [knowledge, setKnowledge] = useState("");
  const [chatCount, setChatCount] = useState(0);

  const index = FLOW.findIndex((item) => item.key === step);
  const progress = Math.max(0, Math.round((index / (FLOW.length - 1)) * 100));

  const currentBusinessQuestion = businessQuestions[businessQuestion];
  const currentBusinessValue = business[currentBusinessQuestion.key]?.trim() ?? "";
  const businessCanContinue =
    currentBusinessQuestion.key === "link" || currentBusinessValue.length > 0;

  const primaryLabel = useMemo(() => {
    switch (step) {
      case "WELCOME":
        return "ابدأ الإعداد";
      case "BUSINESS":
        return businessQuestion < businessQuestions.length - 1 ? "التالي" : "تمام — كمل";
      case "KNOWLEDGE":
        return mockState === "loading" ? "بنعلم الموظف..." : "علّم الموظف";
      case "PLAYGROUND":
        return "الردود تمام — وصل واتساب";
      case "WHATSAPP":
        return "تم الربط";
      case "FIRST_MESSAGE":
        return "كمل تجربة التحكم";
      case "HUMAN_TAKEOVER":
        return "فهمت";
      case "COMPLETED":
        return "افتح لوحة التحكم";
    }
  }, [step, businessQuestion, mockState]);

  function next() {
    if (step === "BUSINESS" && !businessCanContinue) return;
    if (step === "BUSINESS" && businessQuestion < businessQuestions.length - 1) {
      setBusinessQuestion((value) => value + 1);
      return;
    }
    if (step === "KNOWLEDGE" && mockState === "default") {
      setMockState("loading");
      window.setTimeout(() => setMockState("success"), 900);
      return;
    }
    if (step === "KNOWLEDGE" && mockState === "loading") return;

    const nextStep = FLOW[Math.min(index + 1, FLOW.length - 1)]?.key;
    if (nextStep) {
      setStep(nextStep);
      setMockState("default");
    }
  }

  function previous() {
    if (step === "BUSINESS" && businessQuestion > 0) {
      setBusinessQuestion((value) => value - 1);
      return;
    }
    const previousStep = FLOW[Math.max(index - 1, 0)]?.key;
    if (previousStep) {
      setStep(previousStep);
      setMockState("default");
    }
  }

  function jump(target: Step) {
    setStep(target);
    setMockState("default");
  }

  return (
    <main dir="rtl" className="relative min-h-screen overflow-x-hidden bg-[radial-gradient(circle_at_80%_0%,rgba(15,118,110,.15),transparent_35%),radial-gradient(circle_at_10%_90%,rgba(180,83,9,.10),transparent_35%),linear-gradient(180deg,#f8fbfc_0%,#eef4f6_100%)] px-4 pb-28 pt-5 text-foreground sm:px-6 sm:pb-10">
      <div className="mx-auto flex w-full max-w-5xl flex-col">
        <header className="mb-7 flex items-center justify-between gap-4">
          <div>
            <div className="text-lg font-black tracking-[-0.03em] text-primary">DRVOWA</div>
            <div className="mt-0.5 text-[11px] font-medium text-muted-foreground">إعداد موظف الاستقبال</div>
          </div>
          <div className="rounded-full border border-border/70 bg-white/75 px-3 py-1.5 text-xs font-semibold text-muted-foreground shadow-sm backdrop-blur">
            {Math.min(index + 1, FLOW.length)} من {FLOW.length}
          </div>
        </header>

        <section aria-label="تقدم الإعداد" className="mb-8">
          <div className="relative mx-auto max-w-4xl">
            <div className="absolute left-[6%] right-[6%] top-5 h-1 rounded-full bg-white/80 shadow-inner" />
            <div
              className="absolute right-[6%] top-5 h-1 rounded-full bg-primary transition-[width] duration-700 ease-out"
              style={{ width: `calc(${progress}% * .88)` }}
            />
            <div className="relative grid grid-cols-8 gap-1">
              {FLOW.map((item, itemIndex) => {
                const done = itemIndex < index;
                const active = itemIndex === index;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => jump(item.key)}
                    className="group flex flex-col items-center gap-2"
                    aria-current={active ? "step" : undefined}
                  >
                    <span
                      className={cx(
                        "grid h-9 w-9 place-items-center rounded-xl border-2 text-xs font-black shadow-sm transition-all duration-300 sm:h-10 sm:w-10 sm:rounded-2xl sm:text-sm",
                        done && "border-primary bg-primary text-white",
                        active && "scale-110 border-primary bg-white text-primary shadow-[0_10px_30px_rgba(15,118,110,.22)]",
                        !done && !active && "border-white bg-white/90 text-muted-foreground",
                      )}
                    >
                      {done ? "✓" : itemIndex === FLOW.length - 1 ? "★" : itemIndex + 1}
                    </span>
                    <span className={cx(
                      "hidden text-[10px] font-black transition md:block",
                      active ? "text-foreground" : done ? "text-primary" : "text-muted-foreground"
                    )}>{item.short}</span>
                  </button>
                );
              })}
            </div>
            <div className="mt-3 text-center text-xs font-black text-primary md:hidden">{FLOW[index]?.label}</div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-[840px]">
          <div className="overflow-hidden rounded-[30px] border border-white/80 bg-white/88 shadow-[0_24px_80px_rgba(15,28,36,.10)] backdrop-blur-xl">
            <div key={step} className="min-h-[540px] animate-[fadeIn_.28s_ease-out] p-6 sm:p-9 md:p-12">
              {step === "WELCOME" ? (
                <div className="flex min-h-[450px] flex-col items-center justify-center text-center">
                  <div className="mb-7 grid h-24 w-24 place-items-center rounded-[30px] bg-primary text-4xl text-primary-foreground shadow-[0_18px_50px_rgba(15,118,110,.28)]">✦</div>
                  <span className="mb-3 rounded-full bg-success-soft px-3 py-1 text-xs font-bold text-success">هنمشي معاك خطوة بخطوة</span>
                  <h1 className="max-w-2xl text-3xl font-black leading-[1.25] tracking-[-0.035em] sm:text-4xl">خلينا نجهز موظف الاستقبال بتاعك</h1>
                  <p className="mt-4 max-w-xl text-base leading-8 text-muted-foreground sm:text-lg">في كام خطوة بسيطة، هنعلمه بيزنسك، نجرب ردوده، ونوصله بواتساب لحد أول رد حقيقي.</p>
                  <div className="mt-8 grid w-full max-w-lg grid-cols-3 gap-3">
                    {[
                      ["01", "نعرف البيزنس"],
                      ["02", "ندرب الموظف"],
                      ["03", "نشغله على واتساب"],
                    ].map(([n, label]) => (
                      <div key={n} className="rounded-2xl border border-border/70 bg-surface/70 p-4">
                        <div className="text-xs font-black text-primary">{n}</div>
                        <div className="mt-1 text-xs font-bold sm:text-sm">{label}</div>
                      </div>
                    ))}
                  </div>
                  <p className="mt-6 text-xs text-muted-foreground">كل حاجة بتتحفظ تلقائيًا، وتقدر تكمل في أي وقت.</p>
                </div>
              ) : null}

              {step === "BUSINESS" ? (
                <div className="mx-auto flex min-h-[450px] max-w-2xl flex-col justify-center">
                  <div className="mb-8 flex items-center justify-between gap-4">
                    <div>
                      <span className="text-xs font-black text-primary">تعريف البيزنس</span>
                      <h2 className="mt-2 text-3xl font-black tracking-[-0.035em]">{currentBusinessQuestion.label}</h2>
                    </div>
                    <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary/10 text-lg font-black text-primary">{businessQuestion + 1}</div>
                  </div>
                  {currentBusinessQuestion.kind === "type" ? (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      {businessTypeChoices.map((choice) => {
                        const selected = business.type === choice;
                        return (
                          <button
                            key={choice}
                            type="button"
                            onClick={() => setBusiness((prev) => ({ ...prev, type: choice }))}
                            className={cx(
                              "rounded-2xl border-2 p-5 text-start text-sm font-black transition-all duration-200",
                              selected
                                ? "border-primary bg-primary/8 text-primary shadow-[0_10px_28px_rgba(15,118,110,.12)]"
                                : "border-border bg-white hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md",
                            )}
                          >
                            <span className="mb-3 block text-2xl">{choice === "صالون" ? "✂️" : choice === "عيادة" ? "🩺" : choice === "مطعم" ? "🍽️" : choice === "متجر" ? "🛍️" : choice === "خدمات" ? "🧩" : "✨"}</span>
                            {choice}
                          </button>
                        );
                      })}
                    </div>
                  ) : currentBusinessQuestion.kind === "branches" ? (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                      {branchChoices.map((choice) => {
                        const selected = business.branches === choice;
                        return (
                          <button
                            key={choice}
                            type="button"
                            onClick={() => setBusiness((prev) => ({ ...prev, branches: choice }))}
                            className={cx(
                              "rounded-2xl border-2 px-3 py-5 text-center text-sm font-black transition-all duration-200",
                              selected
                                ? "border-primary bg-primary text-white shadow-lg"
                                : "border-border bg-white hover:border-primary/50",
                            )}
                          >
                            {choice}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <Input
                      autoFocus
                      value={business[currentBusinessQuestion.key] ?? ""}
                      onChange={(event) => setBusiness((prev) => ({ ...prev, [currentBusinessQuestion.key]: event.target.value }))}
                      placeholder={currentBusinessQuestion.placeholder}
                      className="h-16 rounded-2xl border-2 bg-white px-5 text-lg font-semibold shadow-sm focus:border-primary"
                    />
                  )}
                  <div className="mt-5 flex gap-2">
                    {businessQuestions.map((_, qIndex) => (
                      <span key={qIndex} className={cx("h-1.5 flex-1 rounded-full transition", qIndex <= businessQuestion ? "bg-primary" : "bg-secondary")} />
                    ))}
                  </div>
                  <div className="mt-10 rounded-2xl border border-border/70 bg-surface/60 p-4 text-sm text-muted-foreground">
                    <span className="font-bold text-foreground">معلومة صغيرة:</span> مش لازم كل حاجة تكون كاملة دلوقتي. تقدر تعدلها بعدين.
                  </div>
                </div>
              ) : null}

              {step === "KNOWLEDGE" ? (
                <div className="mx-auto max-w-3xl">
                  <span className="text-xs font-black text-primary">تدريب الموظف</span>
                  <h2 className="mt-2 text-3xl font-black tracking-[-0.035em]">دلوقتي علّم موظفك</h2>
                  <p className="mt-3 leading-7 text-muted-foreground">الصق أي معلومات عندك، حتى لو مش مترتبة. إحنا هننظمها ونحولها لمعرفة يقدر يستخدمها في الرد.</p>

                  {mockState === "error" ? (
                    <div className="mt-8 rounded-[24px] border border-destructive/20 bg-destructive/5 p-6">
                      <div className="flex items-start gap-4">
                        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-destructive/10 font-black text-destructive">!</div>
                        <div>
                          <h3 className="font-black">مقدرناش نكمل التدريب المرة دي</h3>
                          <p className="mt-2 text-sm leading-7 text-muted-foreground">معلوماتك لسه موجودة. جرّب تاني من غير ما تعيد أي حاجة.</p>
                        </div>
                      </div>
                    </div>
                  ) : mockState === "loading" ? (
                    <div className="mt-8 space-y-3 rounded-[24px] border border-primary/20 bg-primary/5 p-6">
                      {["بقرأ المعلومات…", "بنظم الخدمات والأسعار…", "بفهم السياسات والمواعيد…", "بنجهز موظف الاستقبال…"].map((label, i) => (
                        <div key={label} className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm">
                          <span className={cx("grid h-8 w-8 place-items-center rounded-full text-sm font-black", i < 2 ? "bg-success-soft text-success" : "bg-secondary text-muted-foreground")}>{i < 2 ? "✓" : "…"}</span>
                          <span className="font-bold">{label}</span>
                        </div>
                      ))}
                    </div>
                  ) : mockState === "success" ? (
                    <div className="mt-8 rounded-[24px] border border-success/20 bg-success-soft/55 p-6">
                      <div className="flex items-center gap-4">
                        <div className="grid h-14 w-14 place-items-center rounded-2xl bg-success text-2xl text-white">✓</div>
                        <div>
                          <h3 className="text-xl font-black">جاهز للتجربة ✨</h3>
                          <p className="mt-1 text-sm text-muted-foreground">موظفك اتعلم 37 معلومة عن البيزنس.</p>
                        </div>
                      </div>
                      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
                        {[
                          ["الخدمات", "12"],
                          ["الأسعار", "9"],
                          ["المواعيد", "3"],
                          ["السياسات", "7"],
                          ["عام", "6"],
                        ].map(([label, count]) => (
                          <div key={label} className="rounded-2xl bg-white/85 p-3 text-center">
                            <div className="text-lg font-black">{count}</div>
                            <div className="mt-1 text-[11px] font-bold text-muted-foreground">{label}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <>
                      <Textarea
                        value={knowledge}
                        onChange={(event) => setKnowledge(event.target.value)}
                        placeholder="مثال: عندنا فرعين، بنفتح يوميًا من 11 الصبح، خدمة الشعر بـ200 جنيه، الحجز متاح من الموقع..."
                        className="mt-7 min-h-56 rounded-[24px] border-2 bg-white p-5 text-base leading-8 shadow-sm focus:border-primary"
                      />
                      <div className="mt-4 flex flex-wrap gap-2">
                        {knowledgeChips.map((chip) => (
                          <span key={chip} className="rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-bold text-secondary-foreground">{chip}</span>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              ) : null}

              {step === "PLAYGROUND" ? (
                <div className="mx-auto max-w-3xl">
                  <span className="text-xs font-black text-primary">تجربة الردود</span>
                  <h2 className="mt-2 text-3xl font-black tracking-[-0.035em]">كلمه زي العميل</h2>
                  <p className="mt-3 text-muted-foreground">جرب سؤالين أو تلاتة قبل ما توصله بعملائك.</p>
                  <div className="mt-6 flex flex-wrap gap-2">
                    {["أسعاركم إيه؟", "مواعيدكم؟", "عاوز أحجز", "عندكم كام فرع؟"].map((question) => (
                      <button
                        key={question}
                        type="button"
                        onClick={() => setChatCount((n) => Math.min(3, n + 1))}
                        className="rounded-full border border-border bg-white px-4 py-2 text-sm font-bold shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary hover:text-primary hover:shadow-md"
                      >
                        {question}
                      </button>
                    ))}
                  </div>
                  <div className="mt-6 rounded-[26px] border border-border bg-surface/50 p-4 sm:p-6">
                    <div className="space-y-4">
                      <div className="mr-auto max-w-[82%] translate-y-0 rounded-2xl rounded-bl-md bg-white p-4 text-sm shadow-sm transition-all">مواعيدكم إيه؟</div>
                      <div className="ml-auto max-w-[86%] rounded-2xl rounded-br-md bg-primary p-4 text-sm leading-7 text-primary-foreground shadow-md">
                        أهلاً بيك 👋 إحنا متاحين يوميًا، ولو تحب أساعدك في الحجز قولي أنسب يوم ليك.
                        <div className="mt-2 text-[10px] font-semibold text-primary-foreground/70">رد تجريبي من موظفك</div>
                      </div>
                      {chatCount > 0 ? (
                        <div className="mr-auto max-w-[82%] rounded-2xl rounded-bl-md bg-white p-4 text-sm shadow-sm">طب والأسعار؟</div>
                      ) : null}
                      {chatCount > 0 ? (
                        <div className="ml-auto max-w-[86%] rounded-2xl rounded-br-md bg-primary p-4 text-sm leading-7 text-primary-foreground shadow-md">
                          أقدر أقولك الأسعار بالتفصيل حسب الخدمة اللي محتاجها، وقولي تحب تبدأ بإيه؟
                        </div>
                      ) : null}
                    </div>
                    <div className="mt-4 flex gap-2">
                      <button type="button" onClick={() => setChatCount((n) => Math.min(3, n + 1))} className="rounded-xl bg-success-soft px-3 py-2 text-xs font-black text-success">تمام 👍</button>
                      <button type="button" className="rounded-xl bg-white px-3 py-2 text-xs font-black text-muted-foreground shadow-sm">عدّل المعلومة</button>
                    </div>
                  </div>
                  <div className="mt-5 flex flex-wrap gap-2 text-xs font-bold">
                    <span className="rounded-full bg-success-soft px-3 py-1.5 text-success">الخدمات ✓</span>
                    <span className={cx("rounded-full px-3 py-1.5", chatCount > 0 ? "bg-success-soft text-success" : "bg-secondary text-muted-foreground")}>الأسعار {chatCount > 0 ? "✓" : "○"}</span>
                    <span className={cx("rounded-full px-3 py-1.5", chatCount > 1 ? "bg-success-soft text-success" : "bg-secondary text-muted-foreground")}>المواعيد {chatCount > 1 ? "✓" : "○"}</span>
                  </div>
                </div>
              ) : null}

              {step === "WHATSAPP" ? (
                <div className="mx-auto max-w-3xl text-center">
                  <span className="text-xs font-black text-primary">ربط واتساب</span>
                  <h2 className="mt-2 text-3xl font-black tracking-[-0.035em]">وصّل موظفك بواتساب</h2>
                  <p className="mt-3 text-muted-foreground">3 خطوات بسيطة، ومش هنطلب منك أي إعدادات تقنية.</p>
                  <div className="mt-7 grid gap-3 sm:grid-cols-3">
                    {[
                      ["1", "افتح واتساب"],
                      ["2", "الأجهزة المرتبطة"],
                      ["3", "امسح QR"],
                    ].map(([n, label]) => (
                      <div key={n} className="rounded-2xl border border-border bg-surface/60 p-4">
                        <span className="mx-auto grid h-8 w-8 place-items-center rounded-full bg-primary text-xs font-black text-white">{n}</span>
                        <div className="mt-2 text-sm font-black">{label}</div>
                      </div>
                    ))}
                  </div>
                  <div className="mx-auto mt-7 w-full max-w-md rounded-[28px] border border-border bg-white p-5 shadow-[0_18px_55px_rgba(15,28,36,.10)]">
                    <div className="mx-auto grid h-52 w-52 place-items-center rounded-3xl border border-border bg-[linear-gradient(90deg,#0f1c24_50%,transparent_50%),linear-gradient(#0f1c24_50%,transparent_50%)] bg-[length:18px_18px] bg-[position:0_0,9px_9px] p-5">
                      <div className="grid h-16 w-16 place-items-center rounded-2xl border-4 border-white bg-primary text-xl font-black text-white shadow-lg">D</div>
                    </div>
                    <div className="mt-4 flex items-center justify-center gap-2 text-xs font-bold text-muted-foreground">
                      <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
                      الكود بيتجدد تلقائيًا عند الحاجة
                    </div>
                  </div>
                  <div className={cx(
                    "mx-auto mt-6 max-w-md rounded-2xl border p-4 text-sm font-black transition-all",
                    mockState === "compatibility-warning"
                      ? "border-warning/25 bg-warning-soft text-warning"
                      : mockState === "success"
                        ? "border-success/20 bg-success-soft text-success"
                        : "border-border bg-surface text-muted-foreground"
                  )}>
                    {mockState === "compatibility-warning"
                      ? "الاتصال تم، لكن محتاج تهيئة إضافية لتحسين استقبال الرسائل."
                      : mockState === "error"
                        ? "الكود انتهت صلاحيته — هنطلع لك كود جديد من غير ما تبدأ من الأول."
                        : mockState === "success"
                          ? "تم الربط — استقبال الرسائل شغال ✓"
                          : "مستني المسح…"}
                  </div>
                </div>
              ) : null}

              {step === "FIRST_MESSAGE" ? (
                <div className="mx-auto max-w-2xl text-center">
                  <span className="text-xs font-black text-primary">أول تجربة حقيقية</span>
                  <h2 className="mt-2 text-3xl font-black tracking-[-0.035em]">يلا نجربه بجد</h2>
                  <p className="mt-3 leading-7 text-muted-foreground">من أي رقم واتساب تاني ابعت لرقم البيزنس:</p>
                  <div className="mx-auto mt-5 w-fit rounded-2xl rounded-bl-md bg-[#dcf8c6] px-6 py-4 text-lg font-black shadow-sm">السلام عليكم</div>
                  <div className="mt-8 space-y-3 text-start">
                    {["مستني الرسالة", "وصلت الرسالة", "الموظف فهمها", "جهز الرد", "تم الرد"].map((label, i) => {
                      const active = mockState === "success" ? true : i === 0;
                      return (
                        <div key={label} className="flex items-center gap-4 rounded-2xl border border-border/70 bg-white p-4 shadow-sm">
                          <span className={cx("grid h-9 w-9 place-items-center rounded-full font-black", active ? "bg-success text-white" : "bg-secondary text-muted-foreground")}>{active ? "✓" : "○"}</span>
                          <span className="font-black">{label}</span>
                        </div>
                      );
                    })}
                  </div>
                  {mockState === "success" ? <div className="mt-6 text-xl font-black text-success">أول رد حقيقي تم 🎉</div> : null}
                  {mockState === "error" ? (
                    <div className="mt-6 rounded-2xl border border-destructive/20 bg-destructive/5 p-4 text-sm font-bold text-destructive">
                      الرسالة موصلتش لسه. تأكد إنك بعت من رقم مختلف وجرّب تاني.
                    </div>
                  ) : null}
                </div>
              ) : null}

              {step === "HUMAN_TAKEOVER" ? (
                <div className="mx-auto flex min-h-[440px] max-w-2xl flex-col items-center justify-center text-center">
                  <div className="grid h-20 w-20 place-items-center rounded-[26px] bg-primary/10 text-3xl">✋</div>
                  <span className="mt-6 text-xs font-black text-primary">التحكم اليدوي</span>
                  <h2 className="mt-2 text-3xl font-black tracking-[-0.035em]">وأنت دايمًا المتحكم</h2>
                  <p className="mt-4 max-w-lg leading-8 text-muted-foreground">رد بنفسك من موبايل واتساب على نفس المحادثة. DRVOWA هيعرف إن حد من فريقك تدخل.</p>
                  <div className={cx("mt-8 w-full max-w-md rounded-2xl p-5 text-sm font-black", mockState === "success" ? "bg-success-soft text-success" : "bg-surface text-muted-foreground")}>
                    {mockState === "success" ? "تمام 👌 وقفنا الرد التلقائي للمحادثة دي." : "مستني ردك اليدوي…"}
                  </div>
                  {mockState === "success" ? <p className="mt-4 max-w-lg text-sm leading-7 text-muted-foreground">أي وقت حد من فريقك يرد بنفسه، DRVOWA يسيب المحادثة ليكم تلقائيًا.</p> : null}
                </div>
              ) : null}

              {step === "COMPLETED" ? (
                <div className="mx-auto flex min-h-[460px] max-w-2xl flex-col items-center justify-center text-center">
                  <div className="mb-6 grid h-24 w-24 place-items-center rounded-full bg-success text-4xl text-white shadow-[0_18px_55px_rgba(4,120,87,.28)]">✓</div>
                  <span className="rounded-full bg-accent-soft px-4 py-1.5 text-xs font-black text-accent">جاهز للشغل</span>
                  <h2 className="mt-4 text-3xl font-black tracking-[-0.035em] sm:text-4xl">موظف الاستقبال بتاعك جاهز 🎉</h2>
                  <div className="mt-7 grid w-full gap-2 text-start sm:grid-cols-2">
                    {["عرف بيزنسك", "اتعلم المعلومات", "جربت ردوده", "واتساب متصل", "أول رسالة اترد عليها", "التحكم اليدوي شغال"].map((label) => (
                      <div key={label} className="flex items-center gap-3 rounded-2xl bg-surface/70 p-4 text-sm font-black">
                        <span className="grid h-7 w-7 place-items-center rounded-full bg-success-soft text-xs text-success">✓</span>
                        {label}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="hidden items-center justify-between gap-3 border-t border-border/70 bg-white/75 px-6 py-5 sm:flex sm:px-9 md:px-12">
              <Button type="button" variant="ghost" disabled={step === "WELCOME"} onClick={previous}>السابق</Button>
              <Button
                type="button"
                onClick={next}
                disabled={mockState === "loading" || (step === "BUSINESS" && !businessCanContinue)}
                className="min-w-44"
              >
                {primaryLabel}
              </Button>
            </div>
          </div>
        </section>

        <div className="mt-6 hidden justify-center md:flex">
          <div className="flex items-center gap-2 rounded-2xl border border-border/70 bg-white/75 p-2 shadow-sm backdrop-blur">
            <span className="px-2 text-[11px] font-bold text-muted-foreground">Preview state</span>
            {(["default", "loading", "success", "error", "compatibility-warning"] as MockState[]).map((state) => (
              <button key={state} type="button" onClick={() => setMockState(state)} className={cx("rounded-xl px-2.5 py-1.5 text-[10px] font-bold transition", mockState === state ? "bg-primary text-white" : "text-muted-foreground hover:bg-secondary")}>{state}</button>
            ))}
          </div>
        </div>
      </div>

      <style jsx global>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px) scale(.995); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border/70 bg-white/95 p-3 shadow-[0_-8px_30px_rgba(15,28,36,.08)] backdrop-blur sm:hidden">
        <div className="mx-auto flex max-w-lg gap-2">
          {step !== "WELCOME" ? <Button type="button" variant="outline" className="w-24" onClick={previous}>السابق</Button> : null}
          <Button
            type="button"
            className="flex-1"
            onClick={next}
            disabled={mockState === "loading" || (step === "BUSINESS" && !businessCanContinue)}
          >
            {primaryLabel}
          </Button>
        </div>
      </div>
    </main>
  );
}
