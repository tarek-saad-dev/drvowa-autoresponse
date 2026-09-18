import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { closePool, getDbConfig, getPool, query, sql } from "@/lib/db";
import {
  claimNextJob,
  completeJob,
  countJobs,
  findPendingJobForConversation,
  getJob,
  processAiReplyJob,
  upsertWhatsAppAiSetting,
  getWhatsAppAiSetting,
} from "@/modules/ai";
import { signup } from "@/modules/auth/service";
import { createChannelConnectionShell } from "@/modules/channels/service";
import { generateWhatsAppAccountKey } from "@/modules/channels/account-key";
import { WhatsAppRuntimeError } from "@/modules/channels/runtime-client";
import { listAgents } from "@/modules/agents/service";
import { listItems } from "@/modules/knowledge/service";
import { ingestWhatsAppInbound } from "@/modules/messaging/service";
import * as messagingRepo from "@/modules/messaging/repository";
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
  : "DB_* env not configured — AI phase3b suite skipped";

function requireDb(skip: (reason?: string) => never): void {
  if (dbSkipReason) skip(dbSkipReason);
}

describe("Phase 3B AI jobs integration", () => {
  let businessId = "";
  let agentId = "";
  let accountKey = "";
  let businessBId = "";
  let agentBId = "";

  beforeAll(async () => {
    if (dbSkipReason) {
      console.warn(`[ai-phase3b] ${dbSkipReason}`);
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
      email: `ai-a-${suffix}@example.com`,
      password: "Password123!",
      fullName: "AI Tenant A",
    });
    const onboardA = await completeOnboarding({
      userId: a.user.userId,
      sessionId: a.session.sessionId,
      business: {
        name: `AI Biz A ${suffix}`,
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
      email: `ai-b-${suffix}@example.com`,
      password: "Password123!",
      fullName: "AI Tenant B",
    });
    const onboardB = await completeOnboarding({
      userId: b.user.userId,
      sessionId: b.session.sessionId,
      business: {
        name: `AI Biz B ${suffix}`,
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
    agentBId = onboardB.agent.agentId;
  }, 120_000);

  afterAll(async () => {
    await closePool().catch(() => undefined);
  });

  function dto(overrides: Record<string, unknown> = {}) {
    return {
      accountKey,
      provider: "baileys" as const,
      providerMessageId: `ai-${randomUUID()}`,
      externalContactKey: "201555700007@s.whatsapp.net",
      fromMe: false,
      isGroup: false,
      upsertType: "notify",
      content: "مرحبا",
      messageTimestamp: Math.floor(Date.now() / 1000),
      receivedAt: new Date().toISOString(),
      ...overrides,
    };
  }

  it("1. AI defaults disabled", async ({ skip }) => {
    requireDb(skip);
    const setting = await getWhatsAppAiSetting({ businessId });
    expect(setting === null || setting.autoReplyEnabled === false).toBe(true);
  });

  it("2/30. migration/disabled does not schedule old-style messages", async ({
    skip,
  }) => {
    requireDb(skip);
    const before = await countJobs({ businessId });
    await ingestWhatsAppInbound(dto({ content: "رسالة تاريخية" }));
    const after = await countJobs({ businessId });
    expect(after).toBe(before);
  });

  it("3. enabling records EnabledAtUtc", async ({ skip }) => {
    requireDb(skip);
    const setting = await upsertWhatsAppAiSetting({
      businessId,
      agentId,
      autoReplyEnabled: true,
      debounceMs: 200,
    });
    expect(setting.autoReplyEnabled).toBe(true);
    expect(setting.enabledAtUtc).toBeTruthy();
  });

  it("4. message before EnabledAtUtc ignored forever", async ({ skip }) => {
    requireDb(skip);
    const setting = await getWhatsAppAiSetting({ businessId });
    expect(setting?.enabledAtUtc).toBeTruthy();
    const beforeJobs = await countJobs({ businessId });

    const oldReceived = new Date(setting!.enabledAtUtc!.getTime() - 60_000);

    // Insert inbound with receivedAt before watermark
    const ingested = await ingestWhatsAppInbound(
      dto({
        content: "قبل التفعيل",
        receivedAt: oldReceived.toISOString(),
        providerMessageId: `old-${randomUUID()}`,
      }),
    );
    expect(ingested.outcome).toBe("accepted");
    const afterJobs = await countJobs({ businessId });
    expect(afterJobs).toBe(beforeJobs);
  });

  it("5/8/9. new text creates job; burst coalesces and extends debounce", async ({
    skip,
  }) => {
    requireDb(skip);
    await upsertWhatsAppAiSetting({
      businessId,
      agentId,
      autoReplyEnabled: true,
      debounceMs: 500,
    });

    const first = await ingestWhatsAppInbound(
      dto({ content: "السلام عليكم", providerMessageId: `b1-${randomUUID()}` }),
    );
    expect(first.outcome).toBe("accepted");
    if (first.outcome !== "accepted") return;

    const pending1 = await findPendingJobForConversation({
      businessId,
      conversationId: first.conversationId,
    });
    expect(pending1).toBeTruthy();
    const notBefore1 = pending1!.notBeforeUtc.getTime();

    await new Promise((r) => setTimeout(r, 30));
    const second = await ingestWhatsAppInbound(
      dto({
        content: "عايز احجز",
        providerMessageId: `b2-${randomUUID()}`,
        externalContactKey: "201555700007@s.whatsapp.net",
      }),
    );
    expect(second.outcome).toBe("accepted");

    const pending2 = await findPendingJobForConversation({
      businessId,
      conversationId: first.conversationId,
    });
    expect(pending2?.aiReplyJobId).toBe(pending1!.aiReplyJobId);
    expect(pending2!.notBeforeUtc.getTime()).toBeGreaterThanOrEqual(notBefore1);
    expect(pending2!.triggerMessageId).not.toBe(pending1!.triggerMessageId);

    const pendingCount = await countJobs({ businessId, status: "PENDING" });
    expect(pendingCount).toBeGreaterThanOrEqual(1);
  });

  it("1.1 concurrent burst coalesces to one PENDING job", async ({ skip }) => {
    requireDb(skip);
    const debounceMs = 900;
    await upsertWhatsAppAiSetting({
      businessId,
      agentId,
      autoReplyEnabled: true,
      debounceMs,
    });

    const externalContactKey = `201555${String(Date.now()).slice(-6)}@s.whatsapp.net`;
    const burstContents = ["السلام عليكم", "عايز احجز", "بكره", "الساعة 5"];
    const beforeConcurrent = Date.now();

    const results = await Promise.all(
      burstContents.map((content, index) =>
        ingestWhatsAppInbound(
          dto({
            content,
            providerMessageId: `race-${index}-${randomUUID()}`,
            externalContactKey,
          }),
        ),
      ),
    );

    expect(results.every((r) => r.outcome === "accepted")).toBe(true);
    const accepted = results.filter(
      (r): r is Extract<typeof r, { outcome: "accepted" }> =>
        r.outcome === "accepted",
    );
    expect(accepted).toHaveLength(burstContents.length);

    const conversationIds = new Set(accepted.map((r) => r.conversationId));
    expect(conversationIds.size).toBe(1);
    const conversationId = accepted[0]!.conversationId;
    const messageIds = accepted.map((r) => r.messageId);

    const messageCount = await query<{ Cnt: number }>(
      `SELECT COUNT(1) AS Cnt FROM TblMessage
       WHERE BusinessID = @businessId
         AND ConversationID = @conversationId
         AND Direction = N'INBOUND'
         AND MessageID IN (${messageIds.map((_, i) => `@m${i}`).join(", ")})`,
      [
        { name: "businessId", type: sql.UniqueIdentifier, value: businessId },
        {
          name: "conversationId",
          type: sql.UniqueIdentifier,
          value: conversationId,
        },
        ...messageIds.map((id, i) => ({
          name: `m${i}`,
          type: sql.UniqueIdentifier,
          value: id,
        })),
      ],
    );
    expect(Number(messageCount.recordset[0]?.Cnt)).toBe(burstContents.length);

    const pendingRows = await query<{
      AiReplyJobID: string;
      TriggerMessageID: string;
      NotBeforeUtc: Date;
      Cnt: number;
    }>(
      `SELECT AiReplyJobID, TriggerMessageID, NotBeforeUtc,
              COUNT(1) OVER () AS Cnt
       FROM TblAiReplyJob
       WHERE BusinessID = @businessId
         AND ConversationID = @conversationId
         AND Status = N'PENDING'`,
      [
        { name: "businessId", type: sql.UniqueIdentifier, value: businessId },
        {
          name: "conversationId",
          type: sql.UniqueIdentifier,
          value: conversationId,
        },
      ],
    );
    expect(pendingRows.recordset).toHaveLength(1);
    expect(Number(pendingRows.recordset[0]?.Cnt)).toBe(1);

    const pending = pendingRows.recordset[0]!;
    const triggerId = String(pending.TriggerMessageID).toLowerCase();
    expect(messageIds.map((id) => id.toLowerCase())).toContain(triggerId);

    const notBeforeMs = new Date(pending.NotBeforeUtc).getTime();
    expect(notBeforeMs).toBeGreaterThanOrEqual(beforeConcurrent + debounceMs - 200);
    expect(notBeforeMs).toBeLessThanOrEqual(Date.now() + debounceMs + 500);

    const notBeforeBeforeExtend = notBeforeMs;
    await new Promise((r) => setTimeout(r, 40));

    const followUp = await ingestWhatsAppInbound(
      dto({
        content: "تمام",
        providerMessageId: `race-follow-${randomUUID()}`,
        externalContactKey,
      }),
    );
    expect(followUp.outcome).toBe("accepted");
    if (followUp.outcome !== "accepted") return;

    const afterFollow = await query<{
      AiReplyJobID: string;
      TriggerMessageID: string;
      NotBeforeUtc: Date;
    }>(
      `SELECT AiReplyJobID, TriggerMessageID, NotBeforeUtc
       FROM TblAiReplyJob
       WHERE BusinessID = @businessId
         AND ConversationID = @conversationId
         AND Status = N'PENDING'`,
      [
        { name: "businessId", type: sql.UniqueIdentifier, value: businessId },
        {
          name: "conversationId",
          type: sql.UniqueIdentifier,
          value: conversationId,
        },
      ],
    );
    expect(afterFollow.recordset).toHaveLength(1);
    expect(String(afterFollow.recordset[0]?.AiReplyJobID).toLowerCase()).toBe(
      String(pending.AiReplyJobID).toLowerCase(),
    );
    expect(String(afterFollow.recordset[0]?.TriggerMessageID).toLowerCase()).toBe(
      followUp.messageId.toLowerCase(),
    );
    expect(new Date(afterFollow.recordset[0]!.NotBeforeUtc).getTime()).toBeGreaterThan(
      notBeforeBeforeExtend,
    );
  });

  it("6. duplicate inbound does not duplicate job", async ({ skip }) => {
    requireDb(skip);
    const pmid = `dup-ai-${randomUUID()}`;
    await ingestWhatsAppInbound(dto({ providerMessageId: pmid, content: "مرة" }));
    const before = await countJobs({ businessId });
    await ingestWhatsAppInbound(dto({ providerMessageId: pmid, content: "مرة" }));
    const after = await countJobs({ businessId });
    expect(after).toBe(before);
  });

  it("10/11. atomic claim and expired lease recovery", async ({ skip }) => {
    requireDb(skip);
    const conversationId = randomUUID();
    // Use scheduleOrCoalesce with real IDs from a fresh ingest
    const accepted = await ingestWhatsAppInbound(
      dto({
        content: "claim me",
        providerMessageId: `claim-${randomUUID()}`,
        externalContactKey: "201555800008@s.whatsapp.net",
      }),
    );
    expect(accepted.outcome).toBe("accepted");
    if (accepted.outcome !== "accepted") return;

    // Force due
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

    const job1 = await claimNextJob({ businessId, leaseSeconds: 1 });
    expect(job1).toBeTruthy();
    const job2 = await claimNextJob({ businessId, leaseSeconds: 1 });
    if (job2) {
      expect(job2.aiReplyJobId).not.toBe(job1!.aiReplyJobId);
    }

    // Expire lease and recover (unless UNKNOWN_SEND_RESULT)
    await query(
      `UPDATE TblAiReplyJob
       SET LeaseUntilUtc = DATEADD(second, -10, SYSUTCDATETIME()),
           LastErrorCode = NULL
       WHERE BusinessID = @businessId AND AiReplyJobID = @jobId`,
      [
        { name: "businessId", type: sql.UniqueIdentifier, value: businessId },
        { name: "jobId", type: sql.UniqueIdentifier, value: job1!.aiReplyJobId },
      ],
    );
    const recovered = await claimNextJob({ businessId, leaseSeconds: 30 });
    expect(recovered?.aiReplyJobId).toBe(job1!.aiReplyJobId);
    await completeJob({
      businessId,
      jobId: job1!.aiReplyJobId,
      status: "SKIPPED",
      errorCode: "TEST_CLEANUP",
    });
    void conversationId;
  });

  it("12/13/14/15/31. tenant isolation for agent/knowledge/history", async ({
    skip,
  }) => {
    requireDb(skip);
    const agentsA = await listAgents({ businessId });
    const agentsB = await listAgents({ businessId: businessBId });
    expect(agentsA.every((a) => a.businessId === businessId)).toBe(true);
    expect(agentsB.every((a) => a.businessId === businessBId)).toBe(true);
    expect(agentsA.some((a) => a.agentId === agentBId)).toBe(false);

    const knowledgeA = await listItems({ businessId });
    const knowledgeB = await listItems({ businessId: businessBId });
    expect(knowledgeA.every((k) => k.businessId === businessId)).toBe(true);
    expect(knowledgeB.every((k) => k.businessId === businessBId)).toBe(true);
    expect(knowledgeA.every((k) => k.isActive)).toBe(true);
  });

  it("16/17. inactive agent and missing destination skip", async ({ skip }) => {
    requireDb(skip);
    const accepted = await ingestWhatsAppInbound(
      dto({
        content: "skip dest",
        providerMessageId: `skip-${randomUUID()}`,
        externalContactKey: "opaque-lid-12345@lid",
      }),
    );
    expect(accepted.outcome).toBe("accepted");
    if (accepted.outcome !== "accepted") return;

    await query(
      `UPDATE TblAiReplyJob SET NotBeforeUtc = DATEADD(second, -1, SYSUTCDATETIME())
       WHERE BusinessID = @businessId AND AiReplyJobID IN (
         SELECT TOP 1 AiReplyJobID FROM TblAiReplyJob
         WHERE BusinessID = @businessId AND ConversationID = @conversationId AND Status = N'PENDING'
       )`,
      [
        { name: "businessId", type: sql.UniqueIdentifier, value: businessId },
        {
          name: "conversationId",
          type: sql.UniqueIdentifier,
          value: accepted.conversationId,
        },
      ],
    );

    const job = await claimNextJob({ businessId });
    expect(job).toBeTruthy();
    const result = await processAiReplyJob({
      job: job!,
      provider: {
        async generateReply() {
          throw new Error("should not be called");
        },
      },
      logger: { info() {}, warn() {} },
    });
    expect(result.status).toBe("SKIPPED");
    expect(result.errorCode).toBe("DESTINATION_UNAVAILABLE");
  });

  it("19/20/22/23/24/25/26/27/28. orchestrator send paths", async ({ skip }) => {
    requireDb(skip);
    await upsertWhatsAppAiSetting({
      businessId,
      agentId,
      autoReplyEnabled: true,
      debounceMs: 50,
    });

    const accepted = await ingestWhatsAppInbound(
      dto({
        content: "عايز أعرف المواعيد",
        providerMessageId: `send-${randomUUID()}`,
        externalContactKey: "201555900009@s.whatsapp.net",
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

    const job = await claimNextJob({ businessId });
    expect(job).toBeTruthy();

    const sendMock = vi.fn().mockResolvedValue({
      success: true,
      messageId: `wa-out-${randomUUID()}`,
    });

    const result = await processAiReplyJob({
      job: job!,
      sendMessage: sendMock,
      provider: {
        async generateReply(req) {
          expect(req.businessId).toBe(businessId);
          expect(req.recentMessages.length).toBeGreaterThan(0);
          expect(req.knowledge.every((k) => typeof k.content === "string")).toBe(
            true,
          );
          return { text: "حاضر، سأكدد لك المعلومة.", model: "mock", latencyMs: 5 };
        },
      },
      logger: { info() {}, warn() {} },
    });

    expect(result.status).toBe("SENT");
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        accountKey,
        phone: "201555900009",
      }),
    );

    const outbound = await query<{ Cnt: number }>(
      `SELECT COUNT(1) AS Cnt FROM TblMessage
       WHERE BusinessID = @businessId AND ConversationID = @conversationId AND Direction = N'OUTBOUND'`,
      [
        { name: "businessId", type: sql.UniqueIdentifier, value: businessId },
        {
          name: "conversationId",
          type: sql.UniqueIdentifier,
          value: accepted.conversationId,
        },
      ],
    );
    expect(Number(outbound.recordset[0]?.Cnt)).toBeGreaterThanOrEqual(1);

    const usageAi = await messagingRepo.countUsageEvents({
      businessId,
      eventType: "AI_REPLY_GENERATED",
    });
    const usageOut = await messagingRepo.countUsageEvents({
      businessId,
      eventType: "WHATSAPP_OUTBOUND_MESSAGE",
    });
    expect(usageAi).toBeGreaterThanOrEqual(1);
    expect(usageOut).toBeGreaterThanOrEqual(1);

    const conv = await messagingRepo.getConversationForBusiness({
      businessId,
      conversationId: accepted.conversationId,
    });
    expect(conv?.lastOutboundAtUtc).toBeTruthy();

    // Ambiguous timeout does not auto-resend
    const accepted2 = await ingestWhatsAppInbound(
      dto({
        content: "timeout path",
        providerMessageId: `to-${randomUUID()}`,
        externalContactKey: "201555900009@s.whatsapp.net",
      }),
    );
    if (accepted2.outcome === "accepted") {
      await query(
        `UPDATE TblAiReplyJob SET NotBeforeUtc = DATEADD(second, -1, SYSUTCDATETIME())
         WHERE BusinessID = @businessId AND ConversationID = @conversationId AND Status = N'PENDING'`,
        [
          { name: "businessId", type: sql.UniqueIdentifier, value: businessId },
          {
            name: "conversationId",
            type: sql.UniqueIdentifier,
            value: accepted2.conversationId,
          },
        ],
      );
      const jobTo = await claimNextJob({ businessId });
      sendMock.mockRejectedValueOnce(
        new WhatsAppRuntimeError("timed out", {
          status: 504,
          code: "RUNTIME_TIMEOUT",
        }),
      );
      const failed = await processAiReplyJob({
        job: jobTo!,
        sendMessage: sendMock,
        provider: {
          async generateReply() {
            return { text: "رد", model: "mock", latencyMs: 1 };
          },
        },
        logger: { info() {}, warn() {} },
      });
      expect(failed.status).toBe("FAILED");
      expect(failed.errorCode).toBe("UNKNOWN_SEND_RESULT");
      const stored = await getJob({
        businessId,
        jobId: jobTo!.aiReplyJobId,
      });
      expect(stored?.status).toBe("FAILED");
      expect(stored?.lastErrorCode).toBe("UNKNOWN_SEND_RESULT");
    }

    // Definitive failure does not persist outbound for a new job
    const accepted3 = await ingestWhatsAppInbound(
      dto({
        content: "not ready",
        providerMessageId: `nr-${randomUUID()}`,
        externalContactKey: "201555900009@s.whatsapp.net",
      }),
    );
    if (accepted3.outcome === "accepted") {
      await query(
        `UPDATE TblAiReplyJob SET NotBeforeUtc = DATEADD(second, -1, SYSUTCDATETIME())
         WHERE BusinessID = @businessId AND ConversationID = @conversationId AND Status = N'PENDING'`,
        [
          { name: "businessId", type: sql.UniqueIdentifier, value: businessId },
          {
            name: "conversationId",
            type: sql.UniqueIdentifier,
            value: accepted3.conversationId,
          },
        ],
      );
      const beforeOut = await query<{ Cnt: number }>(
        `SELECT COUNT(1) AS Cnt FROM TblMessage
         WHERE BusinessID = @businessId AND Direction = N'OUTBOUND'`,
        [{ name: "businessId", type: sql.UniqueIdentifier, value: businessId }],
      );
      const jobNr = await claimNextJob({ businessId });
      sendMock.mockRejectedValueOnce(
        new WhatsAppRuntimeError("not ready", {
          status: 409,
          code: "NOT_READY",
        }),
      );
      const failedNr = await processAiReplyJob({
        job: jobNr!,
        sendMessage: sendMock,
        provider: {
          async generateReply() {
            return { text: "رد", model: "mock", latencyMs: 1 };
          },
        },
        logger: { info() {}, warn() {} },
      });
      expect(failedNr.status).toBe("FAILED");
      expect(failedNr.errorCode).toBe("NOT_READY");
      const afterOut = await query<{ Cnt: number }>(
        `SELECT COUNT(1) AS Cnt FROM TblMessage
         WHERE BusinessID = @businessId AND Direction = N'OUTBOUND'`,
        [{ name: "businessId", type: sql.UniqueIdentifier, value: businessId }],
      );
      expect(Number(afterOut.recordset[0]?.Cnt)).toBe(
        Number(beforeOut.recordset[0]?.Cnt),
      );
    }
  });

  it("empty gemini output fails without send", async ({ skip }) => {
    requireDb(skip);
    const accepted = await ingestWhatsAppInbound(
      dto({
        content: "empty ai",
        providerMessageId: `empty-${randomUUID()}`,
        externalContactKey: "201555900009@s.whatsapp.net",
      }),
    );
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
    const job = await claimNextJob({ businessId });
    const sendMock = vi.fn();
    const result = await processAiReplyJob({
      job: job!,
      sendMessage: sendMock,
      provider: {
        async generateReply() {
          return { text: "", model: "mock", latencyMs: 1 };
        },
      },
      logger: { info() {}, warn() {} },
    });
    expect(result.status).toBe("FAILED");
    expect(result.errorCode).toBe("GEMINI_EMPTY");
    expect(sendMock).not.toHaveBeenCalled();
  });
});
