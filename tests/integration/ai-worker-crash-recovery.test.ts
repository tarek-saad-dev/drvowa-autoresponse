import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { closePool, getDbConfig, getPool, query, sql } from "@/lib/db";
import {
  assertJobLeaseOwned,
  claimNextJob,
  completeJob,
  extendLease,
  getJob,
  persistGeneratedReply,
  processAiReplyJob,
  recordAmbiguousOutbound,
  upsertWhatsAppAiSetting,
} from "@/modules/ai";
import { AiJobLeaseLostError } from "@/modules/ai/lease";
import { signup } from "@/modules/auth/service";
import { createChannelConnectionShell } from "@/modules/channels/service";
import { generateWhatsAppAccountKey } from "@/modules/channels/account-key";
import * as messagingRepo from "@/modules/messaging/repository";
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
  : "DB_* env not configured — AI crash recovery suite skipped";

function requireDb(skip: (reason?: string) => never): void {
  if (dbSkipReason) skip(dbSkipReason);
}

describe("M6 AI worker crash / lease recovery matrix", () => {
  let businessId = "";
  let agentId = "";
  let accountKey = "";

  beforeAll(async () => {
    if (dbSkipReason) {
      console.warn(`[ai-crash-recovery] ${dbSkipReason}`);
      return;
    }
    try {
      await getPool();
    } catch (error) {
      rethrowDbBootstrapFailure(error);
    }

    clearTestCookies();
    const suffix = randomUUID().slice(0, 8);
    const user = await signup({
      email: `ai-crash-${suffix}@example.com`,
      password: "Password123!",
      fullName: "AI Crash Tenant",
    });
    const onboard = await completeOnboarding({
      userId: user.user.userId,
      sessionId: user.session.sessionId,
      business: {
        name: `AI Crash Biz ${suffix}`,
        category: "clinic",
        countryCode: "SA",
        locale: "ar-SA",
        timezone: "Asia/Riyadh",
      },
      location: { name: "Loc", city: "Riyadh" },
      agent: {
        name: "Agent Crash",
        roleTitle: "Receptionist",
        language: "ar",
        dialect: "egyptian",
      },
    });
    businessId = onboard.business.businessId;
    agentId = onboard.agent.agentId;
    accountKey = generateWhatsAppAccountKey();
    await createChannelConnectionShell({
      businessId,
      channel: "WHATSAPP",
      provider: "BAILEYS",
      externalAccountKey: accountKey,
      status: "ACTIVE",
      isActive: true,
    });
    await upsertWhatsAppAiSetting({
      businessId,
      agentId,
      autoReplyEnabled: true,
      debounceMs: 50,
    });
  }, 120_000);

  afterAll(async () => {
    await closePool().catch(() => undefined);
  });

  function dto(overrides: Record<string, unknown> = {}) {
    return {
      accountKey,
      provider: "baileys" as const,
      providerMessageId: `crash-${randomUUID()}`,
      externalContactKey: "201555700100@s.whatsapp.net",
      fromMe: false,
      isGroup: false,
      upsertType: "notify",
      content: "مرحبا",
      messageTimestamp: Math.floor(Date.now() / 1000),
      receivedAt: new Date().toISOString(),
      ...overrides,
    };
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

  async function clearOpenJobs() {
    await query(
      `UPDATE TblAiReplyJob
       SET Status = N'SKIPPED',
           LastErrorCode = N'TEST_CLEANUP',
           CompletedAtUtc = SYSUTCDATETIME(),
           LeaseUntilUtc = NULL,
           LeaseToken = NULL,
           LeaseOwner = NULL,
           UpdatedAtUtc = SYSUTCDATETIME()
       WHERE BusinessID = @businessId
         AND Status IN (N'PENDING', N'PROCESSING')`,
      [{ name: "businessId", type: sql.UniqueIdentifier, value: businessId }],
    );
  }

  async function claimForConversation(conversationId: string, leaseSeconds = 30) {
    await forceDue(conversationId);
    for (let i = 0; i < 25; i++) {
      const job = await claimNextJob({ businessId, leaseSeconds, workerId: `w-a-${i}` });
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

  async function expireLease(jobId: string) {
    await query(
      `UPDATE TblAiReplyJob
       SET LeaseUntilUtc = DATEADD(second, -30, SYSUTCDATETIME()),
           UpdatedAtUtc = SYSUTCDATETIME()
       WHERE BusinessID = @businessId AND AiReplyJobID = @jobId`,
      [
        { name: "businessId", type: sql.UniqueIdentifier, value: businessId },
        { name: "jobId", type: sql.UniqueIdentifier, value: jobId },
      ],
    );
  }

  async function countOutbound(conversationId: string) {
    const r = await query<{ Cnt: number }>(
      `SELECT COUNT(1) AS Cnt FROM TblMessage
       WHERE BusinessID = @businessId AND ConversationID = @conversationId
         AND Direction = N'OUTBOUND'`,
      [
        { name: "businessId", type: sql.UniqueIdentifier, value: businessId },
        {
          name: "conversationId",
          type: sql.UniqueIdentifier,
          value: conversationId,
        },
      ],
    );
    return Number(r.recordset[0]?.Cnt ?? 0);
  }

  async function usageCounts() {
    return {
      ai: await messagingRepo.countUsageEvents({
        businessId,
        eventType: "AI_REPLY_GENERATED",
      }),
      wa: await messagingRepo.countUsageEvents({
        businessId,
        eventType: "WHATSAPP_OUTBOUND_MESSAGE",
      }),
    };
  }

  it("A. crash after claim before generation → reclaim rotates token", async ({ skip }) => {
    requireDb(skip);
    await clearOpenJobs();
    const accepted = await ingestWhatsAppInbound(
      dto({
        content: "crash-a",
        externalContactKey: "201555700101@s.whatsapp.net",
      }),
    );
    expect(accepted.outcome).toBe("accepted");
    if (accepted.outcome !== "accepted") return;

    const jobA = await claimForConversation(accepted.conversationId, 1);
    expect(jobA).toBeTruthy();
    const tokenA = jobA!.leaseToken!;
    const versionA = jobA!.leaseVersion;
    const unknownBefore = jobA!.outboundUnknownCount;

    await expireLease(jobA!.aiReplyJobId);
    const jobB = await claimNextJob({
      businessId,
      leaseSeconds: 30,
      workerId: "w-b-reclaim",
    });
    expect(jobB?.aiReplyJobId).toBe(jobA!.aiReplyJobId);
    expect(jobB!.leaseToken).not.toBe(tokenA);
    expect(jobB!.leaseVersion).toBeGreaterThan(versionA);
    expect(jobB!.outboundUnknownCount).toBe(unknownBefore);

    await expect(
      assertJobLeaseOwned({
        businessId,
        jobId: jobA!.aiReplyJobId,
        leaseToken: tokenA,
      }),
    ).rejects.toBeInstanceOf(AiJobLeaseLostError);

    await completeJob({
      businessId,
      jobId: jobB!.aiReplyJobId,
      status: "SKIPPED",
      errorCode: "TEST_CLEANUP",
      leaseToken: jobB!.leaseToken,
    });
  });

  it("B/C. crash before vs after GeneratedReplyText persist", async ({ skip }) => {
    requireDb(skip);
    await clearOpenJobs();

    // B: expire before persist → Gemini may run again
    const acceptedB = await ingestWhatsAppInbound(
      dto({
        content: "crash-b",
        externalContactKey: "201555700102@s.whatsapp.net",
      }),
    );
    expect(acceptedB.outcome).toBe("accepted");
    if (acceptedB.outcome !== "accepted") return;
    const jobB1 = await claimForConversation(acceptedB.conversationId, 1);
    expect(jobB1).toBeTruthy();
    expect(jobB1!.generatedReplyText).toBeFalsy();
    await expireLease(jobB1!.aiReplyJobId);
    const jobB2 = await claimNextJob({
      businessId,
      leaseSeconds: 30,
      workerId: "w-b2",
    });
    expect(jobB2?.aiReplyJobId).toBe(jobB1!.aiReplyJobId);
    expect(jobB2!.generatedReplyText).toBeFalsy();

    let geminiB = 0;
    const resultB = await processAiReplyJob({
      job: jobB2!,
      sendMessage: vi.fn().mockResolvedValue({
        success: true,
        messageId: `wa-b-${randomUUID()}`,
      }),
      provider: {
        async generateReply() {
          geminiB += 1;
          return { text: "رد B", model: "mock", latencyMs: 1 };
        },
      },
      logger: { info() {}, warn() {} },
    });
    expect(resultB.status).toBe("SENT");
    expect(geminiB).toBe(1);

    // C: persist then expire → Gemini must NOT run again
    await clearOpenJobs();
    const acceptedC = await ingestWhatsAppInbound(
      dto({
        content: "crash-c",
        externalContactKey: "201555700103@s.whatsapp.net",
      }),
    );
    expect(acceptedC.outcome).toBe("accepted");
    if (acceptedC.outcome !== "accepted") return;
    const jobC1 = await claimForConversation(acceptedC.conversationId, 30);
    expect(jobC1).toBeTruthy();
    await persistGeneratedReply({
      businessId,
      jobId: jobC1!.aiReplyJobId,
      replyText: "رد محفوظ",
      model: "mock-c",
      leaseToken: jobC1!.leaseToken,
    });
    await expireLease(jobC1!.aiReplyJobId);
    const jobC2 = await claimNextJob({
      businessId,
      leaseSeconds: 30,
      workerId: "w-c2",
    });
    expect(jobC2?.aiReplyJobId).toBe(jobC1!.aiReplyJobId);
    expect(jobC2!.generatedReplyText).toBe("رد محفوظ");

    let geminiC = 0;
    const resultC = await processAiReplyJob({
      job: jobC2!,
      sendMessage: vi.fn().mockResolvedValue({
        success: true,
        messageId: `wa-c-${randomUUID()}`,
      }),
      provider: {
        async generateReply() {
          geminiC += 1;
          return { text: "should-not", model: "mock", latencyMs: 1 };
        },
      },
      logger: { info() {}, warn() {} },
    });
    expect(resultC.status).toBe("SENT");
    expect(geminiC).toBe(0);
  });

  it("D/E/F. pre-send crash + lost HTTP ACK recover via same ai:<jobId>", async ({ skip }) => {
    requireDb(skip);
    await clearOpenJobs();
    const accepted = await ingestWhatsAppInbound(
      dto({
        content: "crash-def",
        externalContactKey: "201555700104@s.whatsapp.net",
      }),
    );
    expect(accepted.outcome).toBe("accepted");
    if (accepted.outcome !== "accepted") return;

    const jobA = await claimForConversation(accepted.conversationId, 30);
    expect(jobA).toBeTruthy();
    await persistGeneratedReply({
      businessId,
      jobId: jobA!.aiReplyJobId,
      replyText: "رد DEF",
      model: "mock",
      leaseToken: jobA!.leaseToken,
    });

    // D: crash immediately before send → new owner sends same key
    await expireLease(jobA!.aiReplyJobId);
    const jobB = await claimNextJob({
      businessId,
      leaseSeconds: 30,
      workerId: "w-def-b",
    });
    expect(jobB?.aiReplyJobId).toBe(jobA!.aiReplyJobId);

    const providerMessageId = `wa-def-${randomUUID()}`;
    const sendMock = vi.fn().mockResolvedValue({
      success: true,
      status: "sent",
      messageId: providerMessageId,
    });
    const sent = await processAiReplyJob({
      job: jobB!,
      sendMessage: sendMock,
      provider: {
        async generateReply() {
          throw new Error("must reuse");
        },
      },
      logger: { info() {}, warn() {} },
    });
    expect(sent.status).toBe("SENT");
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: `ai:${jobA!.aiReplyJobId}`,
      }),
    );

    // E/F style: second recovery with duplicate ACK must not double-bill
    await clearOpenJobs();
    const accepted2 = await ingestWhatsAppInbound(
      dto({
        content: "crash-ef",
        externalContactKey: "201555700105@s.whatsapp.net",
      }),
    );
    expect(accepted2.outcome).toBe("accepted");
    if (accepted2.outcome !== "accepted") return;
    const jobE1 = await claimForConversation(accepted2.conversationId, 30);
    expect(jobE1).toBeTruthy();
    await persistGeneratedReply({
      businessId,
      jobId: jobE1!.aiReplyJobId,
      replyText: "رد EF",
      model: "mock",
      leaseToken: jobE1!.leaseToken,
    });
    const jobE1Ready = await getJob({ businessId, jobId: jobE1!.aiReplyJobId });
    expect(jobE1Ready?.generatedReplyText).toBe("رد EF");
    const pmid = `wa-ef-${randomUUID()}`;
    const beforeUsage = await usageCounts();
    const beforeOut = await countOutbound(accepted2.conversationId);

    // First owner "sends" then lease lost before finalize
    let jobE2: Awaited<ReturnType<typeof claimNextJob>> = null;
    const resultLost = await processAiReplyJob({
      job: jobE1Ready!,
      sendMessage: async (args) => {
        expect(args.idempotencyKey).toBe(`ai:${jobE1!.aiReplyJobId}`);
        await expireLease(jobE1!.aiReplyJobId);
        jobE2 = await claimNextJob({
          businessId,
          leaseSeconds: 30,
          workerId: "w-ef-b",
        });
        expect(jobE2?.aiReplyJobId).toBe(jobE1!.aiReplyJobId);
        return { success: true, status: "sent", messageId: pmid };
      },
      provider: {
        async generateReply() {
          throw new Error("must reuse");
        },
      },
      logger: { info() {}, warn() {} },
    });
    expect(resultLost.status).toBe("LEASE_LOST");
    expect(await countOutbound(accepted2.conversationId)).toBe(beforeOut);
    const midUsage = await usageCounts();
    expect(midUsage.ai).toBe(beforeUsage.ai);
    expect(midUsage.wa).toBe(beforeUsage.wa);

    expect(jobE2).toBeTruthy();
    const resultSent = await processAiReplyJob({
      job: jobE2!,
      sendMessage: vi.fn().mockResolvedValue({
        success: true,
        status: "duplicate",
        messageId: pmid,
        originalMessageId: pmid,
      }),
      provider: {
        async generateReply() {
          throw new Error("must reuse");
        },
      },
      logger: { info() {}, warn() {} },
    });
    expect(resultSent.status).toBe("SENT");
    expect(await countOutbound(accepted2.conversationId)).toBe(beforeOut + 1);
    const afterUsage = await usageCounts();
    expect(afterUsage.ai).toBe(beforeUsage.ai + 1);
    expect(afterUsage.wa).toBe(beforeUsage.wa + 1);
  });

  it("G. stale worker after reclaim cannot persist/complete/finalize", async ({ skip }) => {
    requireDb(skip);
    await clearOpenJobs();
    const accepted = await ingestWhatsAppInbound(
      dto({
        content: "crash-g",
        externalContactKey: "201555700106@s.whatsapp.net",
      }),
    );
    expect(accepted.outcome).toBe("accepted");
    if (accepted.outcome !== "accepted") return;
    const jobA = await claimForConversation(accepted.conversationId, 1);
    expect(jobA).toBeTruthy();
    const tokenA = jobA!.leaseToken!;
    await expireLease(jobA!.aiReplyJobId);
    const jobB = await claimNextJob({
      businessId,
      leaseSeconds: 30,
      workerId: "w-g-b",
    });
    expect(jobB?.aiReplyJobId).toBe(jobA!.aiReplyJobId);

    await expect(
      persistGeneratedReply({
        businessId,
        jobId: jobA!.aiReplyJobId,
        replyText: "stale",
        model: "x",
        leaseToken: tokenA,
      }),
    ).rejects.toBeInstanceOf(AiJobLeaseLostError);

    await expect(
      completeJob({
        businessId,
        jobId: jobA!.aiReplyJobId,
        status: "SENT",
        leaseToken: tokenA,
      }),
    ).rejects.toBeInstanceOf(AiJobLeaseLostError);

    const stored = await getJob({ businessId, jobId: jobA!.aiReplyJobId });
    expect(stored?.status).toBe("PROCESSING");
    expect(stored?.generatedReplyText).toBeFalsy();

    await completeJob({
      businessId,
      jobId: jobB!.aiReplyJobId,
      status: "SKIPPED",
      errorCode: "TEST_CLEANUP",
      leaseToken: jobB!.leaseToken,
    });
  });

  it("H/I. unknown defer relinquishes token; third unknown TX atomic", async ({ skip }) => {
    requireDb(skip);
    await clearOpenJobs();
    const accepted = await ingestWhatsAppInbound(
      dto({
        content: "crash-hi",
        externalContactKey: "201555700107@s.whatsapp.net",
      }),
    );
    expect(accepted.outcome).toBe("accepted");
    if (accepted.outcome !== "accepted") return;
    const job = await claimForConversation(accepted.conversationId, 30);
    expect(job).toBeTruthy();
    const token1 = job!.leaseToken!;

    const d1 = await recordAmbiguousOutbound({
      businessId,
      jobId: job!.aiReplyJobId,
      conversationId: job!.conversationId,
      leaseToken: token1,
    });
    expect(d1.outcome).toBe("deferred");
    const after1 = await getJob({ businessId, jobId: job!.aiReplyJobId });
    expect(after1?.leaseToken).toBeNull();
    expect(after1?.outboundUnknownCount).toBe(1);

    // Old heartbeat cannot revive relinquished lease
    const extended = await extendLease({
      businessId,
      jobId: job!.aiReplyJobId,
      leaseToken: token1,
      leaseSeconds: 30,
    });
    expect(extended).toBe(false);

    // Reclaim for second/third unknown
    await expireLease(job!.aiReplyJobId);
    // NotBefore may be in future after defer — force due while keeping PROCESSING
    await query(
      `UPDATE TblAiReplyJob
       SET NotBeforeUtc = DATEADD(second, -1, SYSUTCDATETIME()),
           LeaseUntilUtc = DATEADD(second, -10, SYSUTCDATETIME())
       WHERE BusinessID = @businessId AND AiReplyJobID = @jobId`,
      [
        { name: "businessId", type: sql.UniqueIdentifier, value: businessId },
        { name: "jobId", type: sql.UniqueIdentifier, value: job!.aiReplyJobId },
      ],
    );
    const job2 = await claimNextJob({
      businessId,
      leaseSeconds: 30,
      workerId: "w-hi-2",
    });
    expect(job2?.aiReplyJobId).toBe(job!.aiReplyJobId);
    const d2 = await recordAmbiguousOutbound({
      businessId,
      jobId: job2!.aiReplyJobId,
      conversationId: job2!.conversationId,
      leaseToken: job2!.leaseToken!,
    });
    expect(d2.outcome).toBe("deferred");

    await query(
      `UPDATE TblAiReplyJob
       SET NotBeforeUtc = DATEADD(second, -1, SYSUTCDATETIME()),
           LeaseUntilUtc = DATEADD(second, -10, SYSUTCDATETIME())
       WHERE BusinessID = @businessId AND AiReplyJobID = @jobId`,
      [
        { name: "businessId", type: sql.UniqueIdentifier, value: businessId },
        { name: "jobId", type: sql.UniqueIdentifier, value: job!.aiReplyJobId },
      ],
    );
    const job3 = await claimNextJob({
      businessId,
      leaseSeconds: 30,
      workerId: "w-hi-3",
    });
    expect(job3?.aiReplyJobId).toBe(job!.aiReplyJobId);
    const d3 = await recordAmbiguousOutbound({
      businessId,
      jobId: job3!.aiReplyJobId,
      conversationId: job3!.conversationId,
      leaseToken: job3!.leaseToken!,
    });
    expect(d3.outcome).toBe("finalized");
    const finalJob = await getJob({ businessId, jobId: job!.aiReplyJobId });
    expect(finalJob?.status).toBe("FAILED");
    expect(finalJob?.lastErrorCode).toBe("OUTBOUND_RESULT_UNKNOWN_FINAL");

    const pause = await query<{ Mode: string }>(
      `SELECT Mode FROM TblConversationAiState
       WHERE BusinessID = @businessId AND ConversationID = @conversationId`,
      [
        { name: "businessId", type: sql.UniqueIdentifier, value: businessId },
        {
          name: "conversationId",
          type: sql.UniqueIdentifier,
          value: job!.conversationId,
        },
      ],
    );
    expect(pause.recordset[0]?.Mode).toBe("SAFETY_PAUSED");
  });

  it("J. claim/crash/reclaim does not bump OutboundUnknownCount", async ({ skip }) => {
    requireDb(skip);
    await clearOpenJobs();
    const accepted = await ingestWhatsAppInbound(
      dto({
        content: "crash-j",
        externalContactKey: "201555700108@s.whatsapp.net",
      }),
    );
    expect(accepted.outcome).toBe("accepted");
    if (accepted.outcome !== "accepted") return;
    const job1 = await claimForConversation(accepted.conversationId, 1);
    expect(job1).toBeTruthy();
    expect(job1!.outboundUnknownCount).toBe(0);
    await expireLease(job1!.aiReplyJobId);
    const job2 = await claimNextJob({
      businessId,
      leaseSeconds: 1,
      workerId: "w-j-2",
    });
    expect(job2?.outboundUnknownCount).toBe(0);
    await expireLease(job2!.aiReplyJobId);
    const job3 = await claimNextJob({
      businessId,
      leaseSeconds: 30,
      workerId: "w-j-3",
    });
    expect(job3?.outboundUnknownCount).toBe(0);
    await completeJob({
      businessId,
      jobId: job3!.aiReplyJobId,
      status: "SKIPPED",
      errorCode: "TEST_CLEANUP",
      leaseToken: job3!.leaseToken,
    });
  });

  it("REQUIRED: stale after send ACK then Worker B duplicate recovery", async ({ skip }) => {
    requireDb(skip);
    await clearOpenJobs();
    const accepted = await ingestWhatsAppInbound(
      dto({
        content: "stale-after-ack",
        externalContactKey: "201555700109@s.whatsapp.net",
      }),
    );
    expect(accepted.outcome).toBe("accepted");
    if (accepted.outcome !== "accepted") return;

    const jobA = await claimForConversation(accepted.conversationId, 30);
    expect(jobA).toBeTruthy();
    await persistGeneratedReply({
      businessId,
      jobId: jobA!.aiReplyJobId,
      replyText: "رد stale-ack",
      model: "mock",
      leaseToken: jobA!.leaseToken,
    });
    const jobAReady = await getJob({ businessId, jobId: jobA!.aiReplyJobId });
    expect(jobAReady?.generatedReplyText).toBe("رد stale-ack");

    const beforeOut = await countOutbound(accepted.conversationId);
    const beforeUsage = await usageCounts();
    const providerMessageId = `wa-stale-ack-${randomUUID()}`;
    let jobB: Awaited<ReturnType<typeof claimNextJob>> = null;

    const staleResult = await processAiReplyJob({
      job: jobAReady!,
      sendMessage: async () => {
        await expireLease(jobA!.aiReplyJobId);
        jobB = await claimNextJob({
          businessId,
          leaseSeconds: 30,
          workerId: "w-stale-b",
        });
        expect(jobB?.aiReplyJobId).toBe(jobA!.aiReplyJobId);
        expect(jobB!.leaseToken).not.toBe(jobA!.leaseToken);
        return {
          success: true,
          status: "sent",
          messageId: providerMessageId,
        };
      },
      provider: {
        async generateReply() {
          throw new Error("must reuse");
        },
      },
      logger: { info() {}, warn() {} },
    });

    if (staleResult.status !== "LEASE_LOST") {
      throw new Error(`unexpected stale result: ${JSON.stringify(staleResult)}`);
    }
    expect(staleResult.status).toBe("LEASE_LOST");
    expect(staleResult.errorCode).toBe("LEASE_LOST");
    const afterStale = await getJob({ businessId, jobId: jobA!.aiReplyJobId });
    expect(afterStale?.status).toBe("PROCESSING");
    expect(afterStale?.outboundProviderMessageId).toBeFalsy();
    expect(await countOutbound(accepted.conversationId)).toBe(beforeOut);
    const midUsage = await usageCounts();
    expect(midUsage.ai).toBe(beforeUsage.ai);
    expect(midUsage.wa).toBe(beforeUsage.wa);

    expect(jobB).toBeTruthy();
    const sent = await processAiReplyJob({
      job: jobB!,
      sendMessage: vi.fn().mockResolvedValue({
        success: true,
        status: "duplicate",
        messageId: providerMessageId,
        originalMessageId: providerMessageId,
      }),
      provider: {
        async generateReply() {
          throw new Error("must reuse");
        },
      },
      logger: { info() {}, warn() {} },
    });
    expect(sent.status).toBe("SENT");
    expect(await countOutbound(accepted.conversationId)).toBe(beforeOut + 1);
    const afterUsage = await usageCounts();
    expect(afterUsage.ai).toBe(beforeUsage.ai + 1);
    expect(afterUsage.wa).toBe(beforeUsage.wa + 1);

    const finalJob = await getJob({ businessId, jobId: jobA!.aiReplyJobId });
    expect(finalJob?.status).toBe("SENT");
    expect(finalJob?.leaseToken).toBeNull();
  });
});
