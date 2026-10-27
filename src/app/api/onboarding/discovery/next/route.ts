import { GoogleGenAI } from "@google/genai";
import { recordAiProviderCall } from "@/modules/ai-cost/recorder";
import { z } from "zod";

import { requireApiUser } from "@/lib/api/auth-context";
import { handleApiError, jsonError, jsonOk, parseJsonBody } from "@/lib/api/http";
import { RATE_LIMITS, assertRateLimit } from "@/lib/security/rate-limit";
import {
  DISCOVERY_ANSWER_MAX_CHARS,
  DISCOVERY_QUESTION_MAX_CHARS,
  DISCOVERY_MAX_TURNS,
  formatDiscoveryTranscript,
} from "@/lib/onboarding/discovery-limits";

const turnSchema = z.object({
  question: z.string().min(1).max(DISCOVERY_QUESTION_MAX_CHARS),
  answer: z.string().min(1).max(DISCOVERY_ANSWER_MAX_CHARS),
  topic: z.string().max(80).optional(),
});

const bodySchema = z.object({
  business: z.object({
    name: z.string().max(160).optional().default(""),
    type: z.string().max(120).optional().default(""),
    branches: z.string().max(120).optional().default(""),
    hours: z.string().max(300).optional().default(""),
    link: z.string().max(500).optional().default(""),
  }),
  turns: z.array(turnSchema).max(DISCOVERY_MAX_TURNS),
});

const COVERAGE_KEYS = [
  "offerings",
  "pricing",
  "customer_journey",
  "availability",
  "booking_ordering",
  "payments",
  "fulfillment",
  "policies",
  "promotions",
  "exceptions",
  "human_escalation",
  "faq",
] as const;

type CoverageKey = typeof COVERAGE_KEYS[number];

type DiscoveryResult = {
  done: boolean;
  nextQuestion: string | null;
  topic: CoverageKey | null;
  covered: CoverageKey[];
  missing: CoverageKey[];
};

function parseJsonObject(raw: string): unknown {
  const trimmed = raw.trim();
  const unfenced = trimmed
    .replace(/^\`\`\`(?:json)?\s*/i, "")
    .replace(/\s*\`\`\`$/, "");
  const start = unfenced.indexOf("{");
  const end = unfenced.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("DISCOVERY_BAD_JSON");
  return JSON.parse(unfenced.slice(start, end + 1));
}

const outputSchema = z.object({
  done: z.boolean(),
  nextQuestion: z.string().max(700).nullable(),
  topic: z.enum(COVERAGE_KEYS).nullable(),
  covered: z.array(z.enum(COVERAGE_KEYS)).max(COVERAGE_KEYS.length),
  missing: z.array(z.enum(COVERAGE_KEYS)).max(COVERAGE_KEYS.length),
});

export async function POST(request: Request) {
  try {
    const user = await requireApiUser();
    assertRateLimit(
      `onboarding-discovery:${user.userId}`,
      RATE_LIMITS.onboardingDiscovery,
    );

    const body = bodySchema.parse(await parseJsonBody(request));
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
      return jsonError(
        "خدمة التدريب بالذكاء الاصطناعي غير مفعّلة. أضف GEMINI_API_KEY في .env.local ثم أعد تشغيل السيرفر.",
        503,
        { code: "AI_UNAVAILABLE" },
      );
    }

    const model =
      process.env.GEMINI_MODEL?.trim() || "gemini-3.5-flash-lite";
    const client = new GoogleGenAI({ apiKey });

    const transcript = formatDiscoveryTranscript(body.turns);

    const prompt = `
أنت Business Discovery Interviewer داخل onboarding لنظام موظف استقبال ذكي.
هدفك جمع المعلومات التي يحتاجها موظف استقبال ليجاوب العملاء بدقة، لأي نوع بيزنس.

بيانات النشاط:
- الاسم: ${body.business.name || "غير محدد"}
- النوع الذي اختاره المستخدم: ${body.business.type || "غير محدد"}
- عدد الفروع: ${body.business.branches || "غير محدد"}
- المواعيد الأولية: ${body.business.hours || "غير محددة"}
- الرابط: ${body.business.link || "غير محدد"}

إجابات المستخدم حتى الآن:
${transcript || "لا توجد إجابات بعد."}

قيّم التغطية عبر هذه المحاور:
offerings, pricing, customer_journey, availability, booking_ordering, payments,
fulfillment, policies, promotions, exceptions, human_escalation, faq.

قواعد مهمة:
1) استخدم "نوع النشاط" في صياغة السؤال والأمثلة. لا تسأل أسئلة صالون لعيادة ولا أسئلة مطعم لمتجر.
2) اسأل سؤالاً واحداً فقط كل مرة، لكن صياغته تفتح ذاكرة المستخدم وتدعوه لذكر التفاصيل والاستثناءات.
3) لا تكرر معلومة أجاب عنها بوضوح.
4) لو إجابة فتحت باباً مهماً، اسأل follow-up قبل الانتقال لمحور آخر.
5) لا تفترض أن محوراً موجود؛ لو غير مناسب للنشاط، يمكن اعتباره covered بعد أن يتضح أنه غير موجود.
6) ركّز على معلومات العملاء: ماذا نقدم، الأسعار وما يغيرها، الرحلة من أول التواصل للنهاية، الحجز/الطلب، الدفع، التنفيذ/التوصيل، السياسات، العروض، الاستثناءات، ومتى يحتاج تدخل بشري.
7) اسأل بالمصري الطبيعي، مختصر وواضح، مع أمثلة مرتبطة بنوع النشاط بين قوسين عند الحاجة.
8) اعتبر المقابلة مكتملة فقط عندما تكفي المعلومات فعلاً لموظف استقبال أن يخدم عميل جديد بدون تخمين.
9) لا تطلب أسراراً أو بيانات حساسة أو كلمات مرور.

أرجع JSON فقط بالشكل:
{
  "done": false,
  "nextQuestion": "السؤال التالي أو null",
  "topic": "واحد من المحاور أو null",
  "covered": ["..."],
  "missing": ["..."]
}
`.trim();

    const started = Date.now();
    let response;
    try {
      response = await client.models.generateContent({ model, contents: prompt });
    } catch (error) {
      await recordAiProviderCall({ purpose: "ONBOARDING_DISCOVERY", model, startedAtMs: started, error });
      throw error;
    }
    await recordAiProviderCall({ purpose: "ONBOARDING_DISCOVERY", model, startedAtMs: started, response });

    const raw = response.text || "";

    const parsed = outputSchema.parse(parseJsonObject(raw));

    const result: DiscoveryResult = {
      done: parsed.done,
      nextQuestion: parsed.done ? null : parsed.nextQuestion,
      topic: parsed.done ? null : parsed.topic,
      covered: [...new Set(parsed.covered)],
      missing: [...new Set(parsed.missing)],
    };

    if (!result.done && !result.nextQuestion) {
      throw new Error("DISCOVERY_MISSING_QUESTION");
    }

    return jsonOk(result);
  } catch (error) {
    return handleApiError(error);
  }
}
