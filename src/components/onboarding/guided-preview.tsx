"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { BrandLogo } from "@/components/brand/brand-logo";
import { OnboardingChatBrand } from "@/components/onboarding/onboarding-chat-brand";
import { OnboardingLogoutButton } from "@/components/onboarding/onboarding-logout-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { DISCOVERY_ANSWER_MAX_CHARS, DISCOVERY_MAX_TURNS } from "@/lib/onboarding/discovery-limits";

import "./onboarding-theme.css";

type Step =
  | "BUSINESS"
  | "KNOWLEDGE"
  | "PLAYGROUND"
  | "WHATSAPP"
  | "FIRST_MESSAGE"
  | "HUMAN_TAKEOVER"
  | "COMPLETED";

type MockState = "default" | "loading" | "success" | "error" | "compatibility-warning";

type KnowledgeMode = "guided" | "freeform";

type DiscoveryTurn = {
  question: string;
  answer: string;
  topic?: string;
};

type KnowledgeTreeItem = {
  proposalId: string;
  action: "CREATE" | "MERGE" | "NOOP" | "CONFLICT" | "DELETE";
  category: string;
  title: string;
  topicKey?: string | null;
  topicTitle?: string | null;
};

function initialDiscoveryQuestion(type?: string) {
  const businessType = type?.trim() || "البيزنس";
  const examples: Record<string, string> = {
    "صالون": "الخدمات الأساسية والإضافات والباقات والحجز",
    "عيادة": "الكشف والخدمات أو الإجراءات والحجز والمتابعة",
    "مطعم": "الأكل والمشروبات والطلبات والدليفري أو الاستلام",
    "متجر": "المنتجات والاختيارات والطلب والشحن أو الاستلام",
    "خدمات": "الخدمات اللي بتقدمها وخطوات طلب وتنفيذ كل خدمة",
  };
  const hint = examples[businessType] || "كل حاجة العميل ممكن يطلبها أو يسأل عنها";
  return `بما إن نشاطك ${businessType}، احكيلي كأني عميل جديد: بتقدمولي إيه بالظبط؟ اذكر ${hint}، حتى التفاصيل الصغيرة والاختيارات الإضافية.`;
}

function compileDiscoveryKnowledge(
  business: Record<string, string>,
  turns: DiscoveryTurn[],
) {
  return [
    `نوع النشاط: ${business.type === "أخرى" ? business.customType || "غير محدد" : business.type || "غير محدد"}`,
    business.name ? `اسم النشاط: ${business.name}` : "",
    business.branches ? `الفروع: ${business.branches}` : "",
    business.hours ? `المواعيد الأولية: ${business.hours}` : "",
    "",
    "مقابلة معرفة النشاط:",
    ...turns.flatMap((turn, index) => [
      `سؤال ${index + 1}: ${turn.question}`,
      `الإجابة: ${turn.answer}`,
      "",
    ]),
  ].filter((line, index, arr) => line !== "" || arr[index - 1] !== "").join("\n").trim();
}

const FLOW: Array<{ key: Step; label: string; short: string }> = [
  { key: "BUSINESS", label: "تعريف البيزنس", short: "البيزنس" },
  { key: "KNOWLEDGE", label: "تدريب الموظف", short: "التدريب" },
  { key: "PLAYGROUND", label: "تجربة الردود", short: "التجربة" },
  { key: "WHATSAPP", label: "ربط واتساب", short: "واتساب" },
  { key: "FIRST_MESSAGE", label: "أول رسالة", short: "أول رسالة" },
  { key: "HUMAN_TAKEOVER", label: "التحكم اليدوي", short: "التحكم" },
  { key: "COMPLETED", label: "جاهز", short: "جاهز" },
];

const STEP_SCENES: Record<Step, { line: string; cue: string }> = {
  BUSINESS: { line: "نبدأ بيك. احكيلنا عن المكان اللي موظفك هيمثّله.", cue: "يلا نتعرف على بيزنسك…" },
  KNOWLEDGE: { line: "من تفاصيلك الصغيرة هنكوّن معرفة تخلّيه يرد بثقة.", cue: "بنجهز مساحة التدريب…" },
  PLAYGROUND: { line: "دلوقتي حان وقت التجربة. اسأله كأنك عميل.", cue: "بنفتح مساحة التجربة…" },
  WHATSAPP: { line: "فاضل نوصل موظفك بالمكان اللي عملاؤك بيكلموك منه.", cue: "بنجهز ربط واتساب…" },
  FIRST_MESSAGE: { line: "أول رسالة حقيقية. من هنا تبدأ الحكاية.", cue: "بنستعد لأول رسالة…" },
  HUMAN_TAKEOVER: { line: "لو العميل طلب موظف بشري — البوت بيسكت وبيسيبك تتدخل.", cue: "بنوريك ميزة التدخل البشري…" },
  COMPLETED: { line: "الإعداد خلص — موظفك جاهز يشتغل.", cue: "بنجهّز لوحة التحكم…" },
};

const businessQuestions = [
  { key: "identity", label: "عرّفنا على البيزنس", placeholder: "مثال: CUT SALON", kind: "identity" },
  { key: "link", label: "عندك موقع أو Instagram؟", placeholder: "اختياري", kind: "text" },
] as const;

/** Topics tracked by discovery API — used for learning progress UI. */
const DISCOVERY_TOPIC_TOTAL = 12;
/** Minimum learning % before the user can leave the training chat. */
const LEARNING_MIN_PCT = 70;

function calcLearningPercent(covered: string[], missing: string[], turns: number): number {
  const coveredUnique = new Set(covered.filter(Boolean));
  const missingUnique = new Set(missing.filter(Boolean));
  const known = new Set([...coveredUnique, ...missingUnique]).size;
  const denom = Math.max(known, DISCOVERY_TOPIC_TOTAL);
  let pct = Math.round((coveredUnique.size / denom) * 100);
  if (coveredUnique.size === 0 && turns > 0) {
    pct = Math.max(pct, Math.min(15, turns * 5));
  }
  return Math.min(100, Math.max(0, pct));
}

function learningTone(pct: number): "low" | "mid" | "high" {
  if (pct >= LEARNING_MIN_PCT) return "high";
  if (pct >= 40) return "mid";
  return "low";
}

const PLAYGROUND_MIN_TRIES = 1;

function playgroundSuggestedQuestions(businessType: string): Array<{ question: string; hint: string }> {
  const type = businessType.trim();
  if (type.includes("عقار") || type === "خدمات") {
    return [
      { question: "عندكم شقق للبيع في التجمع؟", hint: "يفهم الطلب ويقترح بدائل" },
      { question: "إيجار شقة غرفتين بكام تقريبًا؟", hint: "يرد بأسعار واضحة" },
      { question: "عاوز أحجز معاينة بكرة العصر", hint: "يوجه للحجز صح" },
      { question: "بتشتغلوا لحد الساعة كام؟", hint: "مواعيد دقيقة من غير تخمين" },
      { question: "في عمولة على الوساطة؟", hint: "يوضح السياسات بهدوء" },
    ];
  }
  if (type === "صالون") {
    return [
      { question: "قص وتصفيف بكام؟", hint: "أسعار الخدمات" },
      { question: "ممكن أحجز معاد بكرة؟", hint: "مسار الحجز" },
      { question: "بتنظفوا بـ صبغة كمان؟", hint: "يعرف نطاق الخدمات" },
      { question: "مواعيدكم إيه النهاردة؟", hint: "مواعيد فورية" },
    ];
  }
  if (type === "عيادة") {
    return [
      { question: "كشف الدكتور بكام؟", hint: "الأسعار بوضوح" },
      { question: "في معاد فاضي الأسبوع ده؟", hint: "الحجز والمواعيد" },
      { question: "بتكشفوا أطفال كمان؟", hint: "نطاق التخصص" },
      { question: "عنوان العيادة فين؟", hint: "معلومات الوصول" },
    ];
  }
  if (type === "مطعم") {
    return [
      { question: "عندكم وجبات نباتي؟", hint: "يفهم المينيو" },
      { question: "التوصيل لمصر الجديدة بكام؟", hint: "التوصيل والأسعار" },
      { question: "عاوز أطلب دلوقتي", hint: "مسار الطلب" },
      { question: "فاتحين لحد امتى؟", hint: "المواعيد" },
    ];
  }
  if (type === "متجر") {
    return [
      { question: "المنتج ده متوفر؟", hint: "التوفر والمخزون" },
      { question: "سعر التوصيل كام؟", hint: "الشحن بوضوح" },
      { question: "ينفع استبدال؟", hint: "السياسات" },
      { question: "عندكم فرع في المعادي؟", hint: "الفروع" },
    ];
  }
  return [
    { question: "بتقدموا إيه بالظبط؟", hint: "يعرّف البيزنس بثقة" },
    { question: "الأسعار تقريبًا كام؟", hint: "يرد من غير لف" },
    { question: "إزاي أحجز أو أطلب؟", hint: "يوضح الخطوة الجاية" },
    { question: "مواعيدكم إيه؟", hint: "معلومة جاهزة فورًا" },
    { question: "لو حصلت مشكلة أكلم مين؟", hint: "يعرف متى يحوّل لبشر" },
  ];
}

const businessTypeChoices = ["صالون", "عيادة", "مطعم", "متجر", "خدمات", "أخرى"];
const countryChoices = [
  { code: "EG", label: "مصر", locale: "ar-EG", timezone: "Africa/Cairo" },
  { code: "SA", label: "السعودية", locale: "ar-SA", timezone: "Asia/Riyadh" },
  { code: "AE", label: "الإمارات", locale: "ar-AE", timezone: "Asia/Dubai" },
  { code: "KW", label: "الكويت", locale: "ar-KW", timezone: "Asia/Kuwait" },
] as const;
const voicePromptExamples: Record<string, string[]> = {
  offerings: ["بتقدم إيه بالظبط؟", "إيه أشهر الخدمات أو المنتجات؟", "في اختيارات أو إضافات؟", "العميل بيطلب الخدمة إزاي؟"],
  pricing: ["أسعار الخدمات كام؟", "في باقات أو عروض؟", "في مصاريف إضافية؟", "طرق الدفع المتاحة إيه؟"],
  availability: ["بتفتحوا إمتى؟", "في أيام إجازة؟", "الحجز محتاج ميعاد؟", "المواعيد بتختلف حسب الفرع؟"],
  booking_ordering: ["العميل يحجز أو يطلب إزاي؟", "إيه البيانات المطلوبة؟", "ينفع يلغي أو يغيّر؟", "الطلب بياخد وقت قد إيه؟"],
  policies: ["سياسة الإلغاء إيه؟", "في استبدال أو استرجاع؟", "إيه أهم شروط التعامل؟", "إمتى يتحول لموظف بشري؟"],
  human_escalation: ["إمتى العميل يحتاج موظف؟", "بيتواصل مع مين؟", "إيه المشاكل اللي محتاجة تدخل؟", "مواعيد متابعة الشكاوى إيه؟"],
  faq: ["العملاء بيسألوا عن إيه كتير؟", "إيه الإجابات الدقيقة؟", "إيه الحالات الاستثنائية؟", "في معلومات لازم تتأكد منها؟"],
};
const defaultVoicePrompts = ["طبيعة شغلك إيه؟", "خدماتك وأسعارك كام؟", "فروعك وعناوينها فين؟", "مواعيدك وسياساتك إيه؟"];

function getVoicePrompts(topic: string | null, businessType: string): string[] {
  if (topic && voicePromptExamples[topic]) return voicePromptExamples[topic];
  if (businessType === "مطعم") return ["بتقدموا أكلات إيه؟", "أسعار المنيو والعروض؟", "الدليفري والتوصيل فين؟", "مواعيد العمل والطلبات؟"];
  if (businessType === "صالون") return ["خدمات الشعر والبشرة إيه؟", "أسعار الخدمات والباقات؟", "الفروع والحجز والمواعيد؟", "العروض والسياسات؟"];
  if (businessType === "عيادة") return ["التخصص والخدمات إيه؟", "أسعار الكشف والمتابعة؟", "العنوان ومواعيد الحجز؟", "تعليمات وسياسات العيادة؟"];
  return defaultVoicePrompts;
}


function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function MicrophonePermissionHelp({ state }: { state: "blocked" | "unavailable" }) {
  return (
    <div className="mt-3 rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs leading-6 text-foreground" role="status">
      {state === "blocked" ? (
        <>
          <p className="font-black">المايك محتاج سماح من المتصفح</p>
          <p className="mt-1 text-muted-foreground">
            اضغط أيقونة إعدادات الموقع جنب الرابط فوق، واختار Microphone → Allow، وبعدها اضغط Reload وجرّب «جاوب بصوتك» تاني.
            لو دي أول مرة بتطلب الإذن، المتصفح هيعرض نافذة Allow / Block بنفسه.
          </p>
        </>
      ) : (
        <>
          <p className="font-black">مش قادرين نبدأ التسجيل من الجهاز ده</p>
          <p className="mt-1 text-muted-foreground">اتأكد إن الميكروفون متوصل ومتاح للمتصفح، وبعدها جرّب زر الصوت تاني. وتقدر تكتب إجابتك عادي.</p>
        </>
      )}
    </div>
  );
}

export function GuidedOnboardingPreview({
  storageKey = "drvowa_guided_onboarding_draft_v4_preview",
  selectedPlan = null,
}: {
  storageKey?: string;
  selectedPlan?: string | null;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("BUSINESS");
  const [transitioning, setTransitioning] = useState(false);
  const [transitionMessage, setTransitionMessage] = useState("");
  const [mockState, setMockState] = useState<MockState>("default");
  const [businessQuestion, setBusinessQuestion] = useState(0);
  const [business, setBusiness] = useState<Record<string, string>>({ countryCode: "EG" });
  const [knowledge, setKnowledge] = useState("");
  const [chatCount, setChatCount] = useState(0);
  const [workspaceReady, setWorkspaceReady] = useState(false);
  const [agentId, setAgentId] = useState<string | null>(null);
  const [knowledgeCount, setKnowledgeCount] = useState(0);
  const [knowledgeSummary, setKnowledgeSummary] = useState<Record<string, number>>({});
  const [knowledgeTreeItems, setKnowledgeTreeItems] = useState<KnowledgeTreeItem[]>([]);
  const [knowledgeApplied, setKnowledgeApplied] = useState(false);
  const [previewQuestion, setPreviewQuestion] = useState("");
  const [previewReply, setPreviewReply] = useState("");
  const [previewReplies, setPreviewReplies] = useState<Record<string, string>>({});
  const [playgroundTurns, setPlaygroundTurns] = useState<Array<{
    question: string;
    answer: string;
    rating?: "up" | "down";
    teachNote?: string;
  }>>([]);
  const [playgroundInput, setPlaygroundInput] = useState("");
  const [teachTurnIndex, setTeachTurnIndex] = useState<number | null>(null);
  const [teachDraft, setTeachDraft] = useState("");
  const [teachSaving, setTeachSaving] = useState(false);
  const [teachError, setTeachError] = useState<string | null>(null);
  const previewPendingRef = useRef<Set<string>>(new Set());
  const [previewLoading, setPreviewLoading] = useState(false);
  const [playgroundIntro, setPlaygroundIntro] = useState(true);
  const playgroundChatEndRef = useRef<HTMLDivElement | null>(null);
  const [qrImageDataUrl, setQrImageDataUrl] = useState<string | null>(null);
  const [waReady, setWaReady] = useState(false);
  const [waRuntimeDisabled, setWaRuntimeDisabled] = useState(false);
  const [firstMessageStage, setFirstMessageStage] = useState(0);
  const [testConversationId, setTestConversationId] = useState<string | null>(null);
  const [humanTakeoverDone, setHumanTakeoverDone] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [draftRestored, setDraftRestored] = useState(false);
  const firstMessageStartedAt = useRef<string | null>(null);
  const sceneTimerRef = useRef<number | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const [recording, setRecording] = useState(false);
  const [recordingPaused, setRecordingPaused] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [microphoneHelp, setMicrophoneHelp] = useState<"blocked" | "unavailable" | null>(null);
  const [knowledgeMode, setKnowledgeMode] = useState<KnowledgeMode>("guided");
  const [discoveryTurns, setDiscoveryTurns] = useState<DiscoveryTurn[]>([]);
  const [discoveryQuestion, setDiscoveryQuestion] = useState("");
  const [discoveryTopic, setDiscoveryTopic] = useState<string | null>("offerings");
  const [discoveryInput, setDiscoveryInput] = useState("");
  const [discoveryCovered, setDiscoveryCovered] = useState<string[]>([]);
  const [discoveryMissing, setDiscoveryMissing] = useState<string[]>([]);
  const [discoveryDone, setDiscoveryDone] = useState(false);
  const [discoveryLoading, setDiscoveryLoading] = useState(false);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);
  const [discoveryInputError, setDiscoveryInputError] = useState<string | null>(null);
  const voiceTargetRef = useRef<"knowledge" | "discovery">("knowledge");
  const discoveryInputRef = useRef("");
  const discoveryChatEndRef = useRef<HTMLDivElement | null>(null);
  const [voiceFlowState, setVoiceFlowState] = useState<
    "idle" | "recording" | "transcribing" | "saving"
  >("idle");
  const trainingStartedRef = useRef(false);

  const index = FLOW.findIndex((item) => item.key === step);
  const progress = Math.max(0, Math.round((index / (FLOW.length - 1)) * 100));
  const learningPercent = calcLearningPercent(discoveryCovered, discoveryMissing, discoveryTurns.length);
  const learningLevel = learningTone(learningPercent);
  const learningReady = learningPercent >= LEARNING_MIN_PCT;
  const playgroundReady = playgroundTurns.length >= PLAYGROUND_MIN_TRIES;
  const isChatStep = step === "KNOWLEDGE" || step === "PLAYGROUND";
  const isCompactStep = step === "WHATSAPP" || step === "FIRST_MESSAGE" || step === "HUMAN_TAKEOVER" || step === "COMPLETED";
  useEffect(() => {
    if (step === "KNOWLEDGE" && !discoveryDone) {
      discoveryChatEndRef.current?.scrollIntoView({ block: "nearest", behavior: "instant" });
    }
  }, [step, discoveryTurns, discoveryQuestion, discoveryLoading, discoveryDone]);
  useEffect(() => {
    if (step !== "PLAYGROUND") return;
    setPlaygroundIntro(true);
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(() => setPlaygroundIntro(false), reduceMotion ? 400 : 2600);
    return () => window.clearTimeout(timer);
  }, [step]);
  useEffect(() => {
    if (step !== "PLAYGROUND") return;
    playgroundChatEndRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [step, playgroundTurns, previewQuestion, previewLoading, previewReply, teachTurnIndex]);
  useEffect(() => () => {
    if (sceneTimerRef.current !== null) window.clearTimeout(sceneTimerRef.current);
  }, []);

  const currentBusinessQuestion = businessQuestions[businessQuestion];
  const currentBusinessValue = business[currentBusinessQuestion.key]?.trim() ?? "";
  const businessNameValue = business.name?.trim() ?? "";
  const showBusinessTypePicker = businessNameValue.length > 0;
  const effectiveBusinessType =
    business.type === "أخرى"
      ? business.customType?.trim() || "نشاط آخر"
      : business.type?.trim() || "";
  const playgroundQuestions = useMemo(
    () => playgroundSuggestedQuestions(effectiveBusinessType),
    [effectiveBusinessType],
  );
  const typeReady =
    business.type === "أخرى"
      ? Boolean(business.customType?.trim())
      : Boolean(business.type?.trim());
  const businessCanContinue =
    currentBusinessQuestion.key === "link"
    || (currentBusinessQuestion.kind === "identity"
      ? businessNameValue.length > 0 && typeReady
      : currentBusinessValue.length > 0);
  const typeSectionRef = useRef<HTMLDivElement | null>(null);
  const didRevealTypeRef = useRef(false);

  useEffect(() => {
    if (step !== "BUSINESS" || currentBusinessQuestion.kind !== "identity") return;
    if (!showBusinessTypePicker) {
      didRevealTypeRef.current = false;
      return;
    }
    if (didRevealTypeRef.current) return;
    didRevealTypeRef.current = true;
    const timer = window.setTimeout(() => {
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      typeSectionRef.current?.scrollIntoView({
        behavior: reduceMotion ? "auto" : "smooth",
        block: "nearest",
      });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [step, currentBusinessQuestion.kind, showBusinessTypePicker]);

  /* eslint-disable react-hooks/set-state-in-effect -- guided onboarding restores and polls external state */
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        const saved = JSON.parse(raw) as {
          step?: Step | "WELCOME";
          businessQuestion?: number;
          business?: Record<string, string>;
          knowledge?: string;
          knowledgeApplied?: boolean;
          knowledgeCount?: number;
          knowledgeSummary?: Record<string, number>;
          knowledgeTreeItems?: KnowledgeTreeItem[];
          knowledgeMode?: KnowledgeMode;
          discoveryTurns?: DiscoveryTurn[];
          discoveryQuestion?: string;
          discoveryTopic?: string | null;
          discoveryInput?: string;
          discoveryCovered?: string[];
          discoveryMissing?: string[];
          discoveryDone?: boolean;
          firstMessageStartedAt?: string | null;
          firstMessageStage?: number;
          testConversationId?: string | null;
          humanTakeoverDone?: boolean;
        };
        if (saved.step === "WELCOME") {
          setStep("BUSINESS");
        } else if (saved.step && FLOW.some((item) => item.key === saved.step)) {
          setStep(saved.step);
        }
        if (typeof saved.businessQuestion === "number") {
          setBusinessQuestion(
            Math.min(Math.max(0, saved.businessQuestion), businessQuestions.length - 1),
          );
        }
        if (saved.business && typeof saved.business === "object") {
          setBusiness({ countryCode: "EG", ...saved.business });
        }
        if (typeof saved.knowledge === "string") {
          setKnowledge(saved.knowledge);
        }
        if (saved.knowledgeApplied === true) {
          setKnowledgeApplied(true);
          if (saved.step === "KNOWLEDGE") setMockState("success");
        }
        if (typeof saved.knowledgeCount === "number") {
          setKnowledgeCount(saved.knowledgeCount);
        }
        if (saved.knowledgeSummary && typeof saved.knowledgeSummary === "object") {
          setKnowledgeSummary(saved.knowledgeSummary);
        }
        if (Array.isArray(saved.knowledgeTreeItems)) {
          setKnowledgeTreeItems(saved.knowledgeTreeItems);
        }
        if (saved.knowledgeMode === "guided" || saved.knowledgeMode === "freeform") {
          setKnowledgeMode(saved.knowledgeMode);
        }
        if (Array.isArray(saved.discoveryTurns)) {
          setDiscoveryTurns(saved.discoveryTurns);
          const lastSavedTurn = saved.discoveryTurns.at(-1);
          if (saved.step === "KNOWLEDGE" && !saved.discoveryDone && lastSavedTurn
            && lastSavedTurn.question === saved.discoveryQuestion) {
            // Older clients saved the answer before the API rejected the next-question request.
            // Preserve the reply and expose Retry after a reload, rather than asking it again.
            setDiscoveryError("معلومتك موجودة في المسودة. اضغط «حاول تاني» عشان نكمل من آخر إجابة.");
          }
        }
        if (typeof saved.discoveryQuestion === "string") setDiscoveryQuestion(saved.discoveryQuestion);
        if (typeof saved.discoveryTopic === "string" || saved.discoveryTopic === null) setDiscoveryTopic(saved.discoveryTopic ?? null);
        if (typeof saved.discoveryInput === "string") setDiscoveryInput(saved.discoveryInput);
        if (Array.isArray(saved.discoveryCovered)) setDiscoveryCovered(saved.discoveryCovered);
        if (Array.isArray(saved.discoveryMissing)) setDiscoveryMissing(saved.discoveryMissing);
        if (saved.discoveryDone === true) setDiscoveryDone(true);
        if (typeof saved.firstMessageStartedAt === "string" && saved.firstMessageStartedAt) {
          firstMessageStartedAt.current = saved.firstMessageStartedAt;
        }
        if (typeof saved.firstMessageStage === "number") {
          setFirstMessageStage(Math.min(5, Math.max(0, saved.firstMessageStage)));
        }
        if (typeof saved.testConversationId === "string" && saved.testConversationId) {
          setTestConversationId(saved.testConversationId);
        }
        if (saved.humanTakeoverDone === true) setHumanTakeoverDone(true);
      }
    } catch {
      // Local resume is best-effort only.
    } finally {
      setDraftRestored(true);
    }

    void (async () => {
      try {
        const response = await fetch("/api/businesses", { cache: "no-store" });
        const data = await response.json();
        if (response.ok && Array.isArray(data.businesses) && data.businesses.length > 0) {
          setWorkspaceReady(true);
          const agentsResponse = await fetch("/api/agents", { cache: "no-store" });
          const agentsData = await agentsResponse.json();
          const existingAgent = agentsData?.agents?.find((item: { isActive?: boolean }) => item.isActive)
            ?? agentsData?.agents?.[0];
          if (existingAgent?.agentId) setAgentId(existingAgent.agentId);
        }
      } catch {
        // Setup can still create the first workspace later.
      }
    })();
  }, [storageKey]);

  useEffect(() => {
    if (!draftRestored) return;
    try {
      window.localStorage.setItem(
        storageKey,
        JSON.stringify({
          step,
          businessQuestion,
          business,
          knowledge,
          knowledgeApplied,
          knowledgeCount,
          knowledgeSummary,
          knowledgeTreeItems,
          knowledgeMode,
          discoveryTurns,
          discoveryQuestion,
          discoveryTopic,
          discoveryInput,
          discoveryCovered,
          discoveryMissing,
          discoveryDone,
          firstMessageStartedAt: firstMessageStartedAt.current,
          firstMessageStage,
          testConversationId,
          humanTakeoverDone,
        }),
      );
    } catch {
      // Local resume is best-effort only.
    }
  }, [
    step,
    businessQuestion,
    business,
    knowledge,
    knowledgeApplied,
    knowledgeCount,
    knowledgeSummary,
    knowledgeTreeItems,
    knowledgeMode,
    discoveryTurns,
    discoveryQuestion,
    discoveryTopic,
    discoveryInput,
    discoveryCovered,
    discoveryMissing,
    discoveryDone,
    firstMessageStage,
    testConversationId,
    humanTakeoverDone,
    storageKey,
    draftRestored,
  ]);

  useEffect(() => {
    if (step !== "WHATSAPP") return;
    // Don't reuse KNOWLEDGE/FIRST_MESSAGE "success" — WhatsApp readiness is waReady only.
    if (!waReady) {
      setMockState((current) => (current === "success" ? "default" : current));
    }
  }, [step, waReady]);

  useEffect(() => {
    if (step !== "WHATSAPP" || !workspaceReady) return;
    let stopped = false;
    const tick = async () => {
      try {
        const response = await fetch("/api/channels/whatsapp/status", { cache: "no-store" });
        const data = await response.json();
        if (stopped || !response.ok) return;
        if (data.uiState === "READY") {
          setWaReady(true);
          setMockState("success");
          return;
        }
        if (data.uiState === "RUNTIME_DISABLED") {
          setWaReady(false);
          setWaRuntimeDisabled(true);
          setQrImageDataUrl(null);
          return;
        }
        setWaRuntimeDisabled(false);
        // Still linking — never keep a stale success badge.
        setWaReady(false);
        if (!qrImageDataUrl) {
          const qrResponse = await fetch("/api/channels/whatsapp/qr", { cache: "no-store" });
          const qrData = await qrResponse.json().catch(() => ({}));
          if (qrResponse.ok && qrData.qrImageDataUrl) {
            setQrImageDataUrl(qrData.qrImageDataUrl);
            setLiveError(null);
            setMockState((current) => (current === "loading" || current === "error" ? "default" : current));
          }
        }
        if (data.compatibility?.status === "DEGRADED_CRYPTO") {
          setMockState("compatibility-warning");
        } else {
          setMockState((current) => (current === "success" ? "default" : current));
        }
      } catch {
        // Keep polling; transient status failures should not break setup.
      }
    };
    void tick();
    const timer = window.setInterval(tick, 2000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [step, workspaceReady, qrImageDataUrl]);

  useEffect(() => {
    if (step !== "FIRST_MESSAGE" || !workspaceReady) return;
    if (!firstMessageStartedAt.current) {
      // Look back a bit so a refresh mid-step still finds the test conversation.
      firstMessageStartedAt.current = new Date(Date.now() - 45 * 60 * 1000).toISOString();
    }
    let stopped = false;
    const tick = async () => {
      try {
        const response = await fetch("/api/inbox/conversations?limit=10", { cache: "no-store" });
        const data = await response.json();
        if (stopped || !response.ok || !Array.isArray(data.conversations)) return;
        const started = new Date(firstMessageStartedAt.current!).getTime();
        const conversation = (
          testConversationId
            ? data.conversations.find((item: { conversationId?: string }) => item.conversationId === testConversationId)
            : null
        ) ?? data.conversations.find((item: {
          lastInboundAtUtc?: string | null;
        }) => item.lastInboundAtUtc && new Date(item.lastInboundAtUtc).getTime() >= started);
        if (!conversation) return;
        setTestConversationId(conversation.conversationId);
        setFirstMessageStage((value) => Math.max(value, 2));
        window.setTimeout(() => setFirstMessageStage((value) => Math.max(value, 3)), 350);

        const messagesResponse = await fetch(
          `/api/inbox/conversations/${conversation.conversationId}/messages?limit=30`,
          { cache: "no-store" },
        );
        const messagesData = await messagesResponse.json();
        if (!messagesResponse.ok || !Array.isArray(messagesData.messages)) return;
        const outbound = messagesData.messages.some((message: {
          direction?: string;
          createdAtUtc?: string;
        }) => message.direction === "OUTBOUND"
          && message.createdAtUtc
          && new Date(message.createdAtUtc).getTime() >= started);
        if (outbound) {
          setFirstMessageStage(5);
          setMockState("success");
        } else {
          // Inbound landed — show "جهز الرد" while the AI worker sends.
          setFirstMessageStage((value) => Math.max(value, 4));
        }
      } catch {
        // Polling is intentionally tolerant.
      }
    };
    void tick();
    const timer = window.setInterval(tick, 1800);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [step, workspaceReady, testConversationId]);

  useEffect(() => {
    if (step !== "HUMAN_TAKEOVER" || !testConversationId) return;
    let stopped = false;
    const tick = async () => {
      try {
        const response = await fetch("/api/inbox/conversations?limit=10", { cache: "no-store" });
        const data = await response.json();
        if (stopped || !response.ok || !Array.isArray(data.conversations)) return;
        const conversation = data.conversations.find(
          (item: { conversationId?: string }) => item.conversationId === testConversationId,
        );
        if (conversation?.aiMode === "HUMAN_PAUSED"
          && conversation?.aiPauseReason === "HUMAN_TAKEOVER") {
          setHumanTakeoverDone(true);
          setMockState("success");
        }
      } catch {
        // Keep the guided wait state.
      }
    };
    void tick();
    const timer = window.setInterval(tick, 1800);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [step, testConversationId]);

  /* eslint-enable react-hooks/set-state-in-effect */

  async function startVoiceRecording(target: "knowledge" | "discovery" = "knowledge") {
    setVoiceError(null);
    setMicrophoneHelp(null);
    voiceTargetRef.current = target;

    // Request access directly in the button click. The browser shows its native
    // Allow / Block prompt when permission hasn't already been decided.
    if (
      typeof window === "undefined"
      || !navigator.mediaDevices?.getUserMedia
      || typeof MediaRecorder === "undefined"
    ) {
      setMicrophoneHelp("unavailable");
      return;
    }

    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const preferredTypes = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/mp4",
      ];
      const mimeType = preferredTypes.find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      audioChunksRef.current = [];
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        stream?.getTracks().forEach((track) => track.stop());
        mediaRecorderRef.current = null;
        setRecordingPaused(false);
        setRecording(false);
        if (voiceTargetRef.current === "discovery") setVoiceFlowState("transcribing");
        void transcribeVoice(blob);
      };

      recorder.start();
      if (target === "discovery") setVoiceFlowState("recording");
      setRecordingPaused(false);
      setRecording(true);
    } catch (error) {
      stream?.getTracks().forEach((track) => track.stop());
      if (target === "discovery") setVoiceFlowState("idle");
      const name = error instanceof Error ? error.name : "";
      setMicrophoneHelp(
        name === "NotAllowedError" || name === "PermissionDeniedError" || name === "SecurityError"
          ? "blocked"
          : "unavailable",
      );
    }
  }

  function stopVoiceRecording() {
    if (
      mediaRecorderRef.current?.state === "recording"
      || mediaRecorderRef.current?.state === "paused"
    ) {
      mediaRecorderRef.current.stop();
    }
  }

  function pauseVoiceRecording() {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state !== "recording") return;
    if (typeof recorder.pause !== "function") return;

    try {
      recorder.pause();
      setRecordingPaused(true);
    } catch {
      // Some browsers expose pause() but do not support it reliably.
      // In that case, keep recording rather than interrupting the answer.
    }
  }

  function resumeVoiceRecording() {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state !== "paused") return;
    if (typeof recorder.resume !== "function") return;

    try {
      recorder.resume();
      setRecordingPaused(false);
    } catch {
      setVoiceError("مقدرناش نكمل التسجيل من نفس النقطة. تقدر تنهي التسجيل وتبدأ إجابة جديدة.");
    }
  }

  async function transcribeVoice(blob: Blob) {
    if (blob.size === 0) {
      if (voiceTargetRef.current === "discovery") setVoiceFlowState("idle");
      setVoiceError("التسجيل فاضي. جرّب تتكلم تاني.");
      return;
    }

    setTranscribing(true);
    setVoiceError(null);
    try {
      const form = new FormData();
      const extension = blob.type.includes("mp4") ? "m4a" : "webm";
      form.append("file", blob, `onboarding-voice.${extension}`);

      const response = await fetch("/api/voice/transcribe", {
        method: "POST",
        body: form,
      });
      const data = (await response.json().catch(() => ({}))) as {
        text?: string;
        error?: string;
      };

      if (!response.ok || !data.text?.trim()) {
        throw new Error(data.error || "تعذر تحويل الصوت إلى نص");
      }

      const transcript = data.text!.trim();
      if (voiceTargetRef.current === "discovery") {
        const existing = discoveryInputRef.current.trim();
        const answer = existing ? `${existing} ${transcript}` : transcript;
        setDiscoveryInput(answer);
        discoveryInputRef.current = answer;
        setVoiceFlowState("saving");
        await submitDiscoveryAnswer(answer);
      } else {
        setKnowledge((current) =>
          current.trim() ? `${current.trim()}\n${transcript}` : transcript,
        );
      }
    } catch (error) {
      if (voiceTargetRef.current === "discovery") setVoiceFlowState("idle");
      setVoiceError(
        error instanceof Error ? error.message : "تعذر تحويل الصوت إلى نص",
      );
    } finally {
      setTranscribing(false);
    }
  }

  async function retryDiscovery() {
    if (discoveryLoading || !discoveryTurns.length) return;
    setDiscoveryInput("");
    discoveryInputRef.current = "";
    await requestDiscoveryQuestion(discoveryTurns);
  }

  async function finishDiscoveryAndContinue() {
    if (!learningReady || discoveryLoading || recording || transcribing) return;
    if (knowledgeApplied) {
      await next();
      return;
    }
    if (discoveryDone) {
      if (mockState === "loading") return;
      trainingStartedRef.current = true;
      await trainKnowledge();
      return;
    }
    const compiled = compileDiscoveryKnowledge(business, discoveryTurns);
    if (!compiled) return;
    setKnowledge(compiled);
    setDiscoveryDone(true);
    setDiscoveryQuestion("");
    setDiscoveryTopic(null);
    trainingStartedRef.current = true;
    await trainKnowledge(compiled);
  }

  async function submitDiscoveryAnswer(answerOverride?: string) {
    const answer = (answerOverride ?? discoveryInput).trim();
    if (!answer || discoveryLoading) return;
    if (answer.length > DISCOVERY_ANSWER_MAX_CHARS) {
      setDiscoveryInputError("إجابتك طويلة جدًا. قسّمها على رسالتين أو أكتر، وكلامك هيفضل موجود هنا لحد ما تعدّله.");
      return;
    }
    if (discoveryTurns.length >= DISCOVERY_MAX_TURNS) {
      setDiscoveryInputError("وصلنا للحد المتاح من الأسئلة. خلينا نجهز الموظف بالمعلومات اللي جمعناها.");
      return;
    }
    setDiscoveryInputError(null);

    const question = discoveryQuestion || initialDiscoveryQuestion(effectiveBusinessType);
    const nextTurns: DiscoveryTurn[] = [
      ...discoveryTurns,
      {
        question,
        answer,
        topic: discoveryTopic || undefined,
      },
    ];

    setDiscoveryTurns(nextTurns);
    setDiscoveryInput("");
    discoveryInputRef.current = "";
    await requestDiscoveryQuestion(nextTurns);
  }

  async function requestDiscoveryQuestion(nextTurns: DiscoveryTurn[]) {
    setDiscoveryLoading(true);
    setDiscoveryError(null);

    try {
      const response = await fetch("/api/onboarding/discovery/next", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          business: {
            name: business.name || "",
            type: effectiveBusinessType,
            branches: business.branches || "",
            hours: business.hours || "",
            link: business.link || "",
          },
          turns: nextTurns,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        done?: boolean;
        nextQuestion?: string | null;
        topic?: string | null;
        covered?: string[];
        missing?: string[];
        error?: string;
      };
      if (!response.ok) {
        if (response.status === 400 && /Too big|expected string|4000 characters/i.test(data.error ?? "")) {
          throw new Error("المعلومة أطول من الحد اللي بيسمح بيه السيرفر. حدّث الصفحة لو الإصلاح اتنشر، أو عدّل إجابتك وحاول تاني.");
        }
        throw new Error(data.error || "تعذر تجهيز السؤال التالي");
      }

      const covered = Array.isArray(data.covered) ? data.covered : [];
      const missing = Array.isArray(data.missing) ? data.missing : [];
      setDiscoveryCovered(covered);
      setDiscoveryMissing(missing);
      const pct = calcLearningPercent(covered, missing, nextTurns.length);

      if (data.done && pct >= LEARNING_MIN_PCT) {
        setDiscoveryDone(true);
        setDiscoveryQuestion("");
        setDiscoveryTopic(null);
        setKnowledge(compileDiscoveryKnowledge(business, nextTurns));
        return;
      }

      if (data.done && pct < LEARNING_MIN_PCT) {
        setDiscoveryQuestion(
          data.nextQuestion?.trim()
          || "لسه محتاج تفاصيل أكتر قبل ما نكمّل. كمّل معايا: إيه أهم حاجة العميل بيسأل عنها ولسه ما اتقالتش؟",
        );
        setDiscoveryTopic(data.topic ?? "faq");
        return;
      }

      if (!data.nextQuestion?.trim()) {
        throw new Error("مقدرناش نحدد السؤال التالي");
      }
      setDiscoveryQuestion(data.nextQuestion.trim());
      setDiscoveryTopic(data.topic ?? null);
    } catch (error) {
      setDiscoveryError(
        error instanceof Error ? error.message : "تعذر تجهيز السؤال التالي",
      );
    } finally {
      setDiscoveryLoading(false);
      if (voiceFlowState !== "idle" || voiceTargetRef.current === "discovery") {
        setVoiceFlowState("idle");
      }
    }
  }

  async function ensureWorkspace() {
    if (workspaceReady) return;

    const agentPayload = {
      name: "موظف الاستقبال",
      roleTitle: "موظف استقبال",
      language: "ar",
      dialect: "مصري",
      tone: "مهني وودود",
      instructions: "جاوب باختصار ووضوح وبناءً على معلومات النشاط فقط.",
    };

    const existingResponse = await fetch("/api/businesses", { cache: "no-store" });
    const existingData = await existingResponse.json().catch(() => ({}));
    const hasBusiness = existingResponse.ok
      && Array.isArray(existingData.businesses)
      && existingData.businesses.length > 0;

    if (!hasBusiness) {
      const summary = [
        `اسم البيزنس: ${business.name || "غير محدد"}`,
        `النشاط: ${effectiveBusinessType || "عام"}`,
        `الفروع: ${business.branches || "غير محدد"}`,
        `المواعيد: ${business.hours || "غير محددة"}`,
        business.link ? `الرابط: ${business.link}` : "",
      ].filter(Boolean).join("\n");

      const response = await fetch("/api/onboarding/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          business: {
            name: business.name || "نشاطي",
            category: effectiveBusinessType || "عام",
            countryCode: business.countryCode || "EG",
            locale:
              countryChoices.find((item) => item.code === business.countryCode)?.locale
              ?? "ar-EG",
            timezone:
              countryChoices.find((item) => item.code === business.countryCode)?.timezone
              ?? "Africa/Cairo",
          },
          location: null,
          agent: agentPayload,
          knowledgeItems: [{
            category: "ABOUT",
            title: "معلومات النشاط الأساسية",
            content: summary,
          }],
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error ?? data?.message ?? "تعذر إنشاء مساحة العمل");
      setWorkspaceReady(true);
      if (data?.agent?.agentId) setAgentId(data.agent.agentId);
      return;
    }

    // Repair partial onboarding (business without FREE subscription/agent).
    const repairResponse = await fetch("/api/onboarding/ensure-workspace", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agent: agentPayload }),
    });
    const repairData = await repairResponse.json().catch(() => ({}));
    if (!repairResponse.ok) {
      throw new Error(repairData?.error ?? repairData?.message ?? "تعذر تجهيز مساحة العمل");
    }
    setWorkspaceReady(true);
    if (repairData?.agent?.agentId) setAgentId(repairData.agent.agentId);
  }

  async function trainKnowledge(knowledgeOverride?: string) {
    const text = (knowledgeOverride ?? knowledge).trim();
    if (!text) return;
    setLiveError(null);
    setMockState("loading");
    try {
      await ensureWorkspace();
      const response = await fetch("/api/knowledge/ingest/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error ?? data?.message ?? "تعذر تحليل المعلومات");
      const proposalIds = (data.proposals ?? [])
        .filter((item: { status?: string }) => item.status !== "NOOP")
        .map((item: { proposalId: string }) => item.proposalId);
      if (proposalIds.length > 0) {
        const applyResponse = await fetch("/api/knowledge/ingest/apply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: data.session.sessionId, proposalIds }),
        });
        const applyData = await applyResponse.json();
        if (!applyResponse.ok) {
          throw new Error(applyData?.error ?? applyData?.message ?? "تعذر حفظ المعلومات");
        }
      }
      const summary = (data.proposals ?? []).reduce(
        (acc: Record<string, number>, item: { category?: string; status?: string }) => {
          if (item.status === "NOOP") return acc;
          const key = item.category || "CUSTOM";
          acc[key] = (acc[key] ?? 0) + 1;
          return acc;
        },
        {},
      );
      setKnowledgeSummary(summary);
      setKnowledgeTreeItems(
        (data.proposals ?? [])
          .filter((item: { action?: string; status?: string }) =>
            item.action !== "NOOP" && item.status !== "NOOP"
          )
          .map((item: {
            proposalId: string;
            action: "CREATE" | "MERGE" | "NOOP" | "CONFLICT" | "DELETE";
            category?: string;
            proposedTitle?: string;
            topicKey?: string | null;
            topicTitle?: string | null;
          }) => ({
            proposalId: item.proposalId,
            action: item.action,
            category: item.category || "CUSTOM",
            title: item.proposedTitle || "معلومة جديدة",
            topicKey: item.topicKey ?? null,
            topicTitle: item.topicTitle ?? null,
          })),
      );
      setKnowledgeCount(Math.max(proposalIds.length, data.proposals?.length ?? 0));
      setKnowledgeApplied(true);
      setPreviewReplies({});
      setPreviewReply("");
      setPreviewQuestion("");
      setPlaygroundTurns([]);
      setPlaygroundInput("");
      setTeachTurnIndex(null);
      setTeachDraft("");
      setTeachError(null);
      setChatCount(0);
      setMockState("success");
    } catch (error) {
      setLiveError(error instanceof Error ? error.message : "حدث خطأ أثناء التدريب");
      setMockState("error");
      trainingStartedRef.current = false;
    }
  }

  async function askPreview(question: string) {
    const trimmed = question.trim();
    if (!trimmed || previewLoading) return;
    setLiveError(null);
    setPreviewQuestion(trimmed);
    setPlaygroundInput("");

    const cached = previewReplies[trimmed];
    if (cached) {
      setPreviewReply(cached);
      setPlaygroundTurns((turns) => [...turns, { question: trimmed, answer: cached }]);
      setChatCount((value) => Math.min(3, value + 1));
      return;
    }

    if (previewPendingRef.current.size > 0) return;
    previewPendingRef.current.add(trimmed);
    setPreviewLoading(true);
    setPreviewReply("");
    try {
      await ensureWorkspace();
      const response = await fetch("/api/onboarding/preview-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error ?? data?.message ?? "تعذر تجربة الرد");
      const reply = String(data.reply ?? "").trim() || "مقدرناش نطلع الرد دلوقتي.";
      setPreviewReplies((current) => ({ ...current, [trimmed]: reply }));
      setPreviewReply(reply);
      setPlaygroundTurns((turns) => [...turns, { question: trimmed, answer: reply }]);
      setChatCount((value) => Math.min(3, value + 1));
    } catch (error) {
      const fail = "مقدرناش نطلع الرد دلوقتي.";
      setPreviewReply(fail);
      setLiveError(error instanceof Error ? error.message : "تعذر تجربة الرد");
    } finally {
      previewPendingRef.current.delete(trimmed);
      setPreviewLoading(false);
    }
  }

  function submitPlaygroundInput() {
    void askPreview(playgroundInput);
  }

  function ratePlaygroundTurn(index: number, rating: "up" | "down") {
    setPlaygroundTurns((turns) =>
      turns.map((turn, i) => (i === index ? { ...turn, rating } : turn)),
    );
    if (rating === "down") {
      setTeachTurnIndex(index);
      setTeachDraft("");
      setTeachError(null);
    } else if (teachTurnIndex === index) {
      setTeachTurnIndex(null);
      setTeachDraft("");
      setTeachError(null);
    }
  }

  function openTeachTurn(index: number) {
    setTeachTurnIndex(index);
    setTeachDraft(playgroundTurns[index]?.teachNote ?? "");
    setTeachError(null);
    setPlaygroundTurns((turns) =>
      turns.map((turn, i) => (i === index ? { ...turn, rating: turn.rating ?? "down" } : turn)),
    );
  }

  async function submitTeachNote(index: number) {
    const turn = playgroundTurns[index];
    const note = teachDraft.trim();
    if (!turn || !note || teachSaving) return;
    setTeachSaving(true);
    setTeachError(null);
    setLiveError(null);
    try {
      await ensureWorkspace();
      const text = [
        "تصحيح أثناء تجربة الردود:",
        `سؤال العميل: ${turn.question}`,
        `رد الموظف السابق: ${turn.answer}`,
        `المعلومة الصحيحة / الناقصة من المالك: ${note}`,
      ].join("\n");
      const analyzeResponse = await fetch("/api/knowledge/ingest/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const analyzeData = await analyzeResponse.json().catch(() => ({}));
      if (!analyzeResponse.ok) {
        throw new Error(analyzeData?.error ?? analyzeData?.message ?? "تعذر حفظ المعلومة");
      }
      const proposalIds = (analyzeData.proposals ?? [])
        .filter((item: { status?: string }) => item.status !== "NOOP")
        .map((item: { proposalId: string }) => item.proposalId);
      if (proposalIds.length > 0) {
        const applyResponse = await fetch("/api/knowledge/ingest/apply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: analyzeData.session.sessionId,
            proposalIds,
          }),
        });
        const applyData = await applyResponse.json().catch(() => ({}));
        if (!applyResponse.ok) {
          throw new Error(applyData?.error ?? applyData?.message ?? "تعذر اعتماد المعلومة");
        }
      }
      setPlaygroundTurns((turns) =>
        turns.map((item, i) => (i === index ? { ...item, teachNote: note, rating: "down" } : item)),
      );
      // Invalidate cached replies so the next ask uses the new knowledge.
      setPreviewReplies({});
      setTeachTurnIndex(null);
      setTeachDraft("");
    } catch (error) {
      setTeachError(error instanceof Error ? error.message : "تعذر حفظ المعلومة");
    } finally {
      setTeachSaving(false);
    }
  }

  async function startWhatsApp() {
    setLiveError(null);
    setMockState("loading");
    setQrImageDataUrl(null);
    setWaReady(false);
    try {
      await ensureWorkspace();
      setWorkspaceReady(true);
      const connectResponse = await fetch("/api/channels/whatsapp/connect", { method: "POST" });
      const connectData = await connectResponse.json().catch(() => ({}));
      if (!connectResponse.ok) {
        throw new Error(connectData?.error ?? connectData?.message ?? "تعذر بدء الربط");
      }
      if (connectData.uiState === "RUNTIME_DISABLED") {
        throw new Error(
          "خدمة واتساب مش شغّالة. لازم الـ WhatsApp runtime يكون شغال وDRVOWA_RUNTIME_TOKEN يكون متظبط في .env.local",
        );
      }
      if (connectData.uiState === "READY") {
        setWaReady(true);
        setMockState("success");
        return;
      }

      // QR often appears a moment after the runtime starts — retry briefly.
      let lastMessage: string | null = typeof connectData.message === "string" ? connectData.message : null;
      for (let attempt = 0; attempt < 12; attempt++) {
        const qrResponse = await fetch("/api/channels/whatsapp/qr", { cache: "no-store" });
        const qrData = await qrResponse.json().catch(() => ({}));
        if (!qrResponse.ok) {
          throw new Error(qrData?.error ?? qrData?.message ?? "تعذر تحميل QR");
        }
        if (qrData.uiState === "RUNTIME_DISABLED") {
          throw new Error(
            "خدمة واتساب مش شغّالة. لازم الـ WhatsApp runtime يكون شغال وDRVOWA_RUNTIME_TOKEN يكون متظبط في .env.local",
          );
        }
        if (qrData.uiState === "READY") {
          setWaReady(true);
          setMockState("success");
          return;
        }
        if (typeof qrData.qrImageDataUrl === "string" && qrData.qrImageDataUrl) {
          setQrImageDataUrl(qrData.qrImageDataUrl);
          setMockState("default");
          return;
        }
        if (typeof qrData.message === "string" && qrData.message) lastMessage = qrData.message;
        await new Promise((resolve) => window.setTimeout(resolve, 700));
      }
      throw new Error(
        lastMessage
          ? `الـ QR مش جاهز: ${lastMessage}`
          : "الـ QR لسه مش جاهز. تأكد إن خدمة واتساب شغّالة وحاول تاني.",
      );
    } catch (error) {
      setLiveError(error instanceof Error ? error.message : "تعذر ربط واتساب");
      setMockState("error");
    }
  }

  async function enableAutoReply() {
    const response = await fetch("/api/channels/whatsapp/ai", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error ?? data?.message ?? "تعذر تجهيز الرد التلقائي");
    const selectedAgentId = agentId ?? data?.agents?.[0]?.agentId;
    if (!selectedAgentId) throw new Error("موظف الاستقبال غير موجود");
    setAgentId(selectedAgentId);
    if (data?.setting?.autoReplyEnabled && data.setting.agentId === selectedAgentId) return;
    const patchResponse = await fetch("/api/channels/whatsapp/ai", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentId: selectedAgentId, autoReplyEnabled: true }),
    });
    const patchData = await patchResponse.json();
    if (!patchResponse.ok) {
      throw new Error(patchData?.error ?? patchData?.message ?? "تعذر تشغيل الرد التلقائي");
    }
  }

  /* eslint-disable react-hooks/exhaustive-deps, react-hooks/set-state-in-effect -- guarded one-shot async transition */
  useEffect(() => {
    if (step !== "KNOWLEDGE" || !draftRestored || !discoveryDone || !learningReady || !knowledge.trim() || knowledgeApplied || mockState === "error") return;
    if (trainingStartedRef.current) return;
    trainingStartedRef.current = true;
    void trainKnowledge();
    // learningReady is derived from discovery coverage; keep deps length stable across HMR.
  }, [step, draftRestored, discoveryDone, learningReady, knowledge, knowledgeApplied, mockState]);
  /* eslint-enable react-hooks/exhaustive-deps, react-hooks/set-state-in-effect */

  const primaryLabel = useMemo(() => {
    switch (step) {
      case "BUSINESS":
        return businessQuestion < businessQuestions.length - 1 ? "التالي" : "تمام — كمل";
      case "KNOWLEDGE":
        return mockState === "loading"
          ? "بنعلم الموظف..."
          : knowledgeApplied || mockState === "success"
            ? "جربه دلوقتي"
            : !discoveryDone
              ? "كمّل المحادثة"
              : "بجهز موظفك...";
      case "PLAYGROUND":
        return playgroundReady ? "الردود تمام — وصل واتساب" : "جرّب سؤال واحد على الأقل";
      case "WHATSAPP":
        return waReady
          ? "كمل لأول تجربة"
          : mockState === "loading"
            ? "بجهز الـ QR…"
            : mockState === "error"
              ? "حاول الربط تاني"
              : qrImageDataUrl
                ? "مستني المسح…"
                : "ابدأ الربط";
      case "FIRST_MESSAGE":
        return firstMessageStage >= 5 ? "كمل تجربة التحكم" : "مستني أول رد…";
      case "HUMAN_TAKEOVER":
        return "فهمت — كمّل";
      case "COMPLETED":
        return "افتح لوحة التحكم";
    }
  }, [
    step,
    businessQuestion,
    mockState,
    waReady,
    qrImageDataUrl,
    firstMessageStage,
    humanTakeoverDone,
    knowledgeApplied,
    discoveryDone,
    playgroundReady,
  ]);

  function sceneTransition(target: Step, afterTransition?: () => void) {
    if (sceneTimerRef.current !== null || transitioning) return;
    const commit = () => {
      afterTransition?.();
      setStep(target);
      setMockState("default");
      setTransitioning(false);
      sceneTimerRef.current = null;
    };
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      commit();
      return;
    }
    setTransitionMessage(STEP_SCENES[target].cue);
    setTransitioning(true);
    sceneTimerRef.current = window.setTimeout(commit, target === step ? 420 : 720);
  }

  async function next() {
    if (transitioning) return;
    if (step === "COMPLETED") {
      try {
        window.localStorage.removeItem(storageKey);
      } catch {
        // Ignore storage failures.
      }
      router.push(selectedPlan ? "/dashboard/billing" : "/dashboard");
      router.refresh();
      return;
    }
    if (step === "BUSINESS" && !businessCanContinue) return;
    if (step === "BUSINESS" && businessQuestion < businessQuestions.length - 1) {
      sceneTransition("BUSINESS", () => setBusinessQuestion((value) => value + 1));
      return;
    }
    if (step === "KNOWLEDGE" && !knowledgeApplied && mockState !== "success") {
      if (!discoveryDone || !learningReady) return;
      if (!knowledge.trim()) return;
      await trainKnowledge();
      return;
    }
    if (step === "KNOWLEDGE" && mockState === "loading") return;
    if (step === "KNOWLEDGE" && knowledgeApplied && !learningReady) return;
    if (step === "PLAYGROUND" && !playgroundReady) return;
    if (step === "WHATSAPP" && !waReady) {
      if (!qrImageDataUrl) await startWhatsApp();
      return;
    }
    if (step === "WHATSAPP" && waReady) {
      try {
        await enableAutoReply();
        firstMessageStartedAt.current = null;
      } catch (error) {
        setLiveError(error instanceof Error ? error.message : "تعذر تشغيل الرد التلقائي");
        return;
      }
    }
    if (step === "FIRST_MESSAGE" && firstMessageStage < 5) return;

    const nextStep = FLOW[Math.min(index + 1, FLOW.length - 1)]?.key;
    if (nextStep) {
      sceneTransition(nextStep);
    }
  }

  function previous() {
    if (transitioning) return;
    if (step === "BUSINESS" && businessQuestion > 0) {
      sceneTransition("BUSINESS", () => setBusinessQuestion((value) => value - 1));
      return;
    }
    const previousStep = FLOW[Math.max(index - 1, 0)]?.key;
    if (previousStep) sceneTransition(previousStep);
  }

  function jump(target: Step) {
    if (target !== step) sceneTransition(target);
  }

  return (
    <main dir="rtl" className="drvo-onboarding relative isolate h-[100dvh] min-h-0 w-full overflow-hidden bg-background text-foreground">
      <div aria-hidden="true" className="drvo-onboarding-atmosphere pointer-events-none absolute inset-0 overflow-hidden">
        <span className="drvo-onboarding-fog drvo-onboarding-fog-one" />
        <span className="drvo-onboarding-fog drvo-onboarding-fog-two" />
        <span className="drvo-onboarding-fog drvo-onboarding-fog-three" />
      </div>
      <div className={cx(
        "relative z-10 mx-auto flex h-full min-h-0 w-full flex-col",
        isChatStep
          ? "max-w-none gap-0 px-0 pb-[max(8px,env(safe-area-inset-bottom))] pt-0"
          : "max-w-6xl gap-3 px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 sm:gap-4 sm:px-6 sm:py-5",
      )}>
        {step === "KNOWLEDGE" ? (
          <header className="drvo-ob-chat-topbar shrink-0 border-b border-border/40 px-4 py-3 sm:px-6 sm:py-4">
            <div className="mx-auto flex w-full max-w-6xl items-start justify-between gap-3">
              <div className="min-w-0 flex-1 text-start">
                <div data-tech="true" className="drvo-ob-neon-text text-[10px] font-semibold tracking-[0.18em] uppercase">DRVO / تدريب</div>
                <h1 className="mt-1 text-xl font-black tracking-[-0.03em] sm:text-2xl">شات التدريب</h1>
                <p className="mt-1 text-xs text-muted-foreground sm:text-sm">احكي عن بيزنسك — كتابة أو فويس</p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5 pt-0.5 sm:gap-2">
                <OnboardingChatBrand />
                <ThemeToggle />
                {learningReady ? (
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => void finishDiscoveryAndContinue()}
                    disabled={discoveryLoading || recording || transcribing || mockState === "loading"}
                    className="rounded-full px-4 font-bold"
                  >
                    التالي
                  </Button>
                ) : null}
                <button
                  type="button"
                  onClick={previous}
                  className="rounded-full border border-border/70 bg-surface/70 px-3 py-1.5 text-xs font-semibold text-muted-foreground transition hover:border-primary/50 hover:text-foreground"
                  aria-label="الرجوع"
                >
                  رجوع
                </button>
                <OnboardingLogoutButton />
              </div>
            </div>
            <div className="mx-auto mt-3 w-full max-w-6xl" aria-label="مستوى تعلم الموظف">
              <div className="mb-1.5 flex items-center justify-between gap-3 text-xs font-semibold">
                <span className="text-muted-foreground">مستوى التعلم</span>
                <span className={cx(
                  "tabular-nums",
                  learningLevel === "high" && "text-emerald-400",
                  learningLevel === "mid" && "text-amber-400",
                  learningLevel === "low" && "text-rose-400",
                )}>
                  {learningPercent}%
                  <span className="ms-1.5 font-medium text-muted-foreground">/ حد أدنى {LEARNING_MIN_PCT}%</span>
                </span>
              </div>
              <div className="drvo-ob-learn-track h-2.5 overflow-hidden rounded-full">
                <div
                  className={cx("drvo-ob-learn-fill h-full rounded-full transition-[width,background] duration-500 ease-out", `is-${learningLevel}`)}
                  style={{ width: `${Math.max(learningPercent, 3)}%` }}
                />
              </div>
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                {learningReady
                  ? "ممتاز — التعلم وصل للحد الأدنى. اضغط «التالي» لما تكون جاهز تكمّل."
                  : "كمّل الأسئلة لحد ما الشريط يوصل للأخضر. مش هنقدر ندخل المرحلة اللي بعدها قبل كده."}
              </p>
            </div>
          </header>
        ) : null}

        {step === "PLAYGROUND" ? (
          <header className="drvo-ob-chat-topbar shrink-0 border-b border-border/40 px-4 py-2.5 sm:px-6">
            <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3">
              <div className="min-w-0 flex-1 text-start">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <div data-tech="true" className="drvo-ob-neon-text text-[10px] font-semibold tracking-[0.18em] uppercase">DRVO / تجربة</div>
                  <span className={cx(
                    "rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums",
                    playgroundReady ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300",
                  )}>
                    {playgroundTurns.length}/{PLAYGROUND_MIN_TRIES} مجرَّب
                  </span>
                </div>
                <h1 className="mt-0.5 truncate text-lg font-black tracking-[-0.03em] sm:text-xl">كلمه زي العميل</h1>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={previous}
                  className="rounded-full border border-border/70 bg-surface/70 px-3 py-1.5 text-xs font-semibold text-muted-foreground transition hover:border-primary/50 hover:text-foreground"
                  aria-label="الرجوع"
                >
                  رجوع
                </button>
                <ThemeToggle />
                <OnboardingLogoutButton />
                {playgroundReady ? (
                  <Button type="button" size="sm" onClick={() => void next()} className="rounded-full px-4 font-bold shadow-[0_0_18px_var(--ob-neon-glow)]">
                    التالي ←
                  </Button>
                ) : null}
              </div>
            </div>
          </header>
        ) : null}

        {!isChatStep ? <header className="flex shrink-0 items-center justify-between gap-4">
          <div>
            <BrandLogo className="h-7 w-auto" priority />
            <div className="mt-1 text-[11px] font-medium text-muted-foreground">إعداد موظف الاستقبال</div>
          </div>
          <div className="flex items-center gap-2">
            <div data-tech="true" dir="ltr" className="drvo-ob-chip rounded-full px-3 py-1.5 text-xs font-semibold tabular-nums shadow-sm backdrop-blur">
              {Math.min(index + 1, FLOW.length)} / {FLOW.length}
            </div>
            <ThemeToggle />
            <OnboardingLogoutButton />
          </div>
        </header> : null}

        {!isChatStep ? <section aria-label="تقدم الإعداد" className="shrink-0">
          <div className="relative mx-auto max-w-4xl">
            <div className="absolute left-[6%] right-[6%] top-4 h-0.5 rounded-full bg-card/80 shadow-inner sm:top-5" />
            <div
              className="absolute right-[6%] top-4 h-0.5 rounded-full bg-primary transition-[width] duration-700 ease-out sm:top-5"
              style={{ width: `${progress * 0.88}%` }}
            />
            <div className="relative grid grid-cols-7 gap-1">
              {FLOW.map((item, itemIndex) => {
                const done = itemIndex < index;
                const active = itemIndex === index;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => {
                      if (itemIndex <= index) jump(item.key);
                    }}
                    disabled={itemIndex > index}
                    className={cx(
                      "group flex flex-col items-center gap-2",
                      itemIndex > index && "cursor-default",
                    )}
                    aria-current={active ? "step" : undefined}
                  >
                    <span
                      className={cx(
                        "grid h-8 w-8 place-items-center rounded-xl border-2 text-[11px] font-black shadow-sm transition-all duration-300 sm:h-10 sm:w-10 sm:rounded-2xl sm:text-sm",
                        done && "border-primary bg-primary text-white",
                        active && "scale-110 border-primary bg-card text-primary shadow-[0_10px_30px_rgba(0,117,154,.22)]",
                        !done && !active && "border-border bg-card/90 text-muted-foreground",
                      )}
                    >
                      {done ? "✓" : itemIndex + 1}
                    </span>
                    <span className={cx(
                      "hidden text-[10px] font-black transition md:block",
                      active ? "text-foreground" : done ? "text-primary" : "text-muted-foreground"
                    )}>{item.short}</span>
                  </button>
                );
              })}
            </div>
            <div className="mt-1 text-center text-[11px] font-black text-primary md:hidden">{FLOW[index]?.label}</div>
          </div>
        </section> : null}

        <section className={cx(
          "mx-auto flex min-h-0 w-full flex-1 flex-col",
          isChatStep ? "max-w-none" : "max-w-[920px]",
        )}>
          <div className={cx(
            "relative flex h-full min-h-0 flex-col overflow-hidden",
            isChatStep
              ? "drvo-ob-chat-shell rounded-none border-0"
              : "drvo-ob-glass rounded-[24px] sm:rounded-[32px]",
          )}>
            {!isChatStep ? <div aria-live="polite" className={cx(
              "shrink-0 border-b border-border/40 px-5 sm:px-9",
              isCompactStep ? "pb-2 pt-3 sm:pb-2.5 sm:pt-3.5" : "pb-3 pt-4 sm:pb-4 sm:pt-5",
            )}>
              <div data-tech="true" className="drvo-ob-neon-text flex items-center gap-2 text-[10px] font-semibold tracking-[0.18em] uppercase">
                <span className="h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_12px_var(--ob-neon-glow)]" />
                DRVO / {FLOW[index]?.short}
              </div>
              {isCompactStep ? null : (
                <p className="mt-1 text-xs font-medium leading-5 text-muted-foreground sm:text-sm">{STEP_SCENES[step].line}</p>
              )}
            </div> : null}
            <div key={`${step}-${businessQuestion}`} className={cx(
              "drvo-onboarding-step min-h-0 flex-1 overscroll-contain",
              isChatStep
                ? "overflow-hidden"
                : isCompactStep
                  ? "drvo-ob-step-noscroll overflow-y-auto px-5 py-2 sm:px-9 sm:py-3 md:px-12"
                  : "overflow-y-auto px-5 pb-5 pt-3 sm:px-9 sm:pb-7 sm:pt-5 md:px-12",
            )}>
              {step === "BUSINESS" ? (
                <div className="mx-auto flex min-h-full max-w-2xl flex-col justify-center">
                  <div className="mb-6 flex items-center justify-between gap-4 sm:mb-8">
                    <div>
                      <span className="text-xs font-black text-primary">تعريف البيزنس</span>
                      <h2 className="mt-2 text-3xl font-black tracking-[-0.035em]">{currentBusinessQuestion.label}</h2>
                    </div>
                    <div data-tech="true" className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary/10 text-lg font-semibold text-primary">
                      {String(businessQuestion + 1).padStart(2, "0")}
                    </div>
                  </div>
                  {currentBusinessQuestion.kind === "identity" ? (
                    <div className="space-y-5">
                      <div>
                        <label className="mb-2 block text-sm font-bold text-foreground">اسم البيزنس</label>
                        <Input
                          autoFocus
                          value={business.name ?? ""}
                          onChange={(event) => setBusiness((prev) => ({ ...prev, name: event.target.value }))}
                          placeholder={currentBusinessQuestion.placeholder}
                          className="h-14 rounded-2xl border-2 bg-card px-5 text-lg font-semibold shadow-sm focus:border-primary sm:h-16"
                        />
                      </div>
                      <div
                        ref={typeSectionRef}
                        className={cx(
                          "overflow-hidden transition-all duration-500 ease-out",
                          showBusinessTypePicker ? "max-h-[720px] translate-y-0 opacity-100" : "pointer-events-none max-h-0 -translate-y-2 opacity-0",
                        )}
                        aria-hidden={!showBusinessTypePicker}
                      >
                        <div className="border-t border-border/60 pt-5">
                          <div className="mb-3">
                            <p className="text-sm font-bold text-foreground">نشاطك إيه؟</p>
                            <p className="mt-1 text-xs text-muted-foreground">اختار أقرب وصف لشغلك.</p>
                          </div>
                          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                            {businessTypeChoices.map((choice) => {
                              const selected = business.type === choice;
                              return (
                                <button
                                  key={choice}
                                  type="button"
                                  tabIndex={showBusinessTypePicker ? 0 : -1}
                                  onClick={() => setBusiness((prev) => ({ ...prev, type: choice, ...(choice !== "أخرى" ? { customType: "" } : {}) }))}
                                  className={cx(
                                    "rounded-2xl border-2 p-4 text-start text-sm font-black transition-all duration-200 sm:p-5",
                                    selected
                                      ? "border-primary bg-primary/8 text-primary shadow-[0_10px_28px_rgba(0,117,154,.12)]"
                                      : "border-border bg-card hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md",
                                  )}
                                >
                                  <span className="mb-2 block text-2xl sm:mb-3">{choice === "صالون" ? "✂️" : choice === "عيادة" ? "🩺" : choice === "مطعم" ? "🍽️" : choice === "متجر" ? "🛍️" : choice === "خدمات" ? "🧩" : "✨"}</span>
                                  {choice}
                                </button>
                              );
                            })}
                          </div>
                          {business.type === "أخرى" ? (
                            <div className="mt-4">
                              <Input
                                value={business.customType ?? ""}
                                onChange={(event) => setBusiness((prev) => ({ ...prev, customType: event.target.value }))}
                                placeholder="اكتب نوع النشاط بالتحديد، مثال: أكاديمية تعليم، شركة عقارات..."
                                className="h-14 rounded-2xl border-2 bg-card px-4 text-base"
                                autoFocus
                              />
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <Input
                      autoFocus
                      value={business[currentBusinessQuestion.key] ?? ""}
                      onChange={(event) => setBusiness((prev) => ({ ...prev, [currentBusinessQuestion.key]: event.target.value }))}
                      placeholder={currentBusinessQuestion.placeholder}
                      className="h-16 rounded-2xl border-2 bg-card px-5 text-lg font-semibold shadow-sm focus:border-primary"
                    />
                  )}
                  <div className="mt-5 flex gap-2">
                    {businessQuestions.map((question, qIndex) => (
                      <span key={question.key} className={cx("h-1.5 flex-1 rounded-full transition", qIndex <= businessQuestion ? "bg-primary" : "bg-secondary")} />
                    ))}
                  </div>
                </div>
              ) : null}

              {step === "KNOWLEDGE" ? (
                <div className="flex h-full min-h-0 w-full flex-col">
                  <div
                    className="drvo-ob-chat-thread min-h-0 flex-1 overflow-y-auto overscroll-contain"
                    role="log"
                    aria-label="محادثة التدريب"
                    aria-live="polite"
                  >
                    <div className="drvo-ob-chat-col mx-auto flex flex-col gap-3 px-4 py-4 sm:gap-3.5 sm:px-6 sm:py-5 md:px-8">
                      <div className="drvo-ob-bubble-in drvo-ob-bubble self-start rounded-[20px] rounded-tr-md px-4 py-3 text-[15px] leading-7 sm:py-3.5 sm:leading-8">
                        أهلاً بيك 👋 أنا DRVOWA. احكيلي عن شغلك براحتك، كتابة أو فويس، وأنا هسأل بس عن التفاصيل اللي ناقصاني.
                      </div>
                      {discoveryTurns.map((turn, i) => (
                        <div key={i} className="contents">
                          <div className="drvo-ob-bubble-in drvo-ob-bubble self-start whitespace-pre-wrap rounded-[20px] rounded-tr-md px-4 py-3 text-[15px] leading-7 sm:py-3.5 sm:leading-8">{turn.question}</div>
                          <div className="drvo-ob-bubble-out drvo-ob-bubble self-end whitespace-pre-wrap rounded-[20px] rounded-tl-md px-4 py-3 text-[15px] leading-7 sm:py-3.5 sm:leading-8">{turn.answer}</div>
                        </div>
                      ))}
                      {discoveryLoading ? (
                        <div
                          className="drvo-ob-bubble-in drvo-ob-typing self-start rounded-[20px] rounded-tr-md px-4 py-3"
                          role="status"
                          aria-label="بيكتب دلوقتي"
                        >
                          <span className="drvo-ob-typing-dot" />
                          <span className="drvo-ob-typing-dot" />
                          <span className="drvo-ob-typing-dot" />
                        </div>
                      ) : discoveryError ? (
                        <div className="drvo-ob-bubble-in drvo-ob-bubble self-start rounded-[20px] rounded-tr-md px-4 py-3 text-[15px] leading-7" role="alert">
                          <p className="text-destructive">إجابتك موجودة في مسودة التدريب، لكن مقدرتش أجهز السؤال التالي: {discoveryError}</p>
                          <div className="mt-2 flex flex-wrap gap-4">
                            <button type="button" onClick={() => void retryDiscovery()} className="font-bold text-primary underline underline-offset-4">حاول تاني</button>
                            <button type="button" onClick={() => {
                              const last = discoveryTurns.at(-1);
                              if (!last) return;
                              setDiscoveryTurns((turns) => turns.slice(0, -1));
                              setDiscoveryQuestion(last.question);
                              setDiscoveryTopic(last.topic ?? null);
                              setDiscoveryInput(last.answer);
                              discoveryInputRef.current = last.answer;
                              setDiscoveryError(null);
                              setDiscoveryInputError(null);
                            }} className="font-bold text-primary underline underline-offset-4">تعديل آخر إجابة</button>
                          </div>
                        </div>
                      ) : discoveryDone ? (
                        <div className="drvo-ob-bubble-in drvo-ob-bubble self-start rounded-[20px] rounded-tr-md px-4 py-3 text-[15px] leading-7 sm:leading-8">
                          {knowledgeApplied
                            ? learningReady
                              ? "تمام! ✨ دلوقتي فهمت بيزنسك وجاهز أجرب أرد على العملاء."
                              : "جمعنا معلومات كويسة، بس لسه محتاجين شوية تفاصيل قبل المرحلة الجاية."
                            : mockState === "error"
                              ? "أنا جمعت معلوماتك، لكن حصلت مشكلة في حفظها. جرّب تاني من غير ما تعيد أي حاجة."
                              : "تمام ❤️ الصورة بقت واضحة. بجهّز موظفك دلوقتي…"}
                          {mockState === "error" && liveError ? <p className="mt-2 text-xs text-destructive" role="alert">{liveError}</p> : null}
                        </div>
                      ) : (
                        <div className="drvo-ob-bubble-in drvo-ob-bubble self-start whitespace-pre-wrap rounded-[20px] rounded-tr-md px-4 py-3 text-[15px] leading-7 sm:leading-8">{discoveryQuestion || initialDiscoveryQuestion(effectiveBusinessType)}</div>
                      )}
                      <div ref={discoveryChatEndRef} className="h-2 shrink-0" aria-hidden="true" />
                    </div>
                  </div>
                  <div className="shrink-0 border-t border-border/40 px-4 py-3 sm:px-6 sm:py-3.5">
                    <div className="drvo-ob-chat-col mx-auto">
                      {discoveryDone ? (
                        <div className="flex flex-col items-center justify-center gap-2">
                          {knowledgeApplied ? (
                            learningReady ? (
                              <Button type="button" onClick={() => void next()} className="h-12 w-full rounded-2xl text-base font-bold">جرّب موظفك دلوقتي ←</Button>
                            ) : (
                              <p className="text-center text-sm text-rose-300" role="status">
                                التعلم لسه تحت الحد الأدنى ({LEARNING_MIN_PCT}%). كمّل الشات لحد ما الشريط يبقى أخضر.
                              </p>
                            )
                          ) : mockState === "error" ? (
                            <Button type="button" onClick={() => { trainingStartedRef.current = true; void trainKnowledge(); }} className="h-12 w-full rounded-2xl text-base font-bold">إعادة المحاولة</Button>
                          ) : (
                            <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status"><span className="h-3 w-3 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />بجهز الموظف…</p>
                          )}
                        </div>
                      ) : (
                        <>
                          <div className="flex items-end gap-2.5">
                            <button
                              type="button"
                              aria-label={recording ? "إيقاف التسجيل وإرسال الرد" : "تسجيل رد صوتي"}
                              disabled={transcribing || discoveryLoading || Boolean(discoveryError)}
                              onClick={recording ? stopVoiceRecording : () => void startVoiceRecording("discovery")}
                              className={cx(
                                "grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-lg transition disabled:opacity-40",
                                recording ? "bg-destructive text-white" : "border border-border bg-primary/10 text-primary hover:border-primary/50",
                              )}
                            >{recording ? "■" : "🎙"}</button>
                            <Textarea
                              value={discoveryInput}
                              onChange={(event) => { setDiscoveryInput(event.target.value); discoveryInputRef.current = event.target.value; setDiscoveryInputError(null); }}
                              onKeyDown={(event) => {
                                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                                  event.preventDefault();
                                  if (discoveryInput.trim() && !discoveryLoading && !recording && !transcribing && !discoveryError) void submitDiscoveryAnswer();
                                }
                              }}
                              aria-label="اكتب رسالتك"
                              placeholder={recording ? "بسمعك دلوقتي…" : "اكتب أو سجّل ردك…"}
                              rows={1}
                              disabled={recording || discoveryLoading || transcribing || Boolean(discoveryError)}
                              className="min-h-12 max-h-32 flex-1 resize-none rounded-2xl border-2 px-4 py-3 text-[15px] leading-7"
                            />
                            <button
                              type="button"
                              aria-label="إرسال الرسالة"
                              disabled={!discoveryInput.trim() || discoveryLoading || recording || transcribing || Boolean(discoveryError)}
                              onClick={() => void submitDiscoveryAnswer()}
                              className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary text-lg text-primary-foreground transition hover:opacity-90 disabled:opacity-40"
                            >↑</button>
                          </div>
                          {discoveryInputError ? <p role="alert" className="mt-2 text-xs font-semibold text-destructive">{discoveryInputError}</p> : null}
                          {discoveryInput.length > DISCOVERY_ANSWER_MAX_CHARS * 0.85 ? (
                            <p className="mt-1 text-xs text-muted-foreground" role="status">{discoveryInput.length.toLocaleString("ar-EG")} / {DISCOVERY_ANSWER_MAX_CHARS.toLocaleString("ar-EG")} حرف</p>
                          ) : null}
                          {learningReady ? (
                            <Button
                              type="button"
                              onClick={() => void finishDiscoveryAndContinue()}
                              disabled={discoveryLoading || recording || transcribing || mockState === "loading"}
                              className="mt-3 h-12 w-full rounded-2xl text-base font-bold"
                            >
                              التالي — جهّز الموظف وكمّل ←
                            </Button>
                          ) : null}
                          {recording ? <p className="mt-2 text-xs font-semibold text-destructive" role="status">● بسجّل صوتك… اضغط على المايك لما تخلص.</p> : null}
                          {transcribing ? <p className="mt-2 text-xs text-primary" role="status">بنحوّل الرسالة الصوتية لنص…</p> : null}
                          {microphoneHelp ? <div className="mt-2"><MicrophonePermissionHelp state={microphoneHelp} /></div> : null}
                          {voiceError ? <p className="mt-2 text-xs text-destructive" role="alert">{voiceError}</p> : null}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ) : null}

              {step === "PLAYGROUND" ? (
                <div className="relative flex h-full min-h-0 w-full flex-col">
                  {playgroundIntro ? (
                    <div className="drvo-ob-role-switch absolute inset-0 z-20 flex flex-col items-center justify-center px-6 text-center" role="status" aria-live="polite">
                      <p data-tech="true" className="drvo-ob-neon-text text-[10px] font-semibold tracking-[0.2em] uppercase">Role switch</p>
                      <div className="drvo-ob-role-cards mt-5 flex items-center gap-3 sm:gap-5">
                        <div className="drvo-ob-role-card is-from rounded-2xl border border-border/70 bg-surface/80 px-4 py-3 sm:px-5 sm:py-4">
                          <div className="text-[11px] text-muted-foreground">قبل كده</div>
                          <div className="mt-1 text-sm font-black sm:text-base">مالك البيزنس</div>
                        </div>
                        <div className="drvo-ob-role-arrow text-primary" aria-hidden="true">⇄</div>
                        <div className="drvo-ob-role-card is-to rounded-2xl border border-primary/50 bg-primary/10 px-4 py-3 sm:px-5 sm:py-4">
                          <div className="text-[11px] text-primary">دلوقتي</div>
                          <div className="mt-1 text-sm font-black text-primary sm:text-base">العميل</div>
                        </div>
                      </div>
                      <h2 className="mt-6 max-w-md text-2xl font-black tracking-[-0.03em] sm:text-3xl">اتعامل كإنك عميل… واسأل البوت</h2>
                      <p className="mt-3 max-w-sm text-sm leading-7 text-muted-foreground">اكتب سؤالك تحت، والاقتراحات مجرد مساعدات سريعة.</p>
                      <button
                        type="button"
                        onClick={() => setPlaygroundIntro(false)}
                        className="mt-6 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground"
                      >
                        ابدأ التجربة
                      </button>
                    </div>
                  ) : null}

                  <div className="drvo-ob-chat-thread drvo-ob-chat-thread--dock min-h-0 flex-1 overflow-y-auto overscroll-contain">
                    <div className="drvo-ob-chat-col mx-auto flex w-full flex-col gap-3 px-4 py-4 sm:px-6 sm:py-5">
                      <div className="self-start rounded-2xl px-1 py-1 text-[13px] leading-6 text-muted-foreground">
                        اسأل عن أي حاجة تخص <span className="font-semibold text-foreground/85">{business.name || "البيزنس"}</span>
                      </div>
                      {playgroundTurns.map((turn, index) => (
                        <div key={`${turn.question}-${index}`} className="contents">
                          <div className="drvo-ob-bubble-out drvo-ob-bubble self-end whitespace-pre-wrap rounded-[20px] rounded-tl-md px-4 py-3 text-[15px] leading-7">
                            {turn.question}
                          </div>
                          <div className="flex w-full max-w-[min(92%,34rem)] flex-col gap-1.5 self-start">
                            <div className="drvo-ob-bubble-in drvo-ob-bubble whitespace-pre-wrap rounded-[20px] rounded-tr-md px-4 py-3 text-[15px] leading-7">
                              {turn.answer}
                            </div>
                            <div className="drvo-ob-feedback-row flex flex-wrap items-center gap-1 px-0.5">
                              <button
                                type="button"
                                onClick={() => ratePlaygroundTurn(index, "up")}
                                className={cx(
                                  "rounded-lg px-2 py-1 text-[11px] font-bold transition",
                                  turn.rating === "up"
                                    ? "bg-emerald-500/20 text-emerald-300"
                                    : "text-muted-foreground/80 hover:bg-surface hover:text-emerald-300",
                                )}
                              >
                                تمام
                              </button>
                              <button
                                type="button"
                                onClick={() => ratePlaygroundTurn(index, "down")}
                                className={cx(
                                  "rounded-lg px-2 py-1 text-[11px] font-bold transition",
                                  turn.rating === "down"
                                    ? "bg-amber-500/20 text-amber-300"
                                    : "text-muted-foreground/80 hover:bg-surface hover:text-amber-300",
                                )}
                              >
                                ضعيف
                              </button>
                              <button
                                type="button"
                                onClick={() => openTeachTurn(index)}
                                className="rounded-lg px-2 py-1 text-[11px] font-bold text-primary/90 hover:bg-primary/10 hover:text-primary"
                              >
                                علّمه
                              </button>
                              {turn.teachNote ? (
                                <span className="ms-auto text-[11px] font-semibold text-emerald-300">اتحفظ</span>
                              ) : null}
                            </div>
                            {teachTurnIndex === index ? (
                              <div className="space-y-2 rounded-2xl border border-border/60 bg-surface/60 p-3">
                                <p className="text-xs font-semibold text-muted-foreground">
                                  إيه المعلومة اللي المفروض يعرفها؟
                                </p>
                                <Textarea
                                  value={teachDraft}
                                  onChange={(event) => setTeachDraft(event.target.value)}
                                  rows={2}
                                  disabled={teachSaving}
                                  autoFocus
                                  placeholder="مثال: بنشتغل القاهرة والجيزة بس، ومفيش فروع في الإسكندرية."
                                  className="min-h-16 resize-none rounded-xl border-2 px-3 py-2 text-sm leading-6"
                                />
                                {teachError ? <p className="text-xs text-destructive" role="alert">{teachError}</p> : null}
                                <div className="flex gap-2">
                                  <Button
                                    type="button"
                                    size="sm"
                                    disabled={!teachDraft.trim() || teachSaving}
                                    onClick={() => void submitTeachNote(index)}
                                    className="rounded-full px-4 font-bold"
                                  >
                                    {teachSaving ? "بيحفظ…" : "علّم الموظف"}
                                  </Button>
                                  <button
                                    type="button"
                                    disabled={teachSaving}
                                    onClick={() => {
                                      setTeachTurnIndex(null);
                                      setTeachDraft("");
                                      setTeachError(null);
                                    }}
                                    className="rounded-full px-3 py-1.5 text-xs font-semibold text-muted-foreground"
                                  >
                                    إلغاء
                                  </button>
                                </div>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      ))}
                      {previewLoading ? (
                        <>
                          {previewQuestion
                            && playgroundTurns[playgroundTurns.length - 1]?.question !== previewQuestion ? (
                              <div className="drvo-ob-bubble-out drvo-ob-bubble self-end whitespace-pre-wrap rounded-[20px] rounded-tl-md px-4 py-3 text-[15px] leading-7">
                                {previewQuestion}
                              </div>
                            ) : null}
                          <div className="drvo-ob-bubble-in drvo-ob-typing self-start rounded-[20px] rounded-tr-md px-4 py-3" role="status" aria-label="بيكتب دلوقتي">
                            <span className="drvo-ob-typing-dot" />
                            <span className="drvo-ob-typing-dot" />
                            <span className="drvo-ob-typing-dot" />
                          </div>
                        </>
                      ) : null}
                      {liveError && step === "PLAYGROUND" ? (
                        <p className="text-xs text-destructive" role="alert">{liveError}</p>
                      ) : null}
                      <div ref={playgroundChatEndRef} className="h-1 shrink-0" aria-hidden="true" />
                    </div>
                  </div>

                  <div className="drvo-ob-composer shrink-0 border-t border-border/40 px-3 py-2 sm:px-5">
                    <div className="drvo-ob-chat-col mx-auto space-y-1.5">
                      <div className="drvo-ob-suggest-scroll flex gap-1.5 overflow-x-auto overscroll-x-contain">
                        {playgroundQuestions.map((item) => {
                          const tried = playgroundTurns.some((turn) => turn.question === item.question);
                          const active = previewQuestion === item.question && previewLoading;
                          return (
                            <button
                              key={item.question}
                              type="button"
                              disabled={previewLoading}
                              onClick={() => void askPreview(item.question)}
                              title={item.hint}
                              className={cx(
                                "shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-bold transition whitespace-nowrap",
                                active
                                  ? "border-primary bg-primary/20 text-primary"
                                  : tried
                                    ? "border-emerald-500/40 bg-emerald-500/12 text-emerald-200"
                                    : "border-border bg-surface text-foreground/90 hover:border-primary/55 hover:text-foreground",
                              )}
                            >
                              {tried ? "✓ " : ""}{item.question}
                            </button>
                          );
                        })}
                      </div>

                      <div className="flex items-center gap-2">
                        <input
                          value={playgroundInput}
                          onChange={(event) => setPlaygroundInput(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                              event.preventDefault();
                              if (playgroundInput.trim() && !previewLoading) submitPlaygroundInput();
                            }
                          }}
                          aria-label="اكتب سؤالك كعميل"
                          placeholder={previewLoading ? "بجهز الرد…" : "اكتب سؤالك كإنك عميل…"}
                          disabled={previewLoading}
                          className="h-10 flex-1 rounded-xl border border-border bg-surface px-3.5 text-[15px] outline-none transition focus:border-primary disabled:opacity-60"
                        />
                        <button
                          type="button"
                          aria-label="إرسال السؤال"
                          disabled={!playgroundInput.trim() || previewLoading}
                          onClick={submitPlaygroundInput}
                          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary text-base font-black text-primary-foreground transition hover:opacity-90 disabled:opacity-40"
                        >
                          ↑
                        </button>
                      </div>

                      {!playgroundReady ? (
                        <p className="text-center text-[10px] leading-4 text-muted-foreground">اسأل مرة واحدة عشان يتفتح «التالي»</p>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void next()}
                          className="mx-auto block text-[11px] font-bold text-primary underline-offset-4 hover:underline"
                        >
                          الردود تمام — كمّل لواتساب ←
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ) : null}

              {step === "WHATSAPP" ? (
                <div className="mx-auto flex min-h-full max-w-xl flex-col items-center justify-center text-center">
                  <h2 className="text-xl font-black tracking-[-0.035em] sm:text-2xl">وصّل موظفك بواتساب</h2>
                  <p className="mt-1 text-xs text-muted-foreground">افتح واتساب ← الأجهزة المرتبطة ← امسح الـ QR</p>
                  <div className="mx-auto mt-3 w-full max-w-[13.5rem] rounded-2xl border border-border bg-card p-2.5">
                    {waReady ? (
                      <div className="mx-auto grid aspect-square w-full place-items-center rounded-xl border border-success/30 bg-success-soft/40">
                        <div className="text-center">
                          <div className="text-2xl font-black text-success">✓</div>
                          <div className="mt-1 text-[11px] font-bold text-success">واتساب متصل</div>
                        </div>
                      </div>
                    ) : qrImageDataUrl ? (
                      <Image
                        src={qrImageDataUrl}
                        alt="QR لربط واتساب"
                        width={168}
                        height={168}
                        unoptimized
                        className="mx-auto aspect-square w-full rounded-xl border border-border bg-card p-1"
                      />
                    ) : (
                      <div className="mx-auto grid aspect-square w-full place-items-center rounded-xl border border-dashed border-border bg-surface">
                        <div className="text-center px-2">
                          {mockState === "loading" ? (
                            <>
                              <div className="mx-auto h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                              <div className="mt-2 text-[11px] font-bold text-muted-foreground">بجهز الـ QR…</div>
                            </>
                          ) : (
                            <>
                              <div className="text-lg text-muted-foreground">▦</div>
                              <div className="mt-1 text-[11px] font-bold text-muted-foreground">
                                {mockState === "error" ? "الربط فشل" : "اضغط ابدأ الربط"}
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                  {(waReady || mockState === "error" || mockState === "compatibility-warning" || mockState === "loading" || qrImageDataUrl || waRuntimeDisabled) ? (
                    <p className={cx(
                      "mx-auto mt-2.5 max-w-sm text-xs font-bold",
                      waReady
                        ? "text-success"
                        : mockState === "compatibility-warning" || waRuntimeDisabled
                          ? "text-warning"
                          : mockState === "error"
                            ? "text-destructive"
                            : "text-muted-foreground",
                    )}>
                      {waReady
                        ? "تم الربط — واتساب جاهز لأول تجربة ✓"
                        : mockState === "compatibility-warning"
                          ? "الاتصال تم، لكن محتاج تهيئة إضافية لتحسين استقبال الرسائل."
                          : mockState === "error"
                            ? "مفيش QR — خدمة واتساب مش جاهزة"
                            : mockState === "loading"
                              ? "بنطلب الـ QR من خدمة واتساب…"
                              : waRuntimeDisabled
                                ? "خدمة واتساب مش شغّالة على الجهاز ده — الـ QR مش هيظهر لحد ما الـ runtime يتظبط"
                                : "مستني مسح الـ QR من واتساب…"}
                    </p>
                  ) : null}
                  {liveError && mockState === "error" ? (
                    <p className="mx-auto mt-1 max-w-sm text-[11px] font-bold leading-5 text-destructive" role="alert">
                      {liveError}
                    </p>
                  ) : null}
                </div>
              ) : null}

              {step === "FIRST_MESSAGE" ? (
                <div className="mx-auto flex min-h-full max-w-md flex-col items-center justify-center text-center">
                  <h2 className="text-lg font-black tracking-[-0.035em] sm:text-xl">يلا نجربه بجد</h2>
                  <p className="mt-1 text-[11px] text-muted-foreground sm:text-xs">
                    {firstMessageStage >= 5
                      ? "الرد اتبعت — كمّل لتجربة التحكم"
                      : "من رقم واتساب تاني ابعت: السلام عليكم"}
                  </p>
                  <div className="mt-3 w-full overflow-hidden rounded-2xl border border-border/70 bg-surface/40 text-start">
                    {["مستني الرسالة", "وصلت الرسالة", "الموظف فهمها", "جهز الرد", "تم الرد"].map((label, i) => {
                      const active = firstMessageStage >= i + 1 || (i === 0 && firstMessageStage === 0);
                      return (
                        <div
                          key={label}
                          className={cx(
                            "flex items-center gap-2.5 px-3 py-2",
                            i > 0 && "border-t border-border/50",
                            active && "bg-success-soft/30",
                          )}
                        >
                          <span className={cx(
                            "grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-black",
                            active ? "bg-success text-white" : "bg-secondary text-muted-foreground",
                          )}>
                            {active ? "✓" : (i + 1)}
                          </span>
                          <span className={cx("text-[13px] font-bold", active ? "text-foreground" : "text-muted-foreground")}>{label}</span>
                        </div>
                      );
                    })}
                  </div>
                  {firstMessageStage >= 5 || mockState === "success" ? (
                    <p className="mt-2.5 text-xs font-bold text-success">أول رد حقيقي تم ✓</p>
                  ) : null}
                  {mockState === "error" ? (
                    <p className="mt-2.5 text-[11px] font-bold text-destructive">
                      الرسالة موصلتش لسه. ابعت من رقم مختلف وجرّب تاني.
                    </p>
                  ) : null}
                </div>
              ) : null}

              {step === "HUMAN_TAKEOVER" ? (
                <div className="mx-auto flex min-h-full max-w-md flex-col items-center justify-center text-center">
                  <h2 className="text-xl font-black tracking-[-0.035em] sm:text-2xl">لما العميل يطلب موظف… البوت بيسكت</h2>
                  <div className="mt-4 w-full overflow-hidden rounded-2xl border border-border/70 bg-surface/40 text-start">
                    {[
                      "العميل يطلب يتكلم مع موظف",
                      "البوت بيوقف الرد فورًا",
                      "بيبلّغك إنك تتدخل",
                      "لو انت ردّيت من واتساب — بيفضل ساكت",
                    ].map((label, i) => (
                      <div
                        key={label}
                        className={cx(
                          "flex items-center gap-2.5 px-3 py-2.5",
                          i > 0 && "border-t border-border/50",
                          humanTakeoverDone && "bg-success-soft/25",
                        )}
                      >
                        <span className={cx(
                          "grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-black",
                          humanTakeoverDone ? "bg-success text-white" : "bg-primary/15 text-primary",
                        )}>
                          {humanTakeoverDone ? "✓" : i + 1}
                        </span>
                        <span className="text-[13px] font-bold text-foreground">{label}</span>
                      </div>
                    ))}
                  </div>
                  {humanTakeoverDone ? (
                    <p className="mt-3 text-xs font-bold text-success">تم — المحادثة بقت ليك والبوت سكت ✓</p>
                  ) : null}
                </div>
              ) : null}

              {step === "COMPLETED" ? (
                <div className="mx-auto flex min-h-full max-w-md flex-col items-center justify-center text-center">
                  <div className="drvo-ob-done-hero grid h-14 w-14 place-items-center rounded-full bg-success text-2xl font-black text-white">✓</div>
                  <h2 className="mt-3 text-xl font-black tracking-[-0.035em] sm:text-2xl">موظف الاستقبال جاهز للعمل</h2>
                  <p className="mt-1 text-xs text-muted-foreground">اكتمل الإعداد بنجاح. يمكنك الآن فتح لوحة التحكم.</p>
                  <div className="mt-4 w-full overflow-hidden rounded-2xl border border-border/70 bg-surface/40 text-start">
                    {[
                      "تم تعريف نشاط العمل",
                      "تم تدريب الموظف على المعلومات",
                      "تم اختبار جودة الردود",
                      "تم ربط واتساب بنجاح",
                      "تم التحقق من أول رد حقيقي",
                      "التدخل البشري يوقف الرد التلقائي",
                    ].map((label, i) => (
                      <div
                        key={label}
                        className={cx(
                          "drvo-ob-done-row flex items-center gap-2.5 px-3 py-2",
                          i > 0 && "border-t border-border/50",
                        )}
                        style={{ animationDelay: `${180 + i * 220}ms` }}
                      >
                        <span className="drvo-ob-done-check grid h-6 w-6 shrink-0 place-items-center rounded-full bg-success text-[11px] font-black text-white">✓</span>
                        <span className="text-[13px] font-bold text-foreground">{label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            {!isChatStep ? <div className={cx(
              "flex shrink-0 items-center justify-between gap-3 border-t border-border/70 bg-transparent px-5 sm:px-9 md:px-12",
              isCompactStep ? "py-2.5 sm:py-3" : "py-3 sm:py-4",
            )}>
              <Button type="button" variant="ghost" disabled={(step === "BUSINESS" && businessQuestion === 0) || transitioning} onClick={previous}>السابق</Button>
              <Button
                type="button"
                onClick={next}
                disabled={
                  transitioning
                  || mockState === "loading"
                  || (step === "BUSINESS" && !businessCanContinue)
                  || (step === "WHATSAPP" && Boolean(qrImageDataUrl) && !waReady && mockState !== "error")
                  || (step === "FIRST_MESSAGE" && firstMessageStage < 5)
                }
                className="min-w-36 sm:min-w-44"
              >
                {primaryLabel}
              </Button>
            </div> : null}
            {transitioning ? (
              <div className="drvo-scene-transition absolute inset-0 z-30 flex flex-col items-center justify-center bg-card/95 px-6 text-center backdrop-blur-2xl" role="status" aria-live="polite">
                <div className="drvo-scene-orbit mb-6 grid h-20 w-20 place-items-center rounded-[28px] border border-primary/20 bg-primary/10 text-4xl text-primary">✦</div>
                <p className="text-xl font-black tracking-[-0.03em] sm:text-2xl">{transitionMessage}</p>
                <span className="mt-3 text-xs font-medium text-muted-foreground">خطوة جديدة في رحلة موظفك</span>
                <div className="drvo-scene-loading mt-7 h-1 w-36 overflow-hidden rounded-full bg-primary/10"><span className="block h-full w-1/2 rounded-full bg-primary" /></div>
              </div>
            ) : null}
          </div>
        </section>

        {process.env.NODE_ENV !== "production" && !isChatStep ? (
          <div className="pointer-events-none fixed bottom-3 left-1/2 z-50 hidden -translate-x-1/2 md:block">
            <div className="pointer-events-auto flex items-center gap-2 rounded-2xl border border-border/70 bg-card/90 p-2 shadow-lg backdrop-blur">
              <span className="px-2 text-[11px] font-bold text-muted-foreground">Preview state</span>
              {(["default", "loading", "success", "error", "compatibility-warning"] as MockState[]).map((state) => (
                <button
                  key={state}
                  type="button"
                  onClick={() => {
                    setMockState(state);
                    // WhatsApp success copy is gated on waReady — keep preview honest.
                    if (step === "WHATSAPP") setWaReady(state === "success");
                  }}
                  className={cx(
                    "rounded-xl px-2.5 py-1.5 text-[10px] font-bold transition",
                    mockState === state ? "bg-primary text-white" : "text-muted-foreground hover:bg-secondary",
                  )}
                >
                  {state}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {voiceFlowState !== "idle" && step !== "KNOWLEDGE" ? (
        <div
          className="voice-flow-overlay fixed inset-0 z-[80] flex items-center justify-center bg-ink/45 px-5 backdrop-blur-md"
          role="dialog"
          aria-modal="true"
          aria-label={voiceFlowState === "recording" ? "جاري تسجيل الإجابة" : "جاري تجهيز الإجابة"}
        >
          <div className="w-full max-w-md rounded-[32px] border border-white/60 bg-card/95 p-6 text-center shadow-[0_30px_100px_rgba(7,19,25,.30)] sm:p-8">
            {voiceFlowState === "recording" ? (
              <>
                <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-destructive/10">
                  <div className="grid h-14 w-14 place-items-center rounded-full bg-destructive text-2xl text-white shadow-[0_10px_35px_rgba(199,53,53,.28)]">
                    🎙️
                  </div>
                </div>
                <div className="mt-5 flex h-8 items-center justify-center gap-1.5" aria-hidden="true">
                  {[0, 1, 2, 3, 4, 5, 6].map((bar) => (
                    <span
                      key={bar}
                      className={cx(
                        "w-1.5 rounded-full bg-primary transition-opacity",
                        recordingPaused ? "h-2 opacity-35" : "voice-wave-bar",
                      )}
                      style={recordingPaused ? undefined : { animationDelay: `${bar * 90}ms` }}
                    />
                  ))}
                </div>
                <h3 className="mt-4 text-2xl font-black tracking-[-0.03em]">
                  {recordingPaused ? "التسجيل متوقف مؤقتًا" : "بسمعك… اتكلم براحتك"}
                </h3>
                <p className="mx-auto mt-3 max-w-sm text-sm leading-7 text-muted-foreground">
                  {recordingPaused
                    ? "خد وقتك، ولما تبقى جاهز اضغط «كمّل التسجيل» وهتكمل نفس الإجابة من مكان ما وقفت."
                    : "سجّل في مكان هادي، قرّب الموبايل منك، واتكلم بصوت واضح وطبيعي. اذكر كل التفاصيل والاستثناءات حتى لو شايفها بسيطة."}
                </p>
                <div className="mt-5 text-start">
                  <p className="mb-3 text-xs font-black text-primary">💡 ممكن تحكي عن الحاجات دي:</p>
                  <div className="flex flex-wrap gap-2">
                    {getVoicePrompts(discoveryTopic, effectiveBusinessType).map((prompt, promptIndex) => (
                      <span
                        key={prompt}
                        className="rounded-2xl border border-primary/15 bg-primary/5 px-3.5 py-2.5 text-xs font-bold leading-5 text-foreground shadow-sm"
                      >
                        <span className="ml-1.5 text-primary">{String(promptIndex + 1).padStart(2, "0")}</span>
                        {prompt}
                      </span>
                    ))}
                  </div>
                  <p className="mt-3 text-[11px] leading-5 text-muted-foreground">دي أفكار تساعدك بس؛ اتكلم بطريقتك ومش لازم تجاوب عليهم كلهم.</p>
                </div>
                <div className="mt-6 grid grid-cols-2 gap-2">
                  {typeof MediaRecorder !== "undefined"
                    && mediaRecorderRef.current
                    && typeof mediaRecorderRef.current.pause === "function"
                    && typeof mediaRecorderRef.current.resume === "function" ? (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={recordingPaused ? resumeVoiceRecording : pauseVoiceRecording}
                        className="h-12 rounded-2xl"
                      >
                        {recordingPaused ? "▶ كمّل التسجيل" : "Ⅱ وقف مؤقتًا"}
                      </Button>
                    ) : (
                      <div className="hidden" aria-hidden="true" />
                    )}
                  <Button
                    type="button"
                    variant="danger"
                    onClick={stopVoiceRecording}
                    className="h-12 rounded-2xl"
                  >
                    ■ خلصت الإجابة
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-primary/10">
                  <div className="voice-processing-ring h-12 w-12 rounded-full border-4 border-primary/20 border-t-primary" />
                </div>
                <h3 className="mt-5 text-2xl font-black tracking-[-0.03em]">
                  {voiceFlowState === "transcribing"
                    ? "بنحوّل كلامك لنص…"
                    : "تمام، بنثبت إجابتك…"}
                </h3>
                <p className="mx-auto mt-3 max-w-sm text-sm leading-7 text-muted-foreground">
                  {voiceFlowState === "transcribing"
                    ? "بنسمع التسجيل ونكتب كلامك بدقة. مش محتاج تعمل أي حاجة."
                    : "بنفهم التفاصيل، بنحفظ الإجابة، وبنجهزلك السؤال الأنسب اللي بعده."}
                </p>
                <div className="mt-6 space-y-2 text-start text-xs font-bold">
                  <div className="flex items-center gap-3 rounded-xl bg-success-soft/70 px-4 py-3 text-success">
                    <span>✓</span>
                    <span>التسجيل وصل</span>
                  </div>
                  <div className={cx(
                    "flex items-center gap-3 rounded-xl px-4 py-3",
                    voiceFlowState === "saving"
                      ? "bg-success-soft/70 text-success"
                      : "bg-primary/5 text-primary",
                  )}>
                    <span>{voiceFlowState === "saving" ? "✓" : "…"}</span>
                    <span>تحويل الصوت إلى نص</span>
                  </div>
                  <div className="flex items-center gap-3 rounded-xl bg-primary/5 px-4 py-3 text-primary">
                    <span>…</span>
                    <span>{voiceFlowState === "saving" ? "تثبيت الإجابة وتجهيز السؤال التالي" : "هنثبت الإجابة بعدها تلقائيًا"}</span>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}

      <style jsx global>{`
        @keyframes drvoChatPulse {
          0%, 70%, 100% { opacity: .3; transform: translateY(0); }
          35% { opacity: 1; transform: translateY(-4px); }
        }
        .drvo-chat-dot { animation: drvoChatPulse 1s ease-in-out infinite; }
        @keyframes drvoSceneEnter {
          from { opacity: 0; transform: translateY(16px) scale(.985); filter: blur(5px); }
          to { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
        }
        @keyframes drvoFogDrift {
          0%, 100% { transform: translate3d(-4%, 2%, 0) rotate(-9deg) scale(1); opacity: .65; }
          50% { transform: translate3d(8%, -4%, 0) rotate(8deg) scale(1.16); opacity: 1; }
        }
        @keyframes drvoSceneOrbit {
          0%, 100% { transform: rotate(-8deg) scale(.94); box-shadow: 0 0 20px rgb(0 117 154 / .08); }
          50% { transform: rotate(12deg) scale(1.06); box-shadow: 0 0 60px rgb(0 117 154 / .24); }
        }
        @keyframes drvoSceneLoading {
          from { transform: translateX(110%); }
          to { transform: translateX(-220%); }
        }
        .drvo-onboarding { background: var(--atmosphere); }
        .drvo-onboarding-fog {
          position: absolute; display: block; width: 60vw; height: 60vw; border-radius: 9999px;
          background: radial-gradient(ellipse, rgb(0 150 198 / .19) 0%, rgb(0 117 154 / .09) 35%, transparent 72%);
          filter: blur(50px); animation: drvoFogDrift 18s ease-in-out infinite; will-change: transform;
        }
        .drvo-onboarding-fog-one { top: -35%; right: -17%; }
        .drvo-onboarding-fog-two { bottom: -55%; left: -16%; animation-delay: -8s; animation-duration: 23s; }
        .drvo-onboarding-fog-three { width: 40vw; height: 40vw; top: 25%; left: 26%; opacity: .4; animation-delay: -13s; animation-duration: 29s; }
        .drvo-onboarding-step { animation: drvoSceneEnter .55s cubic-bezier(.2,.7,.2,1) both; scrollbar-width: thin; scrollbar-color: var(--border) transparent; }
        .drvo-scene-transition { animation: drvoSceneEnter .25s ease-out both; }
        .drvo-scene-orbit { animation: drvoSceneOrbit 1.4s ease-in-out infinite; }
        .drvo-scene-loading > span { animation: drvoSceneLoading .8s ease-in-out infinite; }
        @media (max-height: 790px), (max-width: 640px) {
          .drvo-onboarding-step .drvo-welcome-icon { width: 64px; height: 64px; font-size: 30px; margin-bottom: 12px; border-radius: 22px; }
          .drvo-onboarding-step .drvo-welcome-title { font-size: clamp(1.4rem, 4vw, 2.15rem); }
          .drvo-onboarding-step .drvo-welcome-copy { margin-top: 8px; font-size: .85rem; line-height: 1.65; }
          .drvo-onboarding-step .drvo-welcome-grid { margin-top: 16px; gap: 8px; }
          .drvo-onboarding-step .drvo-welcome-grid > div { padding: 10px 6px; }
          .drvo-onboarding-step .drvo-welcome-footer { margin-top: 12px; }
          .drvo-onboarding-fog { filter: blur(30px); width: 95vw; height: 95vw; }
        }
        @media (prefers-reduced-motion: reduce) {
          .drvo-onboarding-fog, .drvo-onboarding-step, .drvo-scene-transition, .drvo-scene-orbit, .drvo-scene-loading > span { animation: none !important; }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px) scale(.995); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes voiceWave {
          0%, 100% { height: 8px; opacity: .45; }
          50% { height: 30px; opacity: 1; }
        }
        @keyframes voiceSpin {
          to { transform: rotate(360deg); }
        }
        .voice-wave-bar {
          height: 8px;
          animation: voiceWave .85s ease-in-out infinite;
        }
        .voice-processing-ring {
          animation: voiceSpin .85s linear infinite;
        }
      `}</style>

    </main>
  );
}
