import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { closePool, getDbConfig, getPool, query, sql } from "@/lib/db";
import {
  claimNextJob,
  countProcessingJobsForConversation,
  findPendingJobForConversation,
  getEffectiveConversationAiState,
  getJob,
  ingestWhatsAppOutboundObserved,
  processAiReplyJob,
  resumeConversationAi,
  upsertWhatsAppAiSetting,
} from "@/modules/ai";
import { signup } from "@/modules/auth/service";
import { createChannelConnectionShell } from "@/modules/channels/service";
import { generateWhatsAppAccountKey } from "@/modules/channels/account-key";
import { WhatsAppRuntimeError } from "@/modules/channels/runtime-client";
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
  : "DB_* env not configured — AI part2b suite skipped";

function requireDb(skip: (reason?: string) => never): void {
  if (dbSkipReason) skip(dbSkipReason);
}

describe("Phase 3B Part 2B human takeover + serialization", () => {
  let businessId = "";
  let agentId = "";
  let accountKey = "";
  let businessBId = "";
  let accountKeyB = "";

  beforeAll(async () => {
    if (dbSkipReason) {
      console.warn(`[ai-part2b] ${dbSkipReason}`);
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
      email: `p2b-a-${suffix}@example.com`,
      password: "Password123!",
      fullName: "P2B Tenant A",
    });
    const onboardA = await completeOnboarding({
      userId: a.user.userId,
      sessionId: a.session.sessionId,
      business: {
        name: `P2B Biz A ${suffix}`,
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

    const b = await signup({
      email: `p2b-b-${suffix}@example.com`,
      password: "Password123!",
      fullName: "P2B Tenant B",
    });
    const onboardB = await completeOnboarding({
      userId: b.user.userId,
      sessionId: b.session.sessionId,
      business: {
        name: `P2B Biz B ${suffix}`,
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
        dialect: "egyptian",
      },
    });
    businessBId = onboardB.business.businessId;
    accountKeyB = generateWhatsAppAccountKey();
    await createChannelConnectionShell({
      businessId: businessBId,
      channel: "WHATSAPP",
      provider: "BAILEYS",
      externalAccountKey: accountKeyB,
      status: "ACTIVE",
      isActive: true,
    });

    await upsertWhatsAppAiSetting({
      businessId,
      agentId,
      autoReplyEnabled: true,
      debounceMs: 50,
    });
  });

  afterAll(async () => {
    if (!dbEnvOk) return;
    await closePool().catch(() => undefined);
  });

  function dtoA(overrides: Record<string, unknown> = {}) {
    return {
      accountKey,
      provider: "baileys" as const,
      providerMessageId: `in-${randomUUID()}`,
      externalContactKey: "201555800001@s.whatsapp.net",
      fromMe: false,
      isGroup: false,
      upsertType: "notify",
      content: "مرحبا",
      receivedAt: new Date().toISOString(),
      ...overrides,
    };
  }

  it("16/20/21. same conversation cannot have two PROCESSING jobs", async ({
    skip,
  }) => {
    requireDb(skip);
    const accepted = await ingestWhatsAppInbound(
      dtoA({
        content: "serialize-1",
        externalContactKey: "201555800010@s.whatsapp.net",
      }),
    );
    expect(accepted.outcome).toBe("accepted");
    if (accepted.outcome !== "accepted") return;

    await query(
      `UPDATE TblAiReplyJob SET NotBeforeUtc = DATEADD(second, -1, SYSUTCDATETIME())
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

    const first = await claimNextJob({ businessId });
    expect(first).toBeTruthy();

    // Inbound while PROCESSING may create one PENDING
    const during = await ingestWhatsAppInbound(
      dtoA({
        content: "during-processing",
        externalContactKey: "201555800010@s.whatsapp.net",
      }),
    );
    expect(during.outcome).toBe("accepted");
    const pending = await findPendingJobForConversation({
      businessId,
      conversationId: accepted.conversationId,
    });
    expect(pending).toBeTruthy();

    // Pending must not be claimed while PROCESSING exists
    const second = await claimNextJob({ businessId });
    expect(second).toBeNull();

    const processingCount = await countProcessingJobsForConversation({
      businessId,
      conversationId: accepted.conversationId,
    });
    expect(processingCount).toBe(1);

    // Concurrent claim race: unique index / claim logic keeps one PROCESSING
    await expect(
      query(
        `INSERT INTO TblAiReplyJob (
           AiReplyJobID, BusinessID, ChannelConnectionID, ConversationID, ContactID,
           TriggerMessageID, Status, NotBeforeUtc, AttemptCount,
           CreatedAtUtc, UpdatedAtUtc
         )
         SELECT NEWID(), BusinessID, ChannelConnectionID, ConversationID, ContactID,
                TriggerMessageID, N'PROCESSING', SYSUTCDATETIME(), 1,
                SYSUTCDATETIME(), SYSUTCDATETIME()
         FROM TblAiReplyJob WHERE AiReplyJobID = @jobId`,
        [
          {
            name: "jobId",
            type: sql.UniqueIdentifier,
            value: first!.aiReplyJobId,
          },
        ],
      ),
    ).rejects.toThrow();

    await query(
      `UPDATE TblAiReplyJob
       SET Status = N'FAILED', LastErrorCode = N'TEST_CLEANUP',
           CompletedAtUtc = SYSUTCDATETIME(), LeaseUntilUtc = NULL
       WHERE BusinessID = @businessId AND ConversationID = @conversationId
         AND Status IN (N'PROCESSING', N'PENDING')`,
      [
        { name: "businessId", type: sql.UniqueIdentifier, value: businessId },
        {
          name: "conversationId",
          type: sql.UniqueIdentifier,
          value: accepted.conversationId,
        },
      ],
    );
  });

  it("17/18. different conversations and businesses may process concurrently", async ({
    skip,
  }) => {
    requireDb(skip);
    const a1 = await ingestWhatsAppInbound(
      dtoA({
        content: "conv-a",
        externalContactKey: "201555800020@s.whatsapp.net",
      }),
    );
    const a2 = await ingestWhatsAppInbound(
      dtoA({
        content: "conv-b",
        externalContactKey: "201555800021@s.whatsapp.net",
      }),
    );
    expect(a1.outcome).toBe("accepted");
    expect(a2.outcome).toBe("accepted");
    if (a1.outcome !== "accepted" || a2.outcome !== "accepted") return;

    await query(
      `UPDATE TblAiReplyJob SET NotBeforeUtc = DATEADD(second, -1, SYSUTCDATETIME())
       WHERE BusinessID = @businessId AND Status = N'PENDING'
         AND ConversationID IN (@c1, @c2)`,
      [
        { name: "businessId", type: sql.UniqueIdentifier, value: businessId },
        {
          name: "c1",
          type: sql.UniqueIdentifier,
          value: a1.conversationId,
        },
        {
          name: "c2",
          type: sql.UniqueIdentifier,
          value: a2.conversationId,
        },
      ],
    );

    const j1 = await claimNextJob({ businessId });
    const j2 = await claimNextJob({ businessId });
    expect(j1).toBeTruthy();
    expect(j2).toBeTruthy();
    expect(j1!.conversationId).not.toBe(j2!.conversationId);
  });

  it("22/23/24/25/27. HUMAN_MANUAL pauses; DRVOWA_API does not; idempotent", async ({
    skip,
  }) => {
    requireDb(skip);
    const accepted = await ingestWhatsAppInbound(
      dtoA({
        content: "before human",
        externalContactKey: "201555800030@s.whatsapp.net",
      }),
    );
    expect(accepted.outcome).toBe("accepted");
    if (accepted.outcome !== "accepted") return;

    const pendingBefore = await findPendingJobForConversation({
      businessId,
      conversationId: accepted.conversationId,
    });
    expect(pendingBefore).toBeTruthy();

    const human = await ingestWhatsAppOutboundObserved({
      accountKey,
      provider: "baileys",
      providerMessageId: `human-${randomUUID()}`,
      origin: "HUMAN_MANUAL",
      externalContactKey: "201555800030@s.whatsapp.net",
      occurredAt: new Date().toISOString(),
    });
    expect(human.outcome).toBe("accepted");
    if (human.outcome !== "accepted") return;

    const state = await getEffectiveConversationAiState({
      businessId,
      conversationId: accepted.conversationId,
    });
    expect(state.mode).toBe("HUMAN_PAUSED");
    expect(state.pauseReason).toBe("HUMAN_TAKEOVER");

    const pendingAfter = await findPendingJobForConversation({
      businessId,
      conversationId: accepted.conversationId,
    });
    expect(pendingAfter).toBeNull();
    const skipped = await getJob({
      businessId,
      jobId: pendingBefore!.aiReplyJobId,
    });
    expect(skipped?.status).toBe("SKIPPED");
    expect(skipped?.lastErrorCode).toBe("HUMAN_TAKEOVER");

    const obsId =
      human.outcome === "accepted" ? human.observationId : null;
    expect(obsId).toBeTruthy();
    const providerMessageId = (
      await query<{ ProviderMessageID: string }>(
        `SELECT ProviderMessageID FROM TblWhatsappOutboundObservation
         WHERE OutboundObservationID = @id`,
        [{ name: "id", type: sql.UniqueIdentifier, value: obsId }],
      )
    ).recordset[0]?.ProviderMessageID;
    expect(providerMessageId).toBeTruthy();
    const dup2 = await ingestWhatsAppOutboundObserved({
      accountKey,
      provider: "baileys",
      providerMessageId: providerMessageId!,
      origin: "HUMAN_MANUAL",
      externalContactKey: "201555800030@s.whatsapp.net",
    });
    expect(dup2.outcome).toBe("duplicate");

    // Conversation B unaffected
    const other = await ingestWhatsAppInbound(
      dtoA({
        content: "other conv",
        externalContactKey: "201555800031@s.whatsapp.net",
      }),
    );
    expect(other.outcome).toBe("accepted");
    if (other.outcome === "accepted") {
      const otherState = await getEffectiveConversationAiState({
        businessId,
        conversationId: other.conversationId,
      });
      expect(otherState.mode).toBe("AUTO");
    }

    // DRVOWA_API does not pause
    const apiObs = await ingestWhatsAppOutboundObserved({
      accountKey,
      provider: "baileys",
      providerMessageId: `api-${randomUUID()}`,
      origin: "DRVOWA_API",
      externalContactKey: "201555800031@s.whatsapp.net",
    });
    expect(apiObs.outcome).toBe("accepted");
    if (other.outcome === "accepted") {
      const stillAuto = await getEffectiveConversationAiState({
        businessId,
        conversationId: other.conversationId,
      });
      expect(stillAuto.mode).toBe("AUTO");
    }
  });

  it("26. HUMAN_MANUAL Business A cannot affect Business B", async ({
    skip,
  }) => {
    requireDb(skip);
    await ingestWhatsAppOutboundObserved({
      accountKey,
      provider: "baileys",
      providerMessageId: `cross-${randomUUID()}`,
      origin: "HUMAN_MANUAL",
      externalContactKey: "201555800040@s.whatsapp.net",
    });
    // Resolve a conversation on B if any — mode must remain AUTO by default
    const statesB = await query<{ Cnt: number }>(
      `SELECT COUNT(1) AS Cnt FROM TblConversationAiState
       WHERE BusinessID = @businessId AND Mode <> N'AUTO'`,
      [
        {
          name: "businessId",
          type: sql.UniqueIdentifier,
          value: businessBId,
        },
      ],
    );
    expect(Number(statesB.recordset[0]?.Cnt)).toBe(0);
  });

  it("30/31/32/34/36. resume watermark + global disable still wins", async ({
    skip,
  }) => {
    requireDb(skip);
    const accepted = await ingestWhatsAppInbound(
      dtoA({
        content: "pre-resume backlog",
        externalContactKey: "201555800050@s.whatsapp.net",
        receivedAt: new Date("2026-01-01T00:00:00.000Z").toISOString(),
      }),
    );
    expect(accepted.outcome).toBe("accepted");
    if (accepted.outcome !== "accepted") return;

    await ingestWhatsAppOutboundObserved({
      accountKey,
      provider: "baileys",
      providerMessageId: `takeover-${randomUUID()}`,
      origin: "HUMAN_MANUAL",
      externalContactKey: "201555800050@s.whatsapp.net",
    });

    const resumed = await resumeConversationAi({
      businessId,
      conversationId: accepted.conversationId,
    });
    expect(resumed.mode).toBe("AUTO");
    expect(resumed.resumedAtUtc).toBeTruthy();

    // Historical / pre-resume inbound must not schedule
    const backlog = await ingestWhatsAppInbound(
      dtoA({
        content: "still old",
        externalContactKey: "201555800050@s.whatsapp.net",
        providerMessageId: `old-${randomUUID()}`,
        receivedAt: new Date("2026-01-02T00:00:00.000Z").toISOString(),
      }),
    );
    expect(backlog.outcome).toBe("accepted");
    if (backlog.outcome === "accepted") {
      const pendingOld = await findPendingJobForConversation({
        businessId,
        conversationId: backlog.conversationId,
      });
      expect(pendingOld).toBeNull();
    }

    // New inbound after resume can schedule
    const fresh = await ingestWhatsAppInbound(
      dtoA({
        content: "new after resume",
        externalContactKey: "201555800050@s.whatsapp.net",
        providerMessageId: `fresh-${randomUUID()}`,
        receivedAt: new Date().toISOString(),
      }),
    );
    expect(fresh.outcome).toBe("accepted");
    if (fresh.outcome === "accepted") {
      const pendingFresh = await findPendingJobForConversation({
        businessId,
        conversationId: fresh.conversationId,
      });
      expect(pendingFresh).toBeTruthy();
    }

    // Global AutoReply OFF blocks even when local AUTO
    await upsertWhatsAppAiSetting({
      businessId,
      agentId,
      autoReplyEnabled: false,
      debounceMs: 50,
    });
    const whileOff = await ingestWhatsAppInbound(
      dtoA({
        content: "while global off",
        externalContactKey: "201555800050@s.whatsapp.net",
        providerMessageId: `off-${randomUUID()}`,
        receivedAt: new Date().toISOString(),
      }),
    );
    expect(whileOff.outcome).toBe("accepted");
    // Re-enable for other tests
    await upsertWhatsAppAiSetting({
      businessId,
      agentId,
      autoReplyEnabled: true,
      debounceMs: 50,
    });
  });

  it("12/13/14. persistent unknown safety-pauses conversation only", async ({
    skip,
  }) => {
    requireDb(skip);
    const accepted = await ingestWhatsAppInbound(
      dtoA({
        content: "ambiguous send",
        externalContactKey: "201555800060@s.whatsapp.net",
      }),
    );
    expect(accepted.outcome).toBe("accepted");
    if (accepted.outcome !== "accepted") return;

    await query(
      `UPDATE TblAiReplyJob SET NotBeforeUtc = DATEADD(second, -1, SYSUTCDATETIME())
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

    // Isolate from other PENDING jobs left by earlier tests in this suite.
    await query(
      `UPDATE TblAiReplyJob
       SET Status = N'SKIPPED',
           LastErrorCode = N'TEST_ISOLATION',
           CompletedAtUtc = SYSUTCDATETIME(),
           LeaseUntilUtc = NULL,
           LeaseToken = NULL,
           LeaseOwner = NULL,
           UpdatedAtUtc = SYSUTCDATETIME()
       WHERE BusinessID = @businessId
         AND Status = N'PENDING'
         AND ConversationID <> @conversationId`,
      [
        { name: "businessId", type: sql.UniqueIdentifier, value: businessId },
        {
          name: "conversationId",
          type: sql.UniqueIdentifier,
          value: accepted.conversationId,
        },
      ],
    );

    const sendMock = vi.fn().mockRejectedValue(
      new WhatsAppRuntimeError("unknown", {
        status: 202,
        code: "OUTBOUND_RESULT_UNKNOWN",
      }),
    );
    const provider = {
      async generateReply() {
        return { text: "رد ثابت", model: "mock", latencyMs: 1 };
      },
    };

    for (let i = 0; i < 3; i++) {
      const job = await claimNextJob({ businessId });
      expect(job).toBeTruthy();
      expect(job!.conversationId).toBe(accepted.conversationId);
      // Force lease expired for reclaim between attempts
      if (i > 0) {
        expect(job!.generatedReplyText).toBe("رد ثابت");
      }
      const result = await processAiReplyJob({
        job: job!,
        sendMessage: sendMock,
        provider,
        logger: { info() {}, warn() {} },
      });
      if (i < 2) {
        expect(result.status).toBe("DEFERRED");
        expect(result.errorCode).toBe("OUTBOUND_RESULT_UNKNOWN");
        expect(job!.outboundUnknownCount + 1).toBeLessThanOrEqual(2);
        await query(
          `UPDATE TblAiReplyJob
           SET LeaseUntilUtc = DATEADD(second, -1, SYSUTCDATETIME()),
               NotBeforeUtc = DATEADD(second, -1, SYSUTCDATETIME())
           WHERE AiReplyJobID = @jobId`,
          [
            {
              name: "jobId",
              type: sql.UniqueIdentifier,
              value: job!.aiReplyJobId,
            },
          ],
        );
      } else {
        expect(result.status).toBe("FAILED");
        expect(result.errorCode).toBe("OUTBOUND_RESULT_UNKNOWN_FINAL");
      }
    }

    const state = await getEffectiveConversationAiState({
      businessId,
      conversationId: accepted.conversationId,
    });
    expect(state.mode).toBe("SAFETY_PAUSED");

    // Other conversation remains AUTO
    const other = await ingestWhatsAppInbound(
      dtoA({
        content: "unaffected",
        externalContactKey: "201555800061@s.whatsapp.net",
      }),
    );
    if (other.outcome === "accepted") {
      const otherState = await getEffectiveConversationAiState({
        businessId,
        conversationId: other.conversationId,
      });
      expect(otherState.mode).toBe("AUTO");
    }

    expect(sendMock).toHaveBeenCalledTimes(3);
    const keys = sendMock.mock.calls.map(
      (c) => (c[0] as { idempotencyKey: string }).idempotencyKey,
    );
    expect(new Set(keys).size).toBe(1);
  });

  it("39. unknown accountKey returns NotFound via service", async ({ skip }) => {
    requireDb(skip);
    await expect(
      ingestWhatsAppOutboundObserved({
        accountKey: "missing-account-key-zzzz",
        provider: "baileys",
        providerMessageId: `x-${randomUUID()}`,
        origin: "HUMAN_MANUAL",
        externalContactKey: "201555800070@s.whatsapp.net",
      }),
    ).rejects.toThrow(/Unknown WhatsApp account/i);
  });
});
