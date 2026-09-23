import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { closePool, getDbConfig, getPool, query, sql, withTransaction } from "@/lib/db";
import { signup } from "@/modules/auth/service";
import {
  analyzeKnowledgeIngest,
  applyKnowledgeIngest,
  cancelIngestSession,
  KnowledgeIngestError,
} from "@/modules/knowledge-ai";
import { createMockKnowledgeProvider } from "@/modules/knowledge-ai/mock-provider";
import * as ingestRepo from "@/modules/knowledge-ai/repository";
import * as knowledgeRepo from "@/modules/knowledge/repository";
import { ensureDefaultKnowledgeBase, listItems } from "@/modules/knowledge/service";
import { completeOnboarding } from "@/modules/onboarding/service";
import { rethrowDbBootstrapFailure } from "../helpers/db-bootstrap";
import { clearTestCookies } from "../helpers/cookies";

function dbEnvConfigured(): boolean {
  try {
    getDbConfig();
    return true;
  } catch {
    return false;
  }
}

const dbEnvOk = dbEnvConfigured();
const dbSkipReason: string | null = dbEnvOk
  ? null
  : "DB_* env not configured — knowledge ingest concurrency suite skipped";

function requireDb(skip: (reason?: string) => never): void {
  if (dbSkipReason) skip(dbSkipReason);
}

async function onboardTenant(suffix: string) {
  clearTestCookies();
  const auth = await signup({
    email: `ki-${suffix}@example.com`,
    password: "Password123!",
    fullName: `KI ${suffix}`,
  });
  const onboard = await completeOnboarding({
    userId: auth.user.userId,
    sessionId: auth.session.sessionId,
    business: {
      name: `KI Biz ${suffix}`,
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
  return {
    userId: auth.user.userId,
    businessId: onboard.business.businessId,
  };
}

async function seedReviewSession(params: {
  businessId: string;
  userId: string;
  proposals: Array<{
    action: "CREATE" | "MERGE" | "NOOP" | "CONFLICT";
    category: "SERVICE" | "POLICY" | "LOCATION_INFO" | "CUSTOM";
    title: string;
    content: string;
    selected?: boolean;
    existingKnowledgeItemId?: string | null;
    existingTitle?: string | null;
    existingContent?: string | null;
    existingUpdatedAtUtc?: Date | null;
  }>;
}) {
  const paste = `seed-${randomUUID()}-${params.proposals.map((p) => p.title).join("|")}`;
  const session = await ingestRepo.createSession({
    businessId: params.businessId,
    createdByUserId: params.userId,
    rawInput: paste,
    conversation: [
      { role: "user", text: paste, at: new Date().toISOString() },
    ],
    inputHash: null,
    inputLength: paste.length,
    model: "test",
    status: "REVIEW",
    analysisVersion: 1,
  });

  await ingestRepo.insertProposals(
    params.proposals.map((p, i) => ({
      sessionId: session.sessionId,
      sequence: i + 1,
      action: p.action,
      category: p.category,
      proposedTitle: p.title,
      proposedContent: p.content,
      existingKnowledgeItemId: p.existingKnowledgeItemId ?? null,
      existingTitle: p.existingTitle ?? null,
      existingContent: p.existingContent ?? null,
      existingUpdatedAtUtc: p.existingUpdatedAtUtc ?? null,
      confidence: 0.9,
      selected: p.selected ?? (p.action === "CREATE" || p.action === "MERGE"),
      status: "PENDING",
      subjectKey: p.title.slice(0, 80),
    })),
  );

  return { session, paste };
}

describe("knowledge AI ingest concurrency / privacy", () => {
  let businessId = "";
  let userId = "";

  beforeAll(async () => {
    if (dbSkipReason) {
      console.warn(`[knowledge-ingest] ${dbSkipReason}`);
      return;
    }
    try {
      await getPool();
    } catch (error) {
      rethrowDbBootstrapFailure(error);
    }
    const tenant = await onboardTenant(randomUUID().slice(0, 8));
    businessId = tenant.businessId;
    userId = tenant.userId;
    await ensureDefaultKnowledgeBase({ businessId });
  });

  afterAll(async () => {
    if (!dbEnvOk) return;
    await closePool().catch(() => undefined);
  }, 30_000);

  it("rejects concurrent follow-up while ANALYZING", async ({ skip }) => {
    requireDb(skip);
    const first = await analyzeKnowledgeIngest({
      businessId,
      userId,
      text: "فرع جليم في سابا باشا. المواعيد يومياً من 11 صباحاً إلى 2 صباحاً.",
      provider: createMockKnowledgeProvider(),
      useHeuristicDedup: true,
    });

    await ingestRepo.updateSession({
      businessId,
      sessionId: first.session.sessionId,
      status: "ANALYZING",
    });

    await expect(
      analyzeKnowledgeIngest({
        businessId,
        userId,
        sessionId: first.session.sessionId,
        text: "Google Maps: https://maps.example/gleem",
        provider: createMockKnowledgeProvider(),
        useHeuristicDedup: true,
      }),
    ).rejects.toMatchObject({ code: "ANALYSIS_IN_PROGRESS" });

    await ingestRepo.updateSession({
      businessId,
      sessionId: first.session.sessionId,
      status: "REVIEW",
    });
  });

  it("discards stale Gemini finalize via analysis version fence", async ({ skip }) => {
    requireDb(skip);
    const begun = await withTransaction(async (trx) => {
      const session = await ingestRepo.createSession(
        {
          businessId,
          createdByUserId: userId,
          rawInput: "x",
          conversation: [{ role: "user", text: "x", at: new Date().toISOString() }],
          inputHash: null,
          inputLength: 1,
          model: "test",
          status: "ANALYZING",
          analysisVersion: 1,
        },
        trx,
      );
      return session;
    });

    // Simulate a newer analysis taking the fence
    await ingestRepo.updateSession({
      businessId,
      sessionId: begun.sessionId,
      analysisVersion: 2,
      status: "ANALYZING",
    });

    await expect(
      withTransaction(async (trx) => {
        const locked = await ingestRepo.lockSession(
          { businessId, sessionId: begun.sessionId },
          trx,
        );
        if (
          !locked
          || locked.analysisVersion !== 1
          || locked.status !== "ANALYZING"
        ) {
          throw new KnowledgeIngestError(
            "ANALYSIS_SUPERSEDED",
            "تم تحديث التحليل بطلب أحدث. حاول مرة أخرى.",
            409,
          );
        }
      }),
    ).rejects.toMatchObject({ code: "ANALYSIS_SUPERSEDED" });
  });

  it("rolls back finalize when audit fails (atomic proposals)", async ({ skip }) => {
    requireDb(skip);
    const session = await ingestRepo.createSession({
      businessId,
      createdByUserId: userId,
      rawInput: "atomic-audit",
      conversation: [
        { role: "user", text: "atomic-audit", at: new Date().toISOString() },
      ],
      inputHash: null,
      inputLength: 12,
      model: "test",
      status: "ANALYZING",
      analysisVersion: 3,
    });

    const prev = process.env.DRVOWA_TEST_AUDIT_FAIL;
    process.env.DRVOWA_TEST_AUDIT_FAIL = "1";
    try {
      await expect(
        withTransaction(async (trx) => {
          const locked = await ingestRepo.lockSession(
            { businessId, sessionId: session.sessionId },
            trx,
          );
          expect(locked?.analysisVersion).toBe(3);
          await ingestRepo.deleteProposalsForSession(
            { sessionId: session.sessionId },
            trx,
          );
          await ingestRepo.insertProposals(
            [
              {
                sessionId: session.sessionId,
                sequence: 1,
                action: "CREATE",
                category: "CUSTOM",
                proposedTitle: "should-rollback",
                proposedContent: "should-rollback",
                existingKnowledgeItemId: null,
                existingTitle: null,
                existingContent: null,
                existingUpdatedAtUtc: null,
                confidence: 1,
                selected: true,
                status: "PENDING",
                subjectKey: "should-rollback",
              },
            ],
            trx,
          );
          await ingestRepo.updateSession(
            {
              businessId,
              sessionId: session.sessionId,
              status: "REVIEW",
            },
            trx,
          );
          const { writeAuditEvent } = await import("@/modules/audit/service");
          await writeAuditEvent(
            {
              businessId,
              actorUserId: userId,
              action: "KNOWLEDGE_INGEST_ANALYZED",
              entityType: "KnowledgeIngestSession",
              entityId: session.sessionId,
            },
            trx,
          );
        }),
      ).rejects.toThrow(/forced audit failure/);
    } finally {
      if (prev === undefined) delete process.env.DRVOWA_TEST_AUDIT_FAIL;
      else process.env.DRVOWA_TEST_AUDIT_FAIL = prev;
    }

    const proposals = await ingestRepo.listProposals({
      businessId,
      sessionId: session.sessionId,
    });
    expect(proposals).toHaveLength(0);
    const refreshed = await ingestRepo.getSession({
      businessId,
      sessionId: session.sessionId,
    });
    expect(refreshed?.status).toBe("ANALYZING");
  });

  it("concurrent identical CREATE applies exactly one knowledge item", async ({ skip }) => {
    requireDb(skip);
    const title = `Unique Fact ${randomUUID().slice(0, 8)}`;
    const content = `${title} details for concurrent create`;

    const a = await seedReviewSession({
      businessId,
      userId,
      proposals: [
        {
          action: "CREATE",
          category: "CUSTOM",
          title,
          content,
        },
      ],
    });
    const b = await seedReviewSession({
      businessId,
      userId,
      proposals: [
        {
          action: "CREATE",
          category: "CUSTOM",
          title,
          content,
        },
      ],
    });

    const results = await Promise.allSettled([
      applyKnowledgeIngest({
        businessId,
        userId,
        sessionId: a.session.sessionId,
      }),
      applyKnowledgeIngest({
        businessId,
        userId,
        sessionId: b.session.sessionId,
      }),
    ]);

    expect(results.every((r) => r.status === "fulfilled")).toBe(true);

    const items = (await listItems({ businessId, includeInactive: true })).filter(
      (i) => i.title === title,
    );
    expect(items).toHaveLength(1);

    const createdTotal =
      results
        .filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof applyKnowledgeIngest>>> =>
          r.status === "fulfilled",
        )
        .reduce((sum, r) => sum + r.value.applied.created, 0);
    expect(createdTotal).toBe(1);
  });

  it("concurrent MERGE of same item: second becomes stale", async ({ skip }) => {
    requireDb(skip);
    const base = await ensureDefaultKnowledgeBase({ businessId });
    const item = await knowledgeRepo.createKnowledgeItem({
      businessId,
      knowledgeBaseId: base.knowledgeBaseId,
      category: "SERVICE",
      title: `Merge Target ${randomUUID().slice(0, 6)}`,
      content: "original content",
      isActive: true,
    });

    const snap = item.updatedAtUtc;
    const a = await seedReviewSession({
      businessId,
      userId,
      proposals: [
        {
          action: "MERGE",
          category: "SERVICE",
          title: item.title,
          content: "added A",
          existingKnowledgeItemId: item.knowledgeItemId,
          existingTitle: item.title,
          existingContent: item.content,
          existingUpdatedAtUtc: snap,
        },
      ],
    });
    const b = await seedReviewSession({
      businessId,
      userId,
      proposals: [
        {
          action: "MERGE",
          category: "SERVICE",
          title: item.title,
          content: "added B",
          existingKnowledgeItemId: item.knowledgeItemId,
          existingTitle: item.title,
          existingContent: item.content,
          existingUpdatedAtUtc: snap,
        },
      ],
    });

    const first = await applyKnowledgeIngest({
      businessId,
      userId,
      sessionId: a.session.sessionId,
    });
    expect(first.applied.merged).toBe(1);

    await expect(
      applyKnowledgeIngest({
        businessId,
        userId,
        sessionId: b.session.sessionId,
      }),
    ).rejects.toMatchObject({ code: "STALE_PROPOSAL" });
  });

  it("clears RawInput and ConversationJson after APPLY", async ({ skip }) => {
    requireDb(skip);
    const { session, paste } = await seedReviewSession({
      businessId,
      userId,
      proposals: [
        {
          action: "CREATE",
          category: "CUSTOM",
          title: `Privacy ${randomUUID().slice(0, 6)}`,
          content: "privacy content",
        },
      ],
    });

    expect(session.rawInput).toContain(paste.slice(0, 20));
    expect(session.conversation.some((t) => t.text.includes(paste.slice(0, 20)))).toBe(
      true,
    );

    await applyKnowledgeIngest({
      businessId,
      userId,
      sessionId: session.sessionId,
    });

    const refreshed = await ingestRepo.getSession({
      businessId,
      sessionId: session.sessionId,
    });
    expect(refreshed?.status).toBe("APPLIED");
    expect(refreshed?.rawInput).toBeNull();
    expect(refreshed?.conversation).toEqual([]);
    const joined = JSON.stringify(refreshed?.conversation ?? []);
    expect(joined).not.toContain(paste.slice(0, 40));
  });

  it("clears raw paste on cancel", async ({ skip }) => {
    requireDb(skip);
    const paste = `cancel-paste-${randomUUID()}`;
    const session = await ingestRepo.createSession({
      businessId,
      createdByUserId: userId,
      rawInput: paste,
      conversation: [{ role: "user", text: paste, at: new Date().toISOString() }],
      inputHash: null,
      inputLength: paste.length,
      model: "test",
      status: "REVIEW",
      analysisVersion: 1,
    });

    const canceled = await cancelIngestSession({
      businessId,
      sessionId: session.sessionId,
    });
    expect(canceled.status).toBe("CANCELED");
    expect(canceled.rawInput).toBeNull();
    expect(canceled.conversation).toEqual([]);
  });

  it("enforces cumulative session source cap", async ({ skip }) => {
    requireDb(skip);
    const prior = "ب".repeat(70_000);
    const session = await ingestRepo.createSession({
      businessId,
      createdByUserId: userId,
      rawInput: prior.slice(0, 100),
      conversation: [
        { role: "user", text: prior, at: new Date().toISOString() },
        {
          role: "assistant",
          text: "summary",
          at: new Date().toISOString(),
        },
      ],
      inputHash: null,
      inputLength: prior.length,
      model: "test",
      status: "REVIEW",
      analysisVersion: 1,
    });

    await expect(
      analyzeKnowledgeIngest({
        businessId,
        userId,
        sessionId: session.sessionId,
        text: "ب".repeat(55_000),
        provider: createMockKnowledgeProvider(),
        useHeuristicDedup: true,
      }),
    ).rejects.toMatchObject({ code: "SESSION_TOO_LARGE" });
  });

  it("serializes concurrent applies via business applock (quota gate)", async ({ skip }) => {
    requireDb(skip);
    // Fill almost to FREE limit (50) then race two CREATEs near the edge.
    const snap = await query<{ Cnt: number }>(
      `SELECT COUNT(1) AS Cnt FROM TblKnowledgeItem
       WHERE BusinessID = @businessId AND IsActive = 1`,
      [{ name: "businessId", type: sql.UniqueIdentifier, value: businessId }],
    );
    const used = Number(snap.recordset[0]?.Cnt ?? 0);
    const base = await ensureDefaultKnowledgeBase({ businessId });
    const target = 49;
    for (let i = used; i < target; i += 1) {
      await knowledgeRepo.createKnowledgeItem({
        businessId,
        knowledgeBaseId: base.knowledgeBaseId,
        category: "CUSTOM",
        title: `filler-${i}-${randomUUID().slice(0, 4)}`,
        content: `filler ${i}`,
        isActive: true,
      });
    }

    const s1 = await seedReviewSession({
      businessId,
      userId,
      proposals: [
        {
          action: "CREATE",
          category: "CUSTOM",
          title: `quota-a-${randomUUID().slice(0, 6)}`,
          content: "quota race a",
        },
      ],
    });
    const s2 = await seedReviewSession({
      businessId,
      userId,
      proposals: [
        {
          action: "CREATE",
          category: "CUSTOM",
          title: `quota-b-${randomUUID().slice(0, 6)}`,
          content: "quota race b",
        },
        {
          action: "CREATE",
          category: "CUSTOM",
          title: `quota-c-${randomUUID().slice(0, 6)}`,
          content: "quota race c",
        },
      ],
    });

    const outcomes = await Promise.allSettled([
      applyKnowledgeIngest({
        businessId,
        userId,
        sessionId: s1.session.sessionId,
      }),
      applyKnowledgeIngest({
        businessId,
        userId,
        sessionId: s2.session.sessionId,
      }),
    ]);

    const fulfilled = outcomes.filter((o) => o.status === "fulfilled");
    const rejected = outcomes.filter((o) => o.status === "rejected");
    // One may succeed (1 create → 50), the other must fail quota (would exceed).
    expect(fulfilled.length + rejected.length).toBe(2);
    expect(rejected.length).toBeGreaterThanOrEqual(1);

    const active = await query<{ Cnt: number }>(
      `SELECT COUNT(1) AS Cnt FROM TblKnowledgeItem
       WHERE BusinessID = @businessId AND IsActive = 1`,
      [{ name: "businessId", type: sql.UniqueIdentifier, value: businessId }],
    );
    expect(Number(active.recordset[0]?.Cnt ?? 0)).toBeLessThanOrEqual(50);
  });
});
