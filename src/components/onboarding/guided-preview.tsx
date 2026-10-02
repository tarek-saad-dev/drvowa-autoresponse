"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

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

type KnowledgeMode = "guided" | "freeform";

type DiscoveryTurn = {
  question: string;
  answer: string;
  topic?: string;
};

const discoveryLabels: Record<string, string> = {
  offerings: "الخدمات / المنتجات",
  pricing: "الأسعار",
  customer_journey: "رحلة العميل",
  availability: "المواعيد والتوفر",
  booking_ordering: "الحجز / الطلب",
  payments: "الدفع",
  fulfillment: "التنفيذ / التوصيل",
  policies: "السياسات",
  promotions: "العروض",
  exceptions: "الحالات الخاصة",
  human_escalation: "التدخل البشري",
  faq: "الأسئلة المتكررة",
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
  { key: "countryCode", label: "البيزنس موجود فين؟", placeholder: "", kind: "country" },
  { key: "branches", label: "عندك كام فرع؟", placeholder: "", kind: "branches" },
  { key: "hours", label: "مواعيد العمل إيه؟", placeholder: "مثال: يوميًا من 11 ص إلى 2 ص", kind: "text" },
  { key: "link", label: "عندك موقع أو Instagram؟", placeholder: "اختياري", kind: "text" },
] as const;

const businessTypeChoices = ["صالون", "عيادة", "مطعم", "متجر", "خدمات", "أخرى"];
const countryChoices = [
  { code: "EG", label: "مصر", locale: "ar-EG", timezone: "Africa/Cairo" },
  { code: "SA", label: "السعودية", locale: "ar-SA", timezone: "Asia/Riyadh" },
  { code: "AE", label: "الإمارات", locale: "ar-AE", timezone: "Asia/Dubai" },
  { code: "KW", label: "الكويت", locale: "ar-KW", timezone: "Asia/Kuwait" },
] as const;
const branchChoices = ["فرع واحد", "فرعين", "3 فروع", "4+", "لسه ببدأ"];

const knowledgeChips = ["الخدمات", "الأسعار", "المواعيد", "الفروع", "السياسات", "العروض"];

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function GuidedOnboardingPreview({
  storageKey = "drvowa_guided_onboarding_draft_v1_preview",
}: {
  storageKey?: string;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("WELCOME");
  const [mockState, setMockState] = useState<MockState>("default");
  const [businessQuestion, setBusinessQuestion] = useState(0);
  const [business, setBusiness] = useState<Record<string, string>>({});
  const [knowledge, setKnowledge] = useState("");
  const [chatCount, setChatCount] = useState(0);
  const [workspaceReady, setWorkspaceReady] = useState(false);
  const [agentId, setAgentId] = useState<string | null>(null);
  const [knowledgeCount, setKnowledgeCount] = useState(0);
  const [knowledgeSummary, setKnowledgeSummary] = useState<Record<string, number>>({});
  const [knowledgeApplied, setKnowledgeApplied] = useState(false);
  const [previewQuestion, setPreviewQuestion] = useState("مواعيدكم إيه؟");
  const [previewReply, setPreviewReply] = useState("لسه مجربناش الرد الحقيقي.");
  const [qrImageDataUrl, setQrImageDataUrl] = useState<string | null>(null);
  const [waReady, setWaReady] = useState(false);
  const [firstMessageStage, setFirstMessageStage] = useState(0);
  const [testConversationId, setTestConversationId] = useState<string | null>(null);
  const [humanTakeoverDone, setHumanTakeoverDone] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [draftRestored, setDraftRestored] = useState(false);
  const firstMessageStartedAt = useRef<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const [recording, setRecording] = useState(false);
  const [recordingPaused, setRecordingPaused] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
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
  const voiceTargetRef = useRef<"knowledge" | "discovery">("knowledge");
  const discoveryInputRef = useRef("");
  const [voiceFlowState, setVoiceFlowState] = useState<
    "idle" | "recording" | "transcribing" | "saving"
  >("idle");

  const index = FLOW.findIndex((item) => item.key === step);
  const progress = Math.max(0, Math.round((index / (FLOW.length - 1)) * 100));

  const currentBusinessQuestion = businessQuestions[businessQuestion];
  const currentBusinessValue = business[currentBusinessQuestion.key]?.trim() ?? "";
  const effectiveBusinessType =
    business.type === "أخرى"
      ? business.customType?.trim() || "نشاط آخر"
      : business.type?.trim() || "";
  const businessCanContinue =
    currentBusinessQuestion.key === "link"
    || (currentBusinessQuestion.key === "type"
      ? business.type === "أخرى"
        ? Boolean(business.customType?.trim())
        : currentBusinessValue.length > 0
      : currentBusinessValue.length > 0);

  /* eslint-disable react-hooks/set-state-in-effect -- guided onboarding restores and polls external state */
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        const saved = JSON.parse(raw) as {
          step?: Step;
          businessQuestion?: number;
          business?: Record<string, string>;
          knowledge?: string;
          knowledgeApplied?: boolean;
          knowledgeCount?: number;
          knowledgeSummary?: Record<string, number>;
          knowledgeMode?: KnowledgeMode;
          discoveryTurns?: DiscoveryTurn[];
          discoveryQuestion?: string;
          discoveryTopic?: string | null;
          discoveryInput?: string;
          discoveryCovered?: string[];
          discoveryMissing?: string[];
          discoveryDone?: boolean;
        };
        if (saved.step && FLOW.some((item) => item.key === saved.step)) {
          setStep(saved.step);
        }
        if (typeof saved.businessQuestion === "number") {
          setBusinessQuestion(
            Math.min(Math.max(0, saved.businessQuestion), businessQuestions.length - 1),
          );
        }
        if (saved.business && typeof saved.business === "object") {
          setBusiness(saved.business);
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
        if (saved.knowledgeMode === "guided" || saved.knowledgeMode === "freeform") {
          setKnowledgeMode(saved.knowledgeMode);
        }
        if (Array.isArray(saved.discoveryTurns)) setDiscoveryTurns(saved.discoveryTurns);
        if (typeof saved.discoveryQuestion === "string") setDiscoveryQuestion(saved.discoveryQuestion);
        if (typeof saved.discoveryTopic === "string" || saved.discoveryTopic === null) setDiscoveryTopic(saved.discoveryTopic ?? null);
        if (typeof saved.discoveryInput === "string") setDiscoveryInput(saved.discoveryInput);
        if (Array.isArray(saved.discoveryCovered)) setDiscoveryCovered(saved.discoveryCovered);
        if (Array.isArray(saved.discoveryMissing)) setDiscoveryMissing(saved.discoveryMissing);
        if (saved.discoveryDone === true) setDiscoveryDone(true);
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
          knowledgeMode,
          discoveryTurns,
          discoveryQuestion,
          discoveryTopic,
          discoveryInput,
          discoveryCovered,
          discoveryMissing,
          discoveryDone,
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
    knowledgeMode,
    discoveryTurns,
    discoveryQuestion,
    discoveryTopic,
    discoveryInput,
    discoveryCovered,
    discoveryMissing,
    discoveryDone,
    storageKey,
    draftRestored,
  ]);

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
        if (!qrImageDataUrl) {
          const qrResponse = await fetch("/api/channels/whatsapp/qr", { cache: "no-store" });
          const qrData = await qrResponse.json().catch(() => ({}));
          if (qrResponse.ok && qrData.qrImageDataUrl) {
            setQrImageDataUrl(qrData.qrImageDataUrl);
          }
        }
        if (data.compatibility?.status === "DEGRADED_CRYPTO") {
          setMockState("compatibility-warning");
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
      firstMessageStartedAt.current = new Date().toISOString();
      setFirstMessageStage(0);
    }
    let stopped = false;
    const tick = async () => {
      try {
        const response = await fetch("/api/inbox/conversations?limit=10", { cache: "no-store" });
        const data = await response.json();
        if (stopped || !response.ok || !Array.isArray(data.conversations)) return;
        const started = new Date(firstMessageStartedAt.current!).getTime();
        const conversation = data.conversations.find((item: {
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
  }, [step, workspaceReady]);

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
    voiceTargetRef.current = target;
    if (target === "discovery") setVoiceFlowState("recording");

    if (
      typeof window === "undefined"
      || !navigator.mediaDevices?.getUserMedia
      || typeof MediaRecorder === "undefined"
    ) {
      setVoiceError("التسجيل الصوتي غير مدعوم على المتصفح ده. تقدر تكتب المعلومات بدلًا منه.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
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
        stream.getTracks().forEach((track) => track.stop());
        mediaRecorderRef.current = null;
        setRecordingPaused(false);
        setRecording(false);
        if (voiceTargetRef.current === "discovery") setVoiceFlowState("transcribing");
        void transcribeVoice(blob);
      };

      recorder.start();
      setRecordingPaused(false);
      setRecording(true);
    } catch {
      if (target === "discovery") setVoiceFlowState("idle");
      setVoiceError("مقدرناش نفتح الميكروفون. اسمح باستخدامه من المتصفح وجرب تاني.");
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

  async function submitDiscoveryAnswer(answerOverride?: string) {
    const answer = (answerOverride ?? discoveryInput).trim();
    if (!answer || discoveryLoading) return;

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
        throw new Error(data.error || "تعذر تجهيز السؤال التالي");
      }

      setDiscoveryCovered(Array.isArray(data.covered) ? data.covered : []);
      setDiscoveryMissing(Array.isArray(data.missing) ? data.missing : []);

      if (data.done) {
        setDiscoveryDone(true);
        setDiscoveryQuestion("");
        setDiscoveryTopic(null);
        setKnowledge(compileDiscoveryKnowledge(business, nextTurns));
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

    const existingResponse = await fetch("/api/businesses", { cache: "no-store" });
    const existingData = await existingResponse.json().catch(() => ({}));
    if (existingResponse.ok
      && Array.isArray(existingData.businesses)
      && existingData.businesses.length > 0) {
      setWorkspaceReady(true);
      const agentsResponse = await fetch("/api/agents", { cache: "no-store" });
      const agentsData = await agentsResponse.json().catch(() => ({}));
      const existingAgent = agentsData?.agents?.find((item: { isActive?: boolean }) => item.isActive)
        ?? agentsData?.agents?.[0];
      if (existingAgent?.agentId) setAgentId(existingAgent.agentId);
      return;
    }

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
        agent: {
          name: "موظف الاستقبال",
          roleTitle: "موظف استقبال",
          language: "ar",
          dialect: "مصري",
          tone: "مهني وودود",
          instructions: "جاوب باختصار ووضوح وبناءً على معلومات النشاط فقط.",
        },
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
  }

  async function trainKnowledge() {
    setLiveError(null);
    setMockState("loading");
    try {
      await ensureWorkspace();
      const response = await fetch("/api/knowledge/ingest/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: knowledge }),
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
      setKnowledgeCount(Math.max(proposalIds.length, data.proposals?.length ?? 0));
      setKnowledgeApplied(true);
      setMockState("success");
    } catch (error) {
      setLiveError(error instanceof Error ? error.message : "حدث خطأ أثناء التدريب");
      setMockState("error");
    }
  }

  async function askPreview(question: string) {
    setLiveError(null);
    setPreviewQuestion(question);
    setPreviewReply("بجهز الرد…");
    try {
      await ensureWorkspace();
      const response = await fetch("/api/onboarding/preview-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: question }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error ?? data?.message ?? "تعذر تجربة الرد");
      setPreviewReply(data.reply);
      setChatCount((value) => Math.min(3, value + 1));
    } catch (error) {
      setPreviewReply("مقدرناش نطلع الرد دلوقتي.");
      setLiveError(error instanceof Error ? error.message : "تعذر تجربة الرد");
    }
  }

  async function startWhatsApp() {
    setLiveError(null);
    try {
      await ensureWorkspace();
      const connectResponse = await fetch("/api/channels/whatsapp/connect", { method: "POST" });
      const connectData = await connectResponse.json();
      if (!connectResponse.ok) {
        throw new Error(connectData?.error ?? connectData?.message ?? "تعذر بدء الربط");
      }
      const qrResponse = await fetch("/api/channels/whatsapp/qr", { cache: "no-store" });
      const qrData = await qrResponse.json();
      if (!qrResponse.ok) throw new Error(qrData?.error ?? qrData?.message ?? "تعذر تحميل QR");
      if (qrData.qrImageDataUrl) setQrImageDataUrl(qrData.qrImageDataUrl);
      if (qrData.uiState === "READY") {
        setWaReady(true);
        setMockState("success");
      }
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

  const primaryLabel = useMemo(() => {
    switch (step) {
      case "WELCOME":
        return "ابدأ الإعداد";
      case "BUSINESS":
        return businessQuestion < businessQuestions.length - 1 ? "التالي" : "تمام — كمل";
      case "KNOWLEDGE":
        return mockState === "loading"
          ? "بنعلم الموظف..."
          : knowledgeApplied || mockState === "success"
            ? "جربه دلوقتي"
            : knowledgeMode === "guided" && !discoveryDone
              ? "كمّل المقابلة الأول"
              : "علّم الموظف";
      case "PLAYGROUND":
        return chatCount > 0 ? "الردود تمام — وصل واتساب" : "جرب سؤال الأول";
      case "WHATSAPP":
        return waReady ? "كمل لأول تجربة" : qrImageDataUrl ? "مستني المسح…" : "ابدأ الربط";
      case "FIRST_MESSAGE":
        return firstMessageStage >= 5 ? "كمل تجربة التحكم" : "مستني أول رد…";
      case "HUMAN_TAKEOVER":
        return humanTakeoverDone ? "فهمت" : "مستني ردك اليدوي…";
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
    knowledgeMode,
    discoveryDone,
    chatCount,
  ]);

  async function next() {
    if (step === "COMPLETED") {
      try {
        window.localStorage.removeItem(storageKey);
      } catch {
        // Ignore storage failures.
      }
      router.push("/dashboard");
      router.refresh();
      return;
    }
    if (step === "BUSINESS" && !businessCanContinue) return;
    if (step === "BUSINESS" && businessQuestion < businessQuestions.length - 1) {
      setBusinessQuestion((value) => value + 1);
      return;
    }
    if (step === "KNOWLEDGE" && !knowledgeApplied && mockState !== "success") {
      if (knowledgeMode === "guided" && !discoveryDone) return;
      if (!knowledge.trim()) return;
      await trainKnowledge();
      return;
    }
    if (step === "KNOWLEDGE" && mockState === "loading") return;
    if (step === "PLAYGROUND" && chatCount === 0) return;
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
    if (step === "HUMAN_TAKEOVER" && !humanTakeoverDone) return;

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
              style={{ width: `${progress * 0.88}%` }}
            />
            <div className="relative grid grid-cols-8 gap-1">
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
                    <>
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                        {businessTypeChoices.map((choice) => {
                          const selected = business.type === choice;
                          return (
                            <button
                              key={choice}
                              type="button"
                              onClick={() => setBusiness((prev) => ({ ...prev, type: choice, ...(choice !== "أخرى" ? { customType: "" } : {}) }))}
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
                      {business.type === "أخرى" ? (
                        <div className="mt-4">
                          <Input
                            value={business.customType ?? ""}
                            onChange={(event) =>
                              setBusiness((prev) => ({ ...prev, customType: event.target.value }))
                            }
                            placeholder="اكتب نوع النشاط بالتحديد، مثال: أكاديمية تعليم، شركة عقارات، مركز صيانة..."
                            className="h-14 rounded-2xl border-2 bg-white px-4 text-base"
                            autoFocus
                          />
                          <p className="mt-2 text-xs leading-6 text-muted-foreground">
                            هنستخدم النوع ده علشان نصيغ أسئلة التدريب على طبيعة شغلك بالظبط.
                          </p>
                        </div>
                      ) : null}
                    </>
                  ) : currentBusinessQuestion.kind === "country" ? (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      {countryChoices.map((choice) => {
                        const selected = business.countryCode === choice.code;
                        return (
                          <button
                            key={choice.code}
                            type="button"
                            onClick={() =>
                              setBusiness((prev) => ({ ...prev, countryCode: choice.code }))
                            }
                            className={cx(
                              "rounded-2xl border-2 px-3 py-5 text-center text-sm font-black transition-all duration-200",
                              selected
                                ? "border-primary bg-primary text-white shadow-lg"
                                : "border-border bg-white hover:border-primary/50",
                            )}
                          >
                            {choice.label}
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
                          {liveError ? <p className="mt-2 text-xs font-bold text-destructive">{liveError}</p> : null}
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
                  ) : mockState === "success" || knowledgeApplied ? (
                    <div className="mt-8 rounded-[24px] border border-success/20 bg-success-soft/55 p-6">
                      <div className="flex items-center gap-4">
                        <div className="grid h-14 w-14 place-items-center rounded-2xl bg-success text-2xl text-white">✓</div>
                        <div>
                          <h3 className="text-xl font-black">جاهز للتجربة ✨</h3>
                          <p className="mt-1 text-sm text-muted-foreground">موظفك اتعلم {knowledgeCount || "مجموعة"} معلومات جديدة عن البيزنس.</p>
                        </div>
                      </div>
                      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
                        {[
                          ["SERVICE", "الخدمات"],
                          ["FAQ", "الأسئلة الشائعة"],
                          ["POLICY", "السياسات"],
                          ["LOCATION_INFO", "الفروع والموقع"],
                          ["ABOUT", "عن البيزنس"],
                          ["CUSTOM", "معلومات إضافية"],
                        ].filter(([key]) => (knowledgeSummary[key] ?? 0) > 0)
                          .map(([key, label]) => (
                            <div key={key} className="rounded-2xl bg-white/85 p-3 text-center">
                              <div className="text-lg font-black">{knowledgeSummary[key]}</div>
                              <div className="mt-1 text-[11px] font-bold text-muted-foreground">{label}</div>
                            </div>
                          ))}
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="mt-7 grid grid-cols-2 gap-2 rounded-2xl bg-surface p-1.5">
                        <button
                          type="button"
                          onClick={() => setKnowledgeMode("guided")}
                          className={cx(
                            "rounded-xl px-4 py-3 text-sm font-black transition",
                            knowledgeMode === "guided"
                              ? "bg-white text-primary shadow-sm"
                              : "text-muted-foreground",
                          )}
                        >
                          ✨ اسألني واحدة واحدة
                        </button>
                        <button
                          type="button"
                          onClick={() => setKnowledgeMode("freeform")}
                          className={cx(
                            "rounded-xl px-4 py-3 text-sm font-black transition",
                            knowledgeMode === "freeform"
                              ? "bg-white text-primary shadow-sm"
                              : "text-muted-foreground",
                          )}
                        >
                          📝 هكتب كل حاجة
                        </button>
                      </div>

                      {knowledgeMode === "guided" ? (
                        <div className="mt-5">
                          {discoveryDone ? (
                            <div className="rounded-[24px] border border-success/20 bg-success-soft/55 p-6">
                              <div className="flex items-start gap-4">
                                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-success text-xl text-white">✓</div>
                                <div className="flex-1">
                                  <h3 className="font-black">تمام — الصورة بقت واضحة جدًا</h3>
                                  <p className="mt-2 text-sm leading-7 text-muted-foreground">
                                    جمعنا {discoveryTurns.length} إجابات عن {effectiveBusinessType || "النشاط"}، وجهزناهم للتدريب. تقدر تدرب الموظف دلوقتي.
                                  </p>
                                  {discoveryCovered.length > 0 ? (
                                    <div className="mt-4 flex flex-wrap gap-2">
                                      {discoveryCovered.map((key) => (
                                        <span key={key} className="rounded-full bg-white px-3 py-1.5 text-[11px] font-black text-success">
                                          {discoveryLabels[key] || key} ✓
                                        </span>
                                      ))}
                                    </div>
                                  ) : null}
                                </div>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className="rounded-[24px] border border-primary/15 bg-primary/5 p-5 sm:p-6">
                                <div className="flex items-start justify-between gap-4">
                                  <div>
                                    <span className="text-[11px] font-black text-primary">
                                      مقابلة ذكية · {effectiveBusinessType || "نشاطك"}
                                    </span>
                                    <h3 className="mt-2 text-xl font-black leading-8">
                                      {discoveryQuestion || initialDiscoveryQuestion(effectiveBusinessType)}
                                    </h3>
                                    <p className="mt-2 text-xs leading-6 text-muted-foreground">
                                      جاوب براحتك وبالتفاصيل. كل إجابة بتحدد السؤال اللي بعدها، فمش هنسألك حاجات ملهاش علاقة بنشاطك.
                                    </p>
                                  </div>
                                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-white text-sm font-black text-primary shadow-sm">
                                    {discoveryTurns.length + 1}
                                  </span>
                                </div>

                                <Textarea
                                  value={discoveryInput}
                                  onChange={(event) => {
                                    setDiscoveryInput(event.target.value);
                                    discoveryInputRef.current = event.target.value;
                                  }}
                                  placeholder="احكي براحتك... كل تفصيلة صغيرة ممكن تفرق في رد موظف الاستقبال."
                                  className="mt-5 min-h-36 rounded-[20px] border-2 bg-white p-4 text-base leading-8 shadow-sm focus:border-primary"
                                />

                                <div className="mt-3 flex flex-wrap items-center gap-2">
                                  <Button
                                    type="button"
                                    variant={recording ? "danger" : "outline"}
                                    disabled={transcribing || discoveryLoading}
                                    onClick={recording ? stopVoiceRecording : () => void startVoiceRecording("discovery")}
                                    className="rounded-2xl"
                                  >
                                    {transcribing
                                      ? "بنحوّل الصوت لنص…"
                                      : recording
                                        ? "■ وقف التسجيل"
                                        : "🎙️ جاوب بصوتك"}
                                  </Button>
                                  <Button
                                    type="button"
                                    disabled={!discoveryInput.trim() || discoveryLoading || recording || transcribing}
                                    onClick={() => void submitDiscoveryAnswer()}
                                    className="rounded-2xl"
                                  >
                                    {discoveryLoading ? "بفهم إجابتك…" : "ثبّت الإجابة وكمل"}
                                  </Button>
                                </div>

                                {recording ? (
                                  <div className="mt-3 flex items-center gap-2 text-xs font-black text-destructive">
                                    <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-destructive" />
                                    {recordingPaused ? "التسجيل متوقف مؤقتًا." : "بسمعك دلوقتي… اتكلم براحتك."}
                                  </div>
                                ) : null}
                                {voiceError ? <p className="mt-3 text-xs font-bold text-destructive">{voiceError}</p> : null}
                                {discoveryError ? <p className="mt-3 text-xs font-bold text-destructive">{discoveryError}</p> : null}
                              </div>

                              {discoveryTurns.length > 0 ? (
                                <div className="mt-4 rounded-2xl border border-border/70 bg-white p-4">
                                  <div className="flex items-center justify-between gap-3">
                                    <span className="text-xs font-black">اللي عرفناه لحد دلوقتي</span>
                                    <span className="text-[11px] font-bold text-muted-foreground">
                                      {discoveryTurns.length} إجابة
                                    </span>
                                  </div>
                                  <div className="mt-3 flex flex-wrap gap-2">
                                    {discoveryCovered.map((key) => (
                                      <span key={key} className="rounded-full bg-success-soft px-3 py-1.5 text-[11px] font-black text-success">
                                        {discoveryLabels[key] || key} ✓
                                      </span>
                                    ))}
                                    {discoveryMissing.slice(0, 4).map((key) => (
                                      <span key={key} className="rounded-full bg-secondary px-3 py-1.5 text-[11px] font-bold text-muted-foreground">
                                        {discoveryLabels[key] || key}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              ) : null}
                            </>
                          )}
                        </div>
                      ) : (
                        <>
                          <Textarea
                            value={knowledge}
                            onChange={(event) => setKnowledge(event.target.value)}
                            placeholder="مثال: عندنا فرعين، بنفتح يوميًا من 11 الصبح، خدمة الشعر بـ200 جنيه، الحجز متاح من الموقع..."
                            className="mt-5 min-h-56 rounded-[24px] border-2 bg-white p-5 text-base leading-8 shadow-sm focus:border-primary"
                          />
                          <div className="mt-4 rounded-[22px] border border-primary/15 bg-primary/5 p-4">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div>
                                <p className="text-sm font-black">مش عايز تكتب؟ اتكلم وإحنا هنكتبلك.</p>
                                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                                  اتكلم بالعربي بشكل طبيعي، وبعد التحويل راجع النص وعدّله لو محتاج.
                                </p>
                              </div>
                              <Button
                                type="button"
                                variant={recording ? "danger" : "outline"}
                                disabled={transcribing}
                                onClick={recording ? stopVoiceRecording : () => void startVoiceRecording("knowledge")}
                                className="min-w-40 rounded-2xl"
                              >
                                {transcribing
                                  ? "بنحوّل الصوت لنص…"
                                  : recording
                                    ? "■ وقف التسجيل"
                                    : "🎙️ اتكلم بدل الكتابة"}
                              </Button>
                            </div>
                            {recording ? (
                              <div className="mt-3 flex items-center gap-2 text-xs font-black text-destructive">
                                <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-destructive" />
                                بسمعك دلوقتي… اتكلم براحتك وبعدين وقف التسجيل.
                              </div>
                            ) : null}
                            {voiceError ? (
                              <p className="mt-3 text-xs font-bold text-destructive" role="alert">
                                {voiceError}
                              </p>
                            ) : null}
                          </div>
                          <div className="mt-4 flex flex-wrap gap-2">
                            {knowledgeChips.map((chip) => (
                              <span key={chip} className="rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-bold text-secondary-foreground">{chip}</span>
                            ))}
                          </div>
                        </>
                      )}
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
                        onClick={() => void askPreview(question)}
                        className="rounded-full border border-border bg-white px-4 py-2 text-sm font-bold shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary hover:text-primary hover:shadow-md"
                      >
                        {question}
                      </button>
                    ))}
                  </div>
                  <div className="mt-6 rounded-[26px] border border-border bg-surface/50 p-4 sm:p-6">
                    <div className="space-y-4">
                      <div className="mr-auto max-w-[82%] translate-y-0 rounded-2xl rounded-bl-md bg-white p-4 text-sm shadow-sm transition-all">{previewQuestion}</div>
                      <div className="ml-auto max-w-[86%] rounded-2xl rounded-br-md bg-primary p-4 text-sm leading-7 text-primary-foreground shadow-md">
                        {previewReply}
                        <div className="mt-2 text-[10px] font-semibold text-primary-foreground/70">رد حقيقي من موظفك التجريبي</div>
                      </div>

                    </div>
                    <div className="mt-4 flex gap-2">
                      <button type="button" onClick={() => setChatCount((n) => Math.max(1, n))} className="rounded-xl bg-success-soft px-3 py-2 text-xs font-black text-success">تمام 👍</button>
                      <button
                        type="button"
                        onClick={() => {
                          setStep("KNOWLEDGE");
                          setMockState("default");
                        }}
                        className="rounded-xl bg-white px-3 py-2 text-xs font-black text-muted-foreground shadow-sm"
                      >
                        عدّل المعلومة
                      </button>
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
                    {qrImageDataUrl ? (
                      <Image
                        src={qrImageDataUrl}
                        alt="QR لربط واتساب"
                        width={208}
                        height={208}
                        unoptimized
                        className="mx-auto h-52 w-52 rounded-3xl border border-border bg-white p-2"
                      />
                    ) : (
                      <div className="mx-auto grid h-52 w-52 place-items-center rounded-3xl border border-dashed border-border bg-surface">
                        <div className="text-center">
                          <div className="text-3xl">▦</div>
                          <div className="mt-2 text-xs font-bold text-muted-foreground">اضغط ابدأ الربط</div>
                        </div>
                      </div>
                    )}
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
                        ? "حصلت مشكلة أثناء الربط — تقدر تحاول تاني من غير ما تبدأ من الأول."
                        : mockState === "success"
                          ? "تم الربط — واتساب جاهز لأول تجربة ✓"
                          : qrImageDataUrl
                            ? "مستني المسح…"
                            : "ابدأ الربط علشان يظهر QR"}
                  </div>
                  {liveError && mockState === "error" ? (
                    <p className="mx-auto mt-3 max-w-md text-xs font-bold text-destructive">
                      {liveError}
                    </p>
                  ) : null}
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
                      const active = firstMessageStage >= i + 1 || (i === 0 && firstMessageStage === 0);
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
                  <div className={cx("mt-8 w-full max-w-md rounded-2xl p-5 text-sm font-black", humanTakeoverDone ? "bg-success-soft text-success" : "bg-surface text-muted-foreground")}>
                    {humanTakeoverDone ? "تمام 👌 وقفنا الرد التلقائي للمحادثة دي." : "مستني ردك اليدوي…"}
                  </div>
                  {humanTakeoverDone ? <p className="mt-4 max-w-lg text-sm leading-7 text-muted-foreground">أي وقت حد من فريقك يرد بنفسه، DRVOWA يسيب المحادثة ليكم تلقائيًا.</p> : null}
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
                disabled={
                  mockState === "loading"
                  || (step === "BUSINESS" && !businessCanContinue)
                  || (step === "KNOWLEDGE" && !knowledgeApplied && ((knowledgeMode === "guided" && !discoveryDone) || !knowledge.trim()) && mockState !== "success")
                  || (step === "PLAYGROUND" && chatCount === 0)
                  || (step === "WHATSAPP" && Boolean(qrImageDataUrl) && !waReady)
                  || (step === "FIRST_MESSAGE" && firstMessageStage < 5)
                  || (step === "HUMAN_TAKEOVER" && !humanTakeoverDone)
                }
                className="min-w-44"
              >
                {primaryLabel}
              </Button>
            </div>
          </div>
        </section>

        {process.env.NODE_ENV !== "production" ? <div className="mt-6 hidden justify-center md:flex">
          <div className="flex items-center gap-2 rounded-2xl border border-border/70 bg-white/75 p-2 shadow-sm backdrop-blur">
            <span className="px-2 text-[11px] font-bold text-muted-foreground">Preview state</span>
            {(["default", "loading", "success", "error", "compatibility-warning"] as MockState[]).map((state) => (
              <button key={state} type="button" onClick={() => setMockState(state)} className={cx("rounded-xl px-2.5 py-1.5 text-[10px] font-bold transition", mockState === state ? "bg-primary text-white" : "text-muted-foreground hover:bg-secondary")}>{state}</button>
            ))}
          </div>
        </div> : null}
      </div>

      {voiceFlowState !== "idle" ? (
        <div
          className="voice-flow-overlay fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/45 px-5 backdrop-blur-md"
          role="dialog"
          aria-modal="true"
          aria-label={voiceFlowState === "recording" ? "جاري تسجيل الإجابة" : "جاري تجهيز الإجابة"}
        >
          <div className="w-full max-w-md rounded-[32px] border border-white/60 bg-white/95 p-6 text-center shadow-[0_30px_100px_rgba(15,23,42,.30)] sm:p-8">
            {voiceFlowState === "recording" ? (
              <>
                <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-destructive/10">
                  <div className="grid h-14 w-14 place-items-center rounded-full bg-destructive text-2xl text-white shadow-[0_10px_35px_rgba(220,38,38,.28)]">
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
                <div className="mt-5 grid grid-cols-3 gap-2 text-[11px] font-bold text-muted-foreground">
                  <span className="rounded-xl bg-surface px-2 py-2.5">مكان هادي</span>
                  <span className="rounded-xl bg-surface px-2 py-2.5">صوت واضح</span>
                  <span className="rounded-xl bg-surface px-2 py-2.5">بدون استعجال</span>
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

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border/70 bg-white/95 p-3 shadow-[0_-8px_30px_rgba(15,28,36,.08)] backdrop-blur sm:hidden">
        <div className="mx-auto flex max-w-lg gap-2">
          {step !== "WELCOME" ? <Button type="button" variant="outline" className="w-24" onClick={previous}>السابق</Button> : null}
          <Button
            type="button"
            className="flex-1"
            onClick={next}
            disabled={
              mockState === "loading"
              || (step === "BUSINESS" && !businessCanContinue)
              || (step === "KNOWLEDGE" && !knowledgeApplied && ((knowledgeMode === "guided" && !discoveryDone) || !knowledge.trim()) && mockState !== "success")
              || (step === "PLAYGROUND" && chatCount === 0)
              || (step === "WHATSAPP" && Boolean(qrImageDataUrl) && !waReady)
              || (step === "FIRST_MESSAGE" && firstMessageStage < 5)
              || (step === "HUMAN_TAKEOVER" && !humanTakeoverDone)
            }
          >
            {primaryLabel}
          </Button>
        </div>
      </div>
    </main>
  );
}
