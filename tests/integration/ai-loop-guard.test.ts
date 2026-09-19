import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { closePool, getDbConfig, getPool, query, sql } from "@/lib/db";
import {
  claimNextJob,
  completeJob,
  countRecentSentAiJobs,
  findPendingJobForConversation,
  getConversationGuard,
  getJob,
  LOOP_GUARD_MAX_SENT,
  LOOP_GUARD_PAUSE_MS,
  LOOP_GUARD_WINDOW_MS,
  processAiReplyJob,
  upsertConversationPause,
  upsertWhatsAppAiSetting,
} from "@/modules/ai";
import { signup } from "@/modules/auth/service";
import { createChannelConnectionShell } from "@/modules/channels/service";
import { generateWhatsAppAccountKey } from "@/modules/channels/account-key";
import { ingestWhatsAppInbound } from "@/modules/messaging/service";
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
  : "DB_* env not configured — AI loop-guard suite skipped";

function requireDb(skip: (reason?: string) => never): void {
  if (dbSkipReason) skip(dbSkipReason);
}

describe("Phase 3B Part 1.3 AI loop guard", () => {
  let businessId = "";
  let agentId = "";
  let accountKey = "";
  let businessBId = "";

  beforeAll(async () => {
    if (dbSkipReason) {
      console.warn(`[ai-loop-guard] ${dbSkipReason}`);
      return;
    }
    try {
      await getPool();
    } catch (error) {
      rethrowDbBootstrapFailure(error);
    }

    clearTestCookies();
    const suffix = randomUUID().slice(0, 8);
    const a = await signup({
      email: `guard-a-${suffix}@example.com`,
      password: "Password123!",
      fullName: "Guard Tenant A",
    });
    const onboardA = await completeOnboarding({
      userId: a.user.userId,
      sessionId: a.session.sessionId,
      business: {
        name: `Guard Biz A ${suffix}`,
        category: "clinic",
        countryCode: "SA",
        locale: "ar-SA",
        timezone: "Asia/Riyadh",
      },
      location: { name: "Loc A", city: "Riyadh" },
      agent: {
        name: "Agent A",
        roleTitle: "Receptionist",
        language: "ar",
        dialect: "egyptian",
      },
    });
    businessId = onboardA.business.businessId;
    agentId = onboardA.agent.agentId;
    accountKey = generateWhatsAppAccountKey();
    await createChannelConnectionShell({
      businessId,
      channel: "WHATSAPP",
      provider: "BAILEYS",
      externalAccountKey: accountKey,
      status: "ACTIVE",
      isActive: true,
    });

    clearTestCookies();
    const b = await signup({
      email: `guard-b-${suffix}@example.com`,
      password: "Password123!",
      fullName: "Guard Tenant B",
    });
    const onboardB = await completeOnboarding({
      userId: b.user.userId,
      sessionId: b.session.sessionId,
      business: {
        name: `Guard Biz B ${suffix}`,
        category: "clinic",
        countryCode: "SA",
        locale: "ar-SA",
        timezone: "Asia/Riyadh",
      },
      location: { name: "Loc B", city: "Jeddah" },
      agent: {
        name: "Agent B",
        roleTitle: "Receptionist",
        language: "ar",
      },
    });
    businessBId = onboardB.business.businessId;
  }, 120_000);

  afterAll(async () => {
    await closePool().catch(() => undefined);
  });

  function dto(overrides: Record<string, unknown> = {}) {
    return {
      accountKey,
      provider: "baileys" as const,
      providerMessageId: `lg-${randomUUID()}`,
      externalContactKey: "201555610001@s.whatsapp.net",
      fromMe: false,
      isGroup: false,
      upsertType: "notify",
      content: "مرحبا",
      messageTimestamp: Math.floor(Date.now() / 1000),
      receivedAt: new Date().toISOString(),
      ...overrides,
    };
  }

  async function enableAi(debounceMs = 50) {
    await upsertWhatsAppAiSetting({
      businessId,
      agentId,
      autoReplyEnabled: true,
      debounceMs,
    });
  }

  async function forceDue(conversationId: string) {
    await query(
      `UPDATE TblAiReplyJob SET NotBeforeUtc = DATEADD(second, -1, SYSUTCDATETIME())
       WHERE BusinessID = @businessId AND ConversationID = @conversationId AND Status = N'PENDING'`,
      [
        { name: "businessId", type: sql.UniqueIdentifier, value: businessId },
        {
          name: "conversationId",
          type: sql.UniqueIdentifier,
          value: conversationId,
        },
      ],
    );
  }

  async function clearPendingJobs() {
    await query(
      `UPDATE TblAiReplyJob
       SET Status = N'SKIPPED',
           LastErrorCode = N'TEST_CLEANUP',
           CompletedAtUtc = SYSUTCDATETIME(),
           LeaseUntilUtc = NULL,
           UpdatedAtUtc = SYSUTCDATETIME()
       WHERE BusinessID = @businessId
         AND Status IN (N'PENDING', N'PROCESSING')`,
      [{ name: "businessId", type: sql.UniqueIdentifier, value: businessId }],
    );
  }

  async function claimJobForConversation(conversationId: string) {
    await forceDue(conversationId);
    for (let i = 0; i < 20; i++) {
      const job = await claimNextJob({ businessId, leaseSeconds: 30 });
      if (!job) return null;
      if (job.conversationId.toLowerCase() === conversationId.toLowerCase()) {
        return job;
      }
      await completeJob({
        businessId,
        jobId: job.aiReplyJobId,
        status: "SKIPPED",
        errorCode: "TEST_WRONG_CONVERSATION",
      });
      await forceDue(conversationId);
    }
    return null;
  }

  async function runSentCycle(params: {
    externalContactKey: string;
    content: string;
    sendMock?: ReturnType<typeof vi.fn>;
    providerMock?: {
      generateReply: () => Promise<{ text: string; model: string; latencyMs: number }>;
    };
  }) {
    const sendMock =
      params.sendMock
      ?? vi.fn().mockResolvedValue({
        success: true,
        messageId: `wa-out-${randomUUID()}`,
      });
    const provider =
      params.providerMock
      ?? {
        async generateReply() {
          return { text: "رد آلي", model: "mock", latencyMs: 1 };
        },
      };

    const accepted = await ingestWhatsAppInbound(
      dto({
        content: params.content,
        providerMessageId: `cycle-${randomUUID()}`,
        externalContactKey: params.externalContactKey,
      }),
    );
    expect(accepted.outcome).toBe("accepted");
    if (accepted.outcome !== "accepted") {
      throw new Error("ingest failed");
    }
    const job = await claimJobForConversation(accepted.conversationId);
    expect(job).toBeTruthy();
    const result = await processAiReplyJob({
      job: job!,
      sendMessage: sendMock as never,
      provider,
      logger: { info() {}, warn() {} },
    });
    expect(result.status).toBe("SENT");
    return { accepted, job: job!, sendMock, result };
  }

  it("policy constants", () => {
    expect(LOOP_GUARD_MAX_SENT).toBe(3);
    expect(LOOP_GUARD_WINDOW_MS).toBe(60_000);
    expect(LOOP_GUARD_PAUSE_MS).toBe(10 * 60 * 1000);
  });

  it("1/2/3/4/5/6/7 bot-to-bot simulation stops on 4th cycle", async ({
    skip,
  }) => {
    requireDb(skip);
    await enableAi(50);
    const contact = `20155562${String(Date.now()).slice(-6)}@s.whatsapp.net`;
    const sendMock = vi.fn().mockResolvedValue({
      success: true,
      messageId: `wa-out-${randomUUID()}`,
    });
    const genMock = vi.fn().mockResolvedValue({
      text: "رد آلي",
      model: "mock",
      latencyMs: 1,
    });

    for (let i = 1; i <= LOOP_GUARD_MAX_SENT; i++) {
      await runSentCycle({
        externalContactKey: contact,
        content: `cycle-${i}`,
        sendMock,
        providerMock: { generateReply: genMock },
      });
    }

    expect(sendMock).toHaveBeenCalledTimes(LOOP_GUARD_MAX_SENT);
    expect(genMock).toHaveBeenCalledTimes(LOOP_GUARD_MAX_SENT);

    const fourth = await ingestWhatsAppInbound(
      dto({
        content: "fourth should stop",
        providerMessageId: `fourth-${randomUUID()}`,
        externalContactKey: contact,
      }),
    );
    expect(fourth.outcome).toBe("accepted");
    if (fourth.outcome !== "accepted") return;

    const pending = await findPendingJobForConversation({
      businessId,
      conversationId: fourth.conversationId,
    });
    expect(pending).toBeNull();

    const guard = await getConversationGuard({
      businessId,
      conversationId: fourth.conversationId,
    });
    expect(guard?.pauseReason).toBe("BOT_LOOP_GUARD");
    expect(guard?.pausedUntilUtc).toBeTruthy();
    expect(guard!.pausedUntilUtc!.getTime()).toBeGreaterThan(Date.now());

    expect(genMock).toHaveBeenCalledTimes(LOOP_GUARD_MAX_SENT);
    expect(sendMock).toHaveBeenCalledTimes(LOOP_GUARD_MAX_SENT);

    const sentCount = await countRecentSentAiJobs({
      businessId,
      conversationId: fourth.conversationId,
    });
    expect(sentCount).toBe(LOOP_GUARD_MAX_SENT);
  });

  it("8/9/10. guard scoped to conversation and business", async ({ skip }) => {
    requireDb(skip);
    await enableAi(50);
    const contactA = `20155563${String(Date.now()).slice(-5)}1@s.whatsapp.net`;
    const contactB = `20155563${String(Date.now()).slice(-5)}2@s.whatsapp.net`;

    for (let i = 0; i < LOOP_GUARD_MAX_SENT; i++) {
      await runSentCycle({
        externalContactKey: contactA,
        content: `a-${i}`,
      });
    }
    const blocked = await ingestWhatsAppInbound(
      dto({
        content: "blocked",
        providerMessageId: `blk-${randomUUID()}`,
        externalContactKey: contactA,
      }),
    );
    expect(blocked.outcome).toBe("accepted");
    if (blocked.outcome !== "accepted") return;
    expect(
      await findPendingJobForConversation({
        businessId,
        conversationId: blocked.conversationId,
      }),
    ).toBeNull();

    const other = await runSentCycle({
      externalContactKey: contactB,
      content: "other-conversation-ok",
    });
    expect(other.result.status).toBe("SENT");
    expect(other.accepted.conversationId).not.toBe(blocked.conversationId);

    const guardB = await getConversationGuard({
      businessId: businessBId,
      conversationId: blocked.conversationId,
    });
    expect(guardB).toBeNull();
  });

  it("11/12. pause survives and expires for scheduling", async ({ skip }) => {
    requireDb(skip);
    await enableAi(50);
    await clearPendingJobs();
    const contact = `20155564${String(Date.now()).slice(-6)}@s.whatsapp.net`;
    const first = await ingestWhatsAppInbound(
      dto({
        content: "seed",
        providerMessageId: `seed-${randomUUID()}`,
        externalContactKey: contact,
      }),
    );
    expect(first.outcome).toBe("accepted");
    if (first.outcome !== "accepted") return;

    await clearPendingJobs();
    await upsertConversationPause({
      businessId,
      conversationId: first.conversationId,
      pauseSeconds: 600,
    });
    const whilePaused = await ingestWhatsAppInbound(
      dto({
        content: "while paused",
        providerMessageId: `wp-${randomUUID()}`,
        externalContactKey: contact,
      }),
    );
    expect(whilePaused.outcome).toBe("accepted");
    expect(
      await findPendingJobForConversation({
        businessId,
        conversationId: first.conversationId,
      }),
    ).toBeNull();

    const persisted = await getConversationGuard({
      businessId,
      conversationId: first.conversationId,
    });
    expect(persisted?.pausedUntilUtc).toBeTruthy();

    await query(
      `UPDATE TblAiConversationGuard
       SET PausedUntilUtc = DATEADD(second, -1, SYSUTCDATETIME()),
           UpdatedAtUtc = SYSUTCDATETIME()
       WHERE BusinessID = @businessId AND ConversationID = @conversationId`,
      [
        { name: "businessId", type: sql.UniqueIdentifier, value: businessId },
        {
          name: "conversationId",
          type: sql.UniqueIdentifier,
          value: first.conversationId,
        },
      ],
    );

    const afterExpiry = await ingestWhatsAppInbound(
      dto({
        content: "after expiry",
        providerMessageId: `ae-${randomUUID()}`,
        externalContactKey: contact,
      }),
    );
    expect(afterExpiry.outcome).toBe("accepted");
    if (afterExpiry.outcome !== "accepted") return;
    expect(
      await findPendingJobForConversation({
        businessId,
        conversationId: afterExpiry.conversationId,
      }),
    ).toBeTruthy();
  });

  it("13/14/15/16. only recent SENT jobs count", async ({ skip }) => {
    requireDb(skip);
    await enableAi(50);
    await clearPendingJobs();
    const contact = `20155565${String(Date.now()).slice(-6)}@s.whatsapp.net`;
    const accepted = await ingestWhatsAppInbound(
      dto({
        content: "count-base",
        providerMessageId: `cb-${randomUUID()}`,
        externalContactKey: contact,
      }),
    );
    expect(accepted.outcome).toBe("accepted");
    if (accepted.outcome !== "accepted") return;
    const job = await claimJobForConversation(accepted.conversationId);
    expect(job).toBeTruthy();

    await completeJob({
      businessId,
      jobId: job!.aiReplyJobId,
      status: "FAILED",
      errorCode: "TEST_FAILED",
    });
    await query(
      `INSERT INTO TblAiReplyJob (
         AiReplyJobID, BusinessID, ChannelConnectionID, ConversationID, ContactID,
         TriggerMessageID, Status, NotBeforeUtc, AttemptCount,
         CompletedAtUtc, CreatedAtUtc, UpdatedAtUtc
       )
       SELECT NEWID(), BusinessID, ChannelConnectionID, ConversationID, ContactID,
              TriggerMessageID, N'SKIPPED', SYSUTCDATETIME(), 0,
              SYSUTCDATETIME(), SYSUTCDATETIME(), SYSUTCDATETIME()
       FROM TblAiReplyJob WHERE AiReplyJobID = @jobId`,
      [{ name: "jobId", type: sql.UniqueIdentifier, value: job!.aiReplyJobId }],
    );
    await query(
      `INSERT INTO TblAiReplyJob (
         AiReplyJobID, BusinessID, ChannelConnectionID, ConversationID, ContactID,
         TriggerMessageID, Status, NotBeforeUtc, AttemptCount,
         CreatedAtUtc, UpdatedAtUtc
       )
       SELECT NEWID(), BusinessID, ChannelConnectionID, ConversationID, ContactID,
              TriggerMessageID, N'PENDING', DATEADD(minute, 10, SYSUTCDATETIME()), 0,
              SYSUTCDATETIME(), SYSUTCDATETIME()
       FROM TblAiReplyJob WHERE AiReplyJobID = @jobId`,
      [{ name: "jobId", type: sql.UniqueIdentifier, value: job!.aiReplyJobId }],
    );
    await query(
      `INSERT INTO TblAiReplyJob (
         AiReplyJobID, BusinessID, ChannelConnectionID, ConversationID, ContactID,
         TriggerMessageID, Status, NotBeforeUtc, AttemptCount,
         CompletedAtUtc, CreatedAtUtc, UpdatedAtUtc
       )
       SELECT NEWID(), BusinessID, ChannelConnectionID, ConversationID, ContactID,
              TriggerMessageID, N'SENT', SYSUTCDATETIME(), 0,
              DATEADD(second, -120, SYSUTCDATETIME()), SYSUTCDATETIME(), SYSUTCDATETIME()
       FROM TblAiReplyJob WHERE AiReplyJobID = @jobId`,
      [{ name: "jobId", type: sql.UniqueIdentifier, value: job!.aiReplyJobId }],
    );

    const count = await countRecentSentAiJobs({
      businessId,
      conversationId: accepted.conversationId,
    });
    expect(count).toBe(0);

    await query(
      `UPDATE TblAiReplyJob SET Status = N'COALESCED', CompletedAtUtc = SYSUTCDATETIME()
       WHERE BusinessID = @businessId AND ConversationID = @conversationId AND Status = N'PENDING'`,
      [
        { name: "businessId", type: sql.UniqueIdentifier, value: businessId },
        {
          name: "conversationId",
          type: sql.UniqueIdentifier,
          value: accepted.conversationId,
        },
      ],
    );

    const stillSchedules = await ingestWhatsAppInbound(
      dto({
        content: "still ok",
        providerMessageId: `ok-${randomUUID()}`,
        externalContactKey: contact,
      }),
    );
    expect(stillSchedules.outcome).toBe("accepted");
    if (stillSchedules.outcome !== "accepted") return;
    expect(
      await findPendingJobForConversation({
        businessId,
        conversationId: stillSchedules.conversationId,
      }),
    ).toBeTruthy();
  });

  it("17/18. disable while Gemini in progress prevents send", async ({
    skip,
  }) => {
    requireDb(skip);
    await enableAi(50);
    await clearPendingJobs();
    const contact = `20155566${String(Date.now()).slice(-6)}@s.whatsapp.net`;
    const accepted = await ingestWhatsAppInbound(
      dto({
        content: "mid-gen disable",
        providerMessageId: `mg-${randomUUID()}`,
        externalContactKey: contact,
      }),
    );
    expect(accepted.outcome).toBe("accepted");
    if (accepted.outcome !== "accepted") return;
    const job = await claimJobForConversation(accepted.conversationId);
    expect(job).toBeTruthy();

    let release!: (value: { text: string; model: string; latencyMs: number }) => void;
    const gate = new Promise<{ text: string; model: string; latencyMs: number }>(
      (resolve) => {
        release = resolve;
      },
    );
    const sendMock = vi.fn();
    const processing = processAiReplyJob({
      job: job!,
      sendMessage: sendMock as never,
      provider: {
        async generateReply() {
          return gate;
        },
      },
      logger: { info() {}, warn() {} },
    });

    await upsertWhatsAppAiSetting({
      businessId,
      agentId,
      autoReplyEnabled: false,
    });
    release({ text: "should not send", model: "mock", latencyMs: 5 });
    const result = await processing;
    expect(result.status).toBe("SKIPPED");
    expect(result.errorCode).toBe("AI_DISABLED_BEFORE_SEND");
    expect(sendMock).not.toHaveBeenCalled();
    const stored = await getJob({ businessId, jobId: job!.aiReplyJobId });
    expect(stored?.status).toBe("SKIPPED");
    expect(stored?.lastErrorCode).toBe("AI_DISABLED_BEFORE_SEND");
  });

  it("19/20. disable→enable marks old job STALE_ACTIVATION", async ({
    skip,
  }) => {
    requireDb(skip);
    await enableAi(50);
    await clearPendingJobs();
    const contact = `20155567${String(Date.now()).slice(-6)}@s.whatsapp.net`;
    const accepted = await ingestWhatsAppInbound(
      dto({
        content: "stale job",
        providerMessageId: `st-${randomUUID()}`,
        externalContactKey: contact,
      }),
    );
    expect(accepted.outcome).toBe("accepted");
    if (accepted.outcome !== "accepted") return;
    const job = await claimJobForConversation(accepted.conversationId);
    expect(job).toBeTruthy();

    await upsertWhatsAppAiSetting({
      businessId,
      agentId,
      autoReplyEnabled: false,
    });
    await new Promise((r) => setTimeout(r, 20));
    await upsertWhatsAppAiSetting({
      businessId,
      agentId,
      autoReplyEnabled: true,
      debounceMs: 50,
    });

    const sendMock = vi.fn();
    const result = await processAiReplyJob({
      job: job!,
      sendMessage: sendMock as never,
      provider: {
        async generateReply() {
          return { text: "stale", model: "mock", latencyMs: 1 };
        },
      },
      logger: { info() {}, warn() {} },
    });
    expect(result.status).toBe("SKIPPED");
    expect(result.errorCode).toBe("STALE_ACTIVATION");
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("21. guard triggered while PROCESSING prevents send", async ({ skip }) => {
    requireDb(skip);
    await enableAi(50);
    await clearPendingJobs();
    const contact = `20155568${String(Date.now()).slice(-6)}@s.whatsapp.net`;
    const accepted = await ingestWhatsAppInbound(
      dto({
        content: "processing guard",
        providerMessageId: `pg-${randomUUID()}`,
        externalContactKey: contact,
      }),
    );
    expect(accepted.outcome).toBe("accepted");
    if (accepted.outcome !== "accepted") return;
    const job = await claimJobForConversation(accepted.conversationId);
    expect(job).toBeTruthy();

    await upsertConversationPause({
      businessId,
      conversationId: accepted.conversationId,
    });

    const sendMock = vi.fn();
    const result = await processAiReplyJob({
      job: job!,
      sendMessage: sendMock as never,
      provider: {
        async generateReply() {
          return { text: "blocked by guard", model: "mock", latencyMs: 1 };
        },
      },
      logger: { info() {}, warn() {} },
    });
    expect(result.status).toBe("SKIPPED");
    expect(result.errorCode).toBe("LOOP_GUARD_ACTIVE");
    expect(sendMock).not.toHaveBeenCalled();
  });
});
