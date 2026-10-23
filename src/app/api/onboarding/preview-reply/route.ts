import { createHash } from "node:crypto";
import { z } from "zod";

import { requireApiBusiness } from "@/lib/api/auth-context";
import { handleApiError, jsonOk, parseJsonBody } from "@/lib/api/http";
import { query, sql, withTransaction } from "@/lib/db";
import { RATE_LIMITS, assertRateLimit, RateLimitError } from "@/lib/security/rate-limit";
import { createGeminiProvider } from "@/modules/ai";
import { listAgents } from "@/modules/agents/service";
import { listItems } from "@/modules/knowledge/service";

const MAX_GENERATIONS_PER_BUSINESS = 24;
const bodySchema = z.object({
  message: z.string().trim().min(1, "اكتب سؤال").max(500),
});

// Persisted per-business budget: browser resets, multiple tabs and worker restarts cannot reset it.
// Future paid refreshes must use an explicit, metered product entitlement.
async function ensurePreviewTable() {
  await query(`
    IF OBJECT_ID(N'dbo.TblOnboardingPreviewReply', N'U') IS NULL
    BEGIN
      CREATE TABLE dbo.TblOnboardingPreviewReply (
        BusinessID UNIQUEIDENTIFIER NOT NULL,
        ContentHash CHAR(64) NOT NULL,
        Question NVARCHAR(500) NOT NULL,
        Reply NVARCHAR(MAX) NULL,
        Status VARCHAR(12) NOT NULL,
        CreatedAtUtc DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT PK_OnboardingPreviewReply PRIMARY KEY (BusinessID, ContentHash, Question)
      );
    END
    ELSE IF COL_LENGTH(N'dbo.TblOnboardingPreviewReply', N'Question') IS NOT NULL
      AND COL_LENGTH(N'dbo.TblOnboardingPreviewReply', N'Question') < 1000
    BEGIN
      ALTER TABLE dbo.TblOnboardingPreviewReply
        ALTER COLUMN Question NVARCHAR(500) NOT NULL;
    END
  `);
}

export async function POST(request: Request) {
  try {
    const { businessId } = await requireApiBusiness();
    const { message } = bodySchema.parse(await parseJsonBody(request));
    const [agents, knowledgeItems] = await Promise.all([
      listAgents({ businessId }),
      listItems({ businessId, includeInactive: false }),
    ]);
    const agent = agents.find((item) => item.isActive) ?? agents[0];
    if (!agent) throw new Error("ONBOARDING_AGENT_MISSING");

    const fingerprint = createHash("sha256").update(JSON.stringify({
      agent: [agent.name, agent.roleTitle, agent.language, agent.dialect, agent.tone, agent.instructions],
      knowledge: knowledgeItems.map((item) => [item.category, item.title, item.content]).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    })).digest("hex");

    await ensurePreviewTable();
    const inputs = [
      { name: "businessId", type: sql.UniqueIdentifier, value: businessId },
      { name: "contentHash", type: sql.Char(64), value: fingerprint },
      { name: "question", type: sql.NVarChar(500), value: message },
    ];
    const reservation = await withTransaction(async (trx) => {
      // Lock per business, across all app instances, before checking or reserving budget.
      await trx.query(`
        DECLARE @lockResult INT;
        EXEC @lockResult = sp_getapplock
          @Resource = @lockKey, @LockMode = 'Exclusive',
          @LockOwner = 'Transaction', @LockTimeout = 10000;
        IF @lockResult < 0 THROW 51001, 'Preview reservation lock timeout', 1;
      `, [{ name: "lockKey", type: sql.NVarChar(255), value: `onboarding-preview:${businessId}` }]);
      const previous = await trx.query<{ Reply: string | null; Status: string }>(`
        SELECT Reply, Status FROM dbo.TblOnboardingPreviewReply
        WHERE BusinessID = @businessId AND ContentHash = @contentHash AND Question = @question
      `, inputs);
      const existing = previous.recordset[0];
      if (existing?.Status === "READY" && existing.Reply) return { cached: existing.Reply };
      if (existing?.Status === "PENDING") return { pending: true };
      if (existing?.Status === "FAILED") {
        return { failed: true as const };
      }
      const count = await trx.query<{ Total: number }>(`
        SELECT COUNT(*) AS Total FROM dbo.TblOnboardingPreviewReply WHERE BusinessID = @businessId
      `, inputs.slice(0, 1));
      if ((count.recordset[0]?.Total ?? 0) >= MAX_GENERATIONS_PER_BUSINESS) return { exhausted: true };
      await trx.query(`
        INSERT INTO dbo.TblOnboardingPreviewReply (BusinessID, ContentHash, Question, Status)
        VALUES (@businessId, @contentHash, @question, 'PENDING')
      `, inputs);
      return { reserved: true };
    });

    if ("cached" in reservation) return jsonOk({ reply: reservation.cached, cached: true });
    if ("exhausted" in reservation) throw new RateLimitError(86400, "انتهت محاولات المعاينة المجانية لهذا النشاط");
    if ("pending" in reservation) {
      return Response.json(
        { error: "الرد بيتجهز بالفعل، جرب تاني بعد لحظات" },
        { status: 409 },
      );
    }
    if ("failed" in reservation) {
      return Response.json(
        { error: "فشل تجهيز الرد لهذا السؤال قبل كده. جرّب سؤال مختلف." },
        { status: 409 },
      );
    }

    try {
      assertRateLimit(`onboarding-preview-reply:${businessId}`, RATE_LIMITS.onboardingPreviewReply);
      const provider = createGeminiProvider();
      const result = await provider.generateReply({
        businessId,
        conversationId: "onboarding-preview",
        agent: {
          name: agent.name,
          roleTitle: agent.roleTitle,
          language: agent.language,
          dialect: agent.dialect,
          tone: agent.tone,
          instructions: agent.instructions,
        },
        knowledge: knowledgeItems.map((item) => ({
          category: item.category,
          title: item.title,
          content: item.content,
        })),
        recentMessages: [{
          messageId: "onboarding-preview-message",
          direction: "INBOUND",
          textContent: message,
          createdAtUtc: new Date(),
        }],
        customerPhoneHint: null,
      });
      await query(`
        UPDATE dbo.TblOnboardingPreviewReply SET Reply = @reply, Status = 'READY'
        WHERE BusinessID = @businessId AND ContentHash = @contentHash AND Question = @question
      `, [...inputs, { name: "reply", type: sql.NVarChar(sql.MAX), value: result.text }]);
      return jsonOk({ reply: result.text, cached: false, model: result.model, latencyMs: result.latencyMs, agentId: agent.agentId });
    } catch (error) {
      // Keep failed reservations counted: upstream failures can still incur charges.
      // A retry must not trigger another potentially billable generation.
      await query(`
        UPDATE dbo.TblOnboardingPreviewReply SET Status = 'FAILED'
        WHERE BusinessID = @businessId AND ContentHash = @contentHash AND Question = @question
      `, inputs).catch(() => undefined);
      throw error;
    }
  } catch (error) {
    return handleApiError(error);
  }
}
