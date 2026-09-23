/**
 * Real-Gemini disposable smoke for Knowledge AI analyze (never apply).
 * Enable with: SMOKE_KNOWLEDGE_AI_GEMINI=1
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { closePool, getDbConfig, getPool } from "@/lib/db";
import { signup } from "@/modules/auth/service";
import {
  analyzeKnowledgeIngest,
  cancelIngestSession,
} from "@/modules/knowledge-ai";
import { createGeminiKnowledgeProvider } from "@/modules/knowledge-ai/gemini-knowledge-provider";
import { ensureDefaultKnowledgeBase } from "@/modules/knowledge/service";
import { completeOnboarding } from "@/modules/onboarding/service";
import { clearTestCookies } from "../helpers/cookies";
import { rethrowDbBootstrapFailure } from "../helpers/db-bootstrap";

const enabled = process.env.SMOKE_KNOWLEDGE_AI_GEMINI === "1";

function dbEnvConfigured(): boolean {
  try {
    getDbConfig();
    return true;
  } catch {
    return false;
  }
}

const dbOk = dbEnvConfigured();

describe.skipIf(!enabled || !dbOk)("knowledge AI gemini smoke (analyze only)", () => {
  let businessId = "";
  let userId = "";

  beforeAll(async () => {
    clearTestCookies();
    try {
      await getPool();
    } catch (error) {
      rethrowDbBootstrapFailure(error);
    }
    expect(process.env.E2E_KNOWLEDGE_INGEST_MOCK).not.toBe("1");
    expect(process.env.KNOWLEDGE_INGEST_MOCK).not.toBe("1");
    expect(process.env.KNOWLEDGE_INGEST_HEURISTIC_DEDUP).not.toBe("1");
    expect(Boolean(process.env.GEMINI_API_KEY?.trim())).toBe(true);

    const suffix = randomUUID().slice(0, 8);
    const auth = await signup({
      email: `smoke-kai-${suffix}@example.com`,
      password: "Password123!",
      fullName: `Smoke ${suffix}`,
    });
    const onboard = await completeOnboarding({
      userId: auth.user.userId,
      sessionId: auth.session.sessionId,
      business: {
        name: `Smoke KAI ${suffix}`,
        category: "salon",
        countryCode: "EG",
        locale: "ar-EG",
        timezone: "Africa/Cairo",
      },
      location: { name: "Loc", city: "Alex" },
      agent: {
        name: "Agent",
        roleTitle: "Reception",
        language: "ar",
        dialect: "egyptian",
      },
    });
    businessId = onboard.business.businessId;
    userId = auth.user.userId;
    await ensureDefaultKnowledgeBase({ businessId });
  }, 60_000);

  afterAll(async () => {
    await closePool().catch(() => undefined);
  }, 30_000);

  const cases = [
    {
      name: "small",
      text: "الحلاقة 200 جنيه. الحجز قبل الموعد بربع ساعة.",
    },
    {
      name: "medium",
      text: [
        "فرع جليم في سابا باشا.",
        "المواعيد يومياً من 11 صباحاً إلى 2 صباحاً.",
        "الحلاقة 200 جنيه.",
        "شعر ودقن 300 جنيه.",
        "الحجز لازم قبل الموعد بربع ساعة على الأقل.",
        "Google Maps: https://maps.example/gleem-smoke",
      ].join("\n"),
    },
    {
      name: "large",
      text: [
        "نشاط صالون في الإسكندرية.",
        "فرع جليم في سابا باشا.",
        "المواعيد يومياً من 11 صباحاً إلى 2 صباحاً.",
        "الحلاقة 200 جنيه.",
        "شعر ودقن 300 جنيه.",
        "صبغة كاملة 800 جنيه.",
        "استشوار 150 جنيه.",
        "الحجز لازم قبل الموعد بربع ساعة على الأقل.",
        "نقبل كاش وإنستاباي.",
        "Google Maps: https://maps.example/gleem-smoke-large",
        ...Array.from(
          { length: 40 },
          (_, i) =>
            `ملاحظة تشغيل ${i + 1}: نؤكد نفس المواعيد والخدمات المذكورة أعلاه بدون تغيير أسعار.`,
        ),
      ].join("\n"),
    },
  ] as const;

  for (const c of cases) {
    it(
      `${c.name} input reaches REVIEW without apply`,
      async () => {
        const provider = createGeminiKnowledgeProvider();
        const analyzed = await analyzeKnowledgeIngest({
          businessId,
          userId,
          text: c.text,
          provider,
          useHeuristicDedup: false,
        });
        expect(analyzed.session.status).toBe("REVIEW");
        expect(analyzed.proposals.length).toBeGreaterThan(0);
        const actions = new Set(analyzed.proposals.map((p) => p.action));
        for (const a of actions) {
          expect(["CREATE", "MERGE", "NOOP", "CONFLICT"]).toContain(a);
        }
        await cancelIngestSession({
          businessId,
          sessionId: analyzed.session.sessionId,
        });
        console.info(
          JSON.stringify({
            smokeCase: c.name,
            status: "REVIEW",
            inputLength: c.text.length,
            proposalCount: analyzed.proposals.length,
            model: analyzed.session.model,
            knowledgeApplied: false,
          }),
        );
      },
      180_000,
    );
  }
});
