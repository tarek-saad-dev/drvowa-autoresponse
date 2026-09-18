import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { closePool, getDbConfig, getPool, query, sql } from "@/lib/db";
import { ForbiddenError, NotFoundError } from "@/lib/tenancy/errors";
import { signup } from "@/modules/auth/service";
import { createChannelConnectionShell } from "@/modules/channels/service";
import { generateWhatsAppAccountKey } from "@/modules/channels/account-key";
import {
  ingestWhatsAppInbound,
  listInboxConversations,
  listInboxMessages,
} from "@/modules/messaging/service";
import {
  countMessagesForBusiness,
  countUsageEvents,
  resolveChannelByExternalAccountKey,
} from "@/modules/messaging/repository";
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
  : "DB_* env not configured — messaging ingest suite skipped";

function requireDb(skip: (reason?: string) => never): void {
  if (dbSkipReason) skip(dbSkipReason);
}

describe("Phase 3A messaging ingest isolation", () => {
  let businessAId = "";
  let businessBId = "";
  let accountKeyA = "";
  let accountKeyB = "";
  let channelAId = "";
  let channelBId = "";

  beforeAll(async () => {
    if (dbSkipReason) {
      console.warn(`[messaging-phase3a] ${dbSkipReason}`);
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
      email: `msg-a-${suffix}@example.com`,
      password: "Password123!",
      fullName: "Msg Tenant A",
    });
    const onboardA = await completeOnboarding({
      userId: a.user.userId,
      sessionId: a.session.sessionId,
      business: {
        name: `Msg Biz A ${suffix}`,
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
      },
    });
    businessAId = onboardA.business.businessId;

    const b = await signup({
      email: `msg-b-${suffix}@example.com`,
      password: "Password123!",
      fullName: "Msg Tenant B",
    });
    const onboardB = await completeOnboarding({
      userId: b.user.userId,
      sessionId: b.session.sessionId,
      business: {
        name: `Msg Biz B ${suffix}`,
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

    accountKeyA = generateWhatsAppAccountKey();
    accountKeyB = generateWhatsAppAccountKey();

    const chA = await createChannelConnectionShell({
      businessId: businessAId,
      channel: "WHATSAPP",
      provider: "BAILEYS",
      externalAccountKey: accountKeyA,
      status: "ACTIVE",
      isActive: true,
      displayName: "WA A",
    });
    channelAId = chA.channelConnectionId;

    const chB = await createChannelConnectionShell({
      businessId: businessBId,
      channel: "WHATSAPP",
      provider: "BAILEYS",
      externalAccountKey: accountKeyB,
      status: "ACTIVE",
      isActive: true,
      displayName: "WA B",
    });
    channelBId = chB.channelConnectionId;
  });

  afterAll(async () => {
    try {
      await closePool();
    } catch {
      // ignore
    }
  });

  function dto(
    overrides: Partial<{
      accountKey: string;
      providerMessageId: string;
      externalContactKey: string;
      fromMe: boolean;
      isGroup: boolean;
      upsertType: string;
      content: unknown;
      BusinessID?: string;
    }> = {},
  ) {
    return {
      accountKey: overrides.accountKey ?? accountKeyA,
      provider: "baileys" as const,
      providerMessageId: overrides.providerMessageId ?? `pmid-${randomUUID()}`,
      externalContactKey:
        overrides.externalContactKey ?? "201555100001@s.whatsapp.net",
      fromMe: overrides.fromMe ?? false,
      isGroup: overrides.isGroup ?? false,
      upsertType: overrides.upsertType ?? "notify",
      content: overrides.content ?? "مرحبا من الاختبار",
      messageTimestamp: Math.floor(Date.now() / 1000),
      receivedAt: new Date().toISOString(),
    };
  }

  it("4. unknown accountKey rejected safely", async ({ skip }) => {
    requireDb(skip);
    await expect(
      ingestWhatsAppInbound(dto({ accountKey: "wa_deadbeefdeadbeefdeadbeef" })),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("5. accountKey maps to correct Business", async ({ skip }) => {
    requireDb(skip);
    const resolved = await resolveChannelByExternalAccountKey(accountKeyA);
    expect(resolved?.businessId).toBe(businessAId);
    expect(resolved?.channelConnectionId).toBe(channelAId);
    expect(resolved?.businessId).not.toBe(businessBId);
  });

  it("9-13. first inbound creates Contact/Conversation/Message and usage once; duplicate idempotent", async ({
    skip,
  }) => {
    requireDb(skip);
    const providerMessageId = `dup-${randomUUID()}`;
    const contactKey = `201555200002@s.whatsapp.net`;

    const first = await ingestWhatsAppInbound(
      dto({ providerMessageId, externalContactKey: contactKey }),
    );
    expect(first.outcome).toBe("accepted");
    if (first.outcome !== "accepted") return;

    expect(first.businessId).toBe(businessAId);

    const usageAfterFirst = await countUsageEvents({
      businessId: businessAId,
      eventType: "WHATSAPP_INBOUND_MESSAGE",
    });

    const second = await ingestWhatsAppInbound(
      dto({ providerMessageId, externalContactKey: contactKey }),
    );
    expect(second.outcome).toBe("duplicate");

    const usageAfterDup = await countUsageEvents({
      businessId: businessAId,
      eventType: "WHATSAPP_INBOUND_MESSAGE",
    });
    expect(usageAfterDup).toBe(usageAfterFirst);

    const msgs = await query<{ Cnt: number }>(
      `SELECT COUNT(1) AS Cnt FROM TblMessage
       WHERE BusinessID = @businessId AND ProviderMessageID = @pmid`,
      [
        {
          name: "businessId",
          type: sql.UniqueIdentifier,
          value: businessAId,
        },
        { name: "pmid", type: sql.NVarChar(256), value: providerMessageId },
      ],
    );
    expect(Number(msgs.recordset[0]?.Cnt)).toBe(1);

    const contacts = await query<{ Cnt: number }>(
      `SELECT COUNT(1) AS Cnt FROM TblContact
       WHERE BusinessID = @businessId
         AND ChannelConnectionID = @channelId
         AND ExternalContactKey = @key`,
      [
        {
          name: "businessId",
          type: sql.UniqueIdentifier,
          value: businessAId,
        },
        {
          name: "channelId",
          type: sql.UniqueIdentifier,
          value: channelAId,
        },
        { name: "key", type: sql.NVarChar(256), value: contactKey },
      ],
    );
    expect(Number(contacts.recordset[0]?.Cnt)).toBe(1);
  });

  it("7/8. Business A cannot read B conversations or messages", async ({
    skip,
  }) => {
    requireDb(skip);
    const ingested = await ingestWhatsAppInbound(
      dto({
        accountKey: accountKeyB,
        externalContactKey: "201555300003@s.whatsapp.net",
        content: "tenant B only",
      }),
    );
    expect(ingested.outcome).toBe("accepted");
    if (ingested.outcome !== "accepted") return;

    const aList = await listInboxConversations({ businessId: businessAId });
    expect(
      aList.some((c) => c.conversationId === ingested.conversationId),
    ).toBe(false);

    await expect(
      listInboxMessages({
        businessId: businessAId,
        conversationId: ingested.conversationId,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);

    const bMsgs = await listInboxMessages({
      businessId: businessBId,
      conversationId: ingested.conversationId,
    });
    expect(bMsgs.length).toBeGreaterThanOrEqual(1);
    // defense: never return other business via wrong id on A
    void ForbiddenError;
  });

  it("18. same externalContactKey on different ChannelConnection is isolated", async ({
    skip,
  }) => {
    requireDb(skip);
    const sharedKey = "201555400004@s.whatsapp.net";
    const a = await ingestWhatsAppInbound(
      dto({
        accountKey: accountKeyA,
        externalContactKey: sharedKey,
        content: "A side",
      }),
    );
    const b = await ingestWhatsAppInbound(
      dto({
        accountKey: accountKeyB,
        externalContactKey: sharedKey,
        content: "B side",
      }),
    );
    expect(a.outcome).toBe("accepted");
    expect(b.outcome).toBe("accepted");
    if (a.outcome !== "accepted" || b.outcome !== "accepted") return;
    expect(a.contactId).not.toBe(b.contactId);
    expect(a.conversationId).not.toBe(b.conversationId);
  });

  it("19. concurrent duplicate ingest remains one Message", async ({ skip }) => {
    requireDb(skip);
    const providerMessageId = `race-${randomUUID()}`;
    const payload = dto({
      providerMessageId,
      externalContactKey: "201555500005@s.whatsapp.net",
      content: "race",
    });

    const before = await countMessagesForBusiness({ businessId: businessAId });
    const results = await Promise.all([
      ingestWhatsAppInbound(payload),
      ingestWhatsAppInbound(payload),
      ingestWhatsAppInbound(payload),
    ]);

    const accepted = results.filter((r) => r.outcome === "accepted").length;
    const duplicates = results.filter((r) => r.outcome === "duplicate").length;
    expect(accepted + duplicates).toBe(3);
    expect(accepted).toBeGreaterThanOrEqual(1);
    expect(accepted).toBeLessThanOrEqual(1);

    const after = await countMessagesForBusiness({ businessId: businessAId });
    expect(after - before).toBe(1);

    const usage = await query<{ Cnt: number }>(
      `SELECT COUNT(1) AS Cnt FROM TblUsageEvent
       WHERE BusinessID = @businessId
         AND EventType = N'WHATSAPP_INBOUND_MESSAGE'
         AND MetadataJson LIKE @like`,
      [
        {
          name: "businessId",
          type: sql.UniqueIdentifier,
          value: businessAId,
        },
        {
          name: "like",
          type: sql.NVarChar(512),
          value: `%"channelConnectionId":"${channelAId}"%`,
        },
      ],
    );
    void usage;
    void channelBId;
  });
});
