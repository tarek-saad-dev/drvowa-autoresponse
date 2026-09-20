import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { closePool, getDbConfig, getPool, query, sql } from "@/lib/db";
import {
  assertJobLeaseOwned,
  claimNextJob,
  completeJob,
  upsertWhatsAppAiSetting,
} from "@/modules/ai";
import { AiJobLeaseLostError } from "@/modules/ai/lease";
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
  : "DB_* env not configured — AI lease stress suite skipped";

function requireDb(skip: (reason?: string) => never): void {
  if (dbSkipReason) skip(dbSkipReason);
}

type Tenant = {
  businessId: string;
  agentId: string;
  accountKey: string;
};

describe("M9 AI worker multi-tenant lease concurrency stress", () => {
  const tenants: Tenant[] = [];
  const BUSINESSES = 5;
  const CONVERSATIONS_PER_BUSINESS = 5;

  beforeAll(async () => {
    if (dbSkipReason) {
      console.warn(`[ai-lease-stress] ${dbSkipReason}`);
      return;
    }
    try {
      await getPool();
    } catch (error) {
      rethrowDbBootstrapFailure(error);
    }

    clearTestCookies();
    for (let i = 0; i < BUSINESSES; i++) {
      const suffix = `${randomUUID().slice(0, 6)}-${i}`;
      const user = await signup({
        email: `ai-stress-${suffix}@example.com`,
        password: "Password123!",
        fullName: `AI Stress ${i}`,
      });
      const onboard = await completeOnboarding({
        userId: user.user.userId,
        sessionId: user.session.sessionId,
        business: {
          name: `AI Stress Biz ${suffix}`,
          category: "clinic",
          countryCode: "SA",
          locale: "ar-SA",
          timezone: "Asia/Riyadh",
        },
        location: { name: "Loc", city: "Riyadh" },
        agent: {
          name: `Agent ${i}`,
          roleTitle: "Receptionist",
          language: "ar",
        },
      });
      const accountKey = generateWhatsAppAccountKey();
      await createChannelConnectionShell({
        businessId: onboard.business.businessId,
        channel: "WHATSAPP",
        provider: "BAILEYS",
        externalAccountKey: accountKey,
        status: "ACTIVE",
        isActive: true,
      });
      await upsertWhatsAppAiSetting({
        businessId: onboard.business.businessId,
        agentId: onboard.agent.agentId,
        autoReplyEnabled: true,
        debounceMs: 50,
      });
      tenants.push({
        businessId: onboard.business.businessId,
        agentId: onboard.agent.agentId,
        accountKey,
      });
    }
  }, 300_000);

  afterAll(async () => {
    await closePool().catch(() => undefined);
  });

  async function seedJobs() {
    const seeded: Array<{
      businessId: string;
      conversationId: string;
      jobId?: string;
      kind: "pending" | "live" | "expired" | "unknown" | "future";
    }> = [];

    for (const tenant of tenants) {
      for (let c = 0; c < CONVERSATIONS_PER_BUSINESS; c++) {
        const phone = `2015558${String(tenant.businessId.slice(0, 4))}${c}`.replace(
          /[^0-9]/g,
          "",
        ).slice(0, 12);
        const accepted = await ingestWhatsAppInbound({
          accountKey: tenant.accountKey,
          provider: "baileys",
          providerMessageId: `stress-${randomUUID()}`,
          externalContactKey: `${phone}${c}@s.whatsapp.net`,
          fromMe: false,
          isGroup: false,
          upsertType: "notify",
          content: `stress-${c}`,
          messageTimestamp: Math.floor(Date.now() / 1000),
          receivedAt: new Date().toISOString(),
        });
        if (accepted.outcome !== "accepted") continue;

        await query(
          `UPDATE TblAiReplyJob SET NotBeforeUtc = DATEADD(second, -1, SYSUTCDATETIME())
           WHERE BusinessID = @businessId AND ConversationID = @conversationId AND Status = N'PENDING'`,
          [
            {
              name: "businessId",
              type: sql.UniqueIdentifier,
              value: tenant.businessId,
            },
            {
              name: "conversationId",
              type: sql.UniqueIdentifier,
              value: accepted.conversationId,
            },
          ],
        );

        const kindIndex = c % 5;
        const kind =
          kindIndex === 0
            ? "pending"
            : kindIndex === 1
              ? "live"
              : kindIndex === 2
                ? "expired"
                : kindIndex === 3
                  ? "unknown"
                  : "future";

        const entry: (typeof seeded)[number] = {
          businessId: tenant.businessId,
          conversationId: accepted.conversationId,
          kind,
        };

        if (kind === "future") {
          await query(
            `UPDATE TblAiReplyJob
             SET NotBeforeUtc = DATEADD(minute, 30, SYSUTCDATETIME())
             WHERE BusinessID = @businessId AND ConversationID = @conversationId AND Status = N'PENDING'`,
            [
              {
                name: "businessId",
                type: sql.UniqueIdentifier,
                value: tenant.businessId,
              },
              {
                name: "conversationId",
                type: sql.UniqueIdentifier,
                value: accepted.conversationId,
              },
            ],
          );
        } else if (kind !== "pending") {
          const claimed = await claimNextJob({
            businessId: tenant.businessId,
            leaseSeconds: kind === "live" ? 120 : 1,
            workerId: `seed-${kind}`,
          });
          if (claimed?.conversationId.toLowerCase() === accepted.conversationId.toLowerCase()) {
            entry.jobId = claimed.aiReplyJobId;
            if (kind === "expired" || kind === "unknown") {
              await query(
                `UPDATE TblAiReplyJob
                 SET LeaseUntilUtc = DATEADD(second, -20, SYSUTCDATETIME()),
                     LastErrorCode = CASE WHEN @unknown = 1 THEN N'OUTBOUND_RESULT_UNKNOWN' ELSE LastErrorCode END,
                     UpdatedAtUtc = SYSUTCDATETIME()
                 WHERE BusinessID = @businessId AND AiReplyJobID = @jobId`,
                [
                  {
                    name: "businessId",
                    type: sql.UniqueIdentifier,
                    value: tenant.businessId,
                  },
                  {
                    name: "jobId",
                    type: sql.UniqueIdentifier,
                    value: claimed.aiReplyJobId,
                  },
                  {
                    name: "unknown",
                    type: sql.Bit,
                    value: kind === "unknown" ? 1 : 0,
                  },
                ],
              );
            }
          } else if (claimed) {
            await completeJob({
              businessId: tenant.businessId,
              jobId: claimed.aiReplyJobId,
              status: "SKIPPED",
              errorCode: "TEST_SEED_SKIP",
              leaseToken: claimed.leaseToken,
            });
          }
        }

        seeded.push(entry);
      }
    }
    return seeded;
  }

  it("concurrent claims never dual-own a live lease or cross tenants", async ({ skip }) => {
    requireDb(skip);
    expect(tenants.length).toBe(BUSINESSES);
    await seedJobs();

    const CLAIM_LOOPS = 3;
    const seenTokens = new Map<string, Set<string>>();
    const liveOwners = new Map<string, string>();
    const claimedJobIds = new Set<string>();
    let crossTenantHits = 0;
    let dualConversation = 0;

    async function claimLoop(workerId: string, businessId?: string) {
      const localClaims: string[] = [];
      for (let i = 0; i < 40; i++) {
        const job = await claimNextJob({
          workerId,
          businessId,
          leaseSeconds: 60,
        });
        if (!job) continue;

        if (businessId && job.businessId.toLowerCase() !== businessId.toLowerCase()) {
          crossTenantHits += 1;
        }

        const key = job.aiReplyJobId.toLowerCase();
        claimedJobIds.add(key);
        localClaims.push(key);

        const tokens = seenTokens.get(key) ?? new Set<string>();
        if (job.leaseToken) tokens.add(job.leaseToken.toLowerCase());
        seenTokens.set(key, tokens);

        // Live ownership: only one token should assert successfully at a time.
        try {
          await assertJobLeaseOwned({
            businessId: job.businessId,
            jobId: job.aiReplyJobId,
            leaseToken: job.leaseToken!,
          });
          const ownerKey = `${job.businessId}:${job.conversationId}`.toLowerCase();
          const prior = liveOwners.get(ownerKey);
          if (prior && prior !== key) {
            // another PROCESSING on same conversation
            const cnt = await query<{ Cnt: number }>(
              `SELECT COUNT(1) AS Cnt FROM TblAiReplyJob
               WHERE BusinessID = @businessId AND ConversationID = @conversationId
                 AND Status = N'PROCESSING'
                 AND LeaseUntilUtc IS NOT NULL
                 AND LeaseUntilUtc >= SYSUTCDATETIME()`,
              [
                {
                  name: "businessId",
                  type: sql.UniqueIdentifier,
                  value: job.businessId,
                },
                {
                  name: "conversationId",
                  type: sql.UniqueIdentifier,
                  value: job.conversationId,
                },
              ],
            );
            if (Number(cnt.recordset[0]?.Cnt) > 1) dualConversation += 1;
          }
          liveOwners.set(ownerKey, key);
        } catch (error) {
          if (!(error instanceof AiJobLeaseLostError)) throw error;
        }
      }
      return localClaims;
    }

    const workers: Array<Promise<string[]>> = [];
    for (let w = 0; w < CLAIM_LOOPS; w++) {
      workers.push(claimLoop(`stress-global-${w}`));
    }
    for (const tenant of tenants) {
      workers.push(claimLoop(`stress-tenant-${tenant.businessId.slice(0, 8)}`, tenant.businessId));
    }

    const results = await Promise.all(workers);
    const flat = results.flat();

    // Global claim must not duplicate the same claim event identity wrongly —
    // a job may appear once per reclaim with rotated token, never two live tokens.
    for (const [jobId, tokens] of seenTokens) {
      if (tokens.size <= 1) continue;
      // After rotation only the latest token may be live.
      let liveCount = 0;
      for (const token of tokens) {
        try {
          const row = await query<{ Ok: number }>(
            `SELECT 1 AS Ok FROM TblAiReplyJob
             WHERE AiReplyJobID = @jobId
               AND LeaseToken = @token
               AND LeaseUntilUtc IS NOT NULL
               AND LeaseUntilUtc >= SYSUTCDATETIME()`,
            [
              { name: "jobId", type: sql.UniqueIdentifier, value: jobId },
              { name: "token", type: sql.UniqueIdentifier, value: token },
            ],
          );
          if (row.recordset[0]) liveCount += 1;
        } catch {
          // ignore
        }
      }
      expect(liveCount).toBeLessThanOrEqual(1);
    }

    expect(crossTenantHits).toBe(0);
    expect(dualConversation).toBe(0);

    // Different conversations can process concurrently across tenants.
    const concurrent = await query<{ Cnt: number }>(
      `SELECT COUNT(1) AS Cnt FROM TblAiReplyJob
       WHERE Status = N'PROCESSING'
         AND LeaseUntilUtc IS NOT NULL
         AND LeaseUntilUtc >= SYSUTCDATETIME()
         AND BusinessID IN (${tenants.map((_, i) => `@b${i}`).join(",")})`,
      tenants.map((t, i) => ({
        name: `b${i}`,
        type: sql.UniqueIdentifier,
        value: t.businessId,
      })),
    );
    expect(Number(concurrent.recordset[0]?.Cnt)).toBeGreaterThanOrEqual(1);

    // Claims alone do not bump OutboundUnknownCount for pending→processing.
    const unknownBump = await query<{ Bad: number }>(
      `SELECT COUNT(1) AS Bad FROM TblAiReplyJob
       WHERE BusinessID IN (${tenants.map((_, i) => `@b${i}`).join(",")})
         AND OutboundUnknownCount > 0
         AND LastErrorCode IS NULL`,
      tenants.map((t, i) => ({
        name: `b${i}`,
        type: sql.UniqueIdentifier,
        value: t.businessId,
      })),
    );
    expect(Number(unknownBump.recordset[0]?.Bad)).toBe(0);

    // Stale token never wins against current live owner.
    for (const jobId of claimedJobIds) {
      const row = await query<{
        LeaseToken: string | null;
        LeaseVersion: number;
        OutboundUnknownCount: number;
      }>(
        `SELECT LeaseToken, LeaseVersion, OutboundUnknownCount
         FROM TblAiReplyJob WHERE AiReplyJobID = @jobId`,
        [{ name: "jobId", type: sql.UniqueIdentifier, value: jobId }],
      );
      const current = row.recordset[0];
      if (!current?.LeaseToken) continue;
      const stale = [...(seenTokens.get(jobId) ?? [])].find(
        (t) => t !== current.LeaseToken!.toLowerCase(),
      );
      if (!stale) continue;
      await expect(
        assertJobLeaseOwned({
          businessId: (
            await query<{ BusinessID: string }>(
              `SELECT BusinessID FROM TblAiReplyJob WHERE AiReplyJobID = @jobId`,
              [{ name: "jobId", type: sql.UniqueIdentifier, value: jobId }],
            )
          ).recordset[0]!.BusinessID,
          jobId,
          leaseToken: stale,
        }),
      ).rejects.toBeInstanceOf(AiJobLeaseLostError);
      expect(Number(current.LeaseVersion)).toBeGreaterThanOrEqual(1);
    }

    void flat;
  }, 180_000);
});
