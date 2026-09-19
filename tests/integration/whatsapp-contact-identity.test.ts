import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { batch, closePool, getDbConfig, getPool, query, sql } from "@/lib/db";
import {
  getEffectiveConversationAiState,
  ingestWhatsAppOutboundObserved,
} from "@/modules/ai";
import { signup } from "@/modules/auth/service";
import { generateWhatsAppAccountKey } from "@/modules/channels/account-key";
import { createChannelConnectionShell } from "@/modules/channels/service";
import { ingestWhatsAppInbound } from "@/modules/messaging/service";
import { completeOnboarding } from "@/modules/onboarding/service";
import { rethrowDbBootstrapFailure } from "../helpers/db-bootstrap";
import { clearTestCookies } from "../helpers/cookies";

const MERGE_SQL_PATH = resolve(
  process.cwd(),
  "db/sql/merge_whatsapp_contact_duplicates.sql",
);

function loadMergeSql(): string {
  return readFileSync(MERGE_SQL_PATH, "utf8");
}

async function dropPhoneUniqueIndex(): Promise<void> {
  await query(
    `IF EXISTS (
       SELECT 1 FROM sys.indexes
       WHERE name = N'UQ_TblContact_Business_Channel_PhoneNormalized'
         AND object_id = OBJECT_ID(N'dbo.TblContact')
     )
     DROP INDEX UQ_TblContact_Business_Channel_PhoneNormalized ON dbo.TblContact`,
  );
}

async function ensurePhoneUniqueIndex(): Promise<void> {
  await query(
    `IF NOT EXISTS (
       SELECT 1 FROM sys.indexes
       WHERE name = N'UQ_TblContact_Business_Channel_PhoneNormalized'
         AND object_id = OBJECT_ID(N'dbo.TblContact')
     )
     CREATE UNIQUE INDEX UQ_TblContact_Business_Channel_PhoneNormalized
       ON dbo.TblContact (BusinessID, ChannelConnectionID, PhoneNormalized)
       WHERE PhoneNormalized IS NOT NULL`,
  );
}

async function execMergeWithRetry(attempts = 4): Promise<void> {
  const mergeSql = loadMergeSql();
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      await batch(mergeSql);
      return;
    } catch (error) {
      lastError = error;
      const msg = error instanceof Error ? error.message : String(error);
      if (!/deadlock/i.test(msg) || i === attempts - 1) throw error;
      await new Promise((r) => setTimeout(r, 150 * (i + 1)));
    }
  }
  throw lastError;
}

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
  : "DB_* env not configured — contact identity suite skipped";

function requireDb(skip: (reason?: string) => never): void {
  if (dbSkipReason) skip(dbSkipReason);
}

describe("Phase 3B Part 2B.1 contact identity + merge", () => {
  let businessId = "";
  let accountKey = "";
  let channelConnectionId = "";
  let businessBId = "";
  let accountKeyB = "";
  let channelConnectionIdB = "";

  beforeAll(async () => {
    if (dbSkipReason) {
      console.warn(`[contact-identity] ${dbSkipReason}`);
      return;
    }
    try {
      await getPool();
    } catch (error) {
      rethrowDbBootstrapFailure(error);
    }

    // Drop leftover repair procedure from earlier 008 drafts if present.
    await query(
      `IF OBJECT_ID(N'dbo.usp_MergeWhatsAppContactDuplicates', N'P') IS NOT NULL
       DROP PROCEDURE dbo.usp_MergeWhatsAppContactDuplicates`,
    );

    clearTestCookies();
    const suffix = randomUUID().slice(0, 8);
    const a = await signup({
      email: `id-a-${suffix}@example.com`,
      password: "Password123!",
      fullName: "Identity Tenant A",
    });
    const onboardA = await completeOnboarding({
      userId: a.user.userId,
      sessionId: a.session.sessionId,
      business: {
        name: `Identity Biz A ${suffix}`,
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
    accountKey = generateWhatsAppAccountKey();
    const connA = await createChannelConnectionShell({
      businessId,
      channel: "WHATSAPP",
      provider: "BAILEYS",
      externalAccountKey: accountKey,
      status: "ACTIVE",
      isActive: true,
    });
    channelConnectionId = connA.channelConnectionId;

    const b = await signup({
      email: `id-b-${suffix}@example.com`,
      password: "Password123!",
      fullName: "Identity Tenant B",
    });
    const onboardB = await completeOnboarding({
      userId: b.user.userId,
      sessionId: b.session.sessionId,
      business: {
        name: `Identity Biz B ${suffix}`,
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
    const connB = await createChannelConnectionShell({
      businessId: businessBId,
      channel: "WHATSAPP",
      provider: "BAILEYS",
      externalAccountKey: accountKeyB,
      status: "ACTIVE",
      isActive: true,
    });
    channelConnectionIdB = connB.channelConnectionId;
  });

  afterAll(async () => {
    if (!dbEnvOk) return;
    await closePool().catch(() => undefined);
  });

  it("18. production failure: bare inbound + JID observation pause same conversation", async ({
    skip,
  }) => {
    requireDb(skip);
    const phone = "201111962602";
    const inbound = await ingestWhatsAppInbound({
      accountKey,
      provider: "baileys",
      providerMessageId: `in-bare-${randomUUID()}`,
      externalContactKey: phone,
      fromMe: false,
      isGroup: false,
      upsertType: "notify",
      content: "مرحبا من العميل الحقيقي",
      receivedAt: new Date().toISOString(),
    });
    expect(inbound.outcome).toBe("accepted");
    if (inbound.outcome !== "accepted") return;

    const human = await ingestWhatsAppOutboundObserved({
      accountKey,
      provider: "baileys",
      providerMessageId: `human-jid-${randomUUID()}`,
      origin: "HUMAN_MANUAL",
      phone,
      externalContactKey: `${phone}@s.whatsapp.net`,
      occurredAt: new Date().toISOString(),
    });
    expect(human.outcome).toBe("accepted");
    if (human.outcome !== "accepted") return;

    expect(human.conversationId).toBe(inbound.conversationId);
    expect(human.paused).toBe(true);

    const contacts = await query<{ Cnt: number }>(
      `SELECT COUNT(1) AS Cnt FROM TblContact
       WHERE BusinessID = @businessId
         AND ChannelConnectionID = @channelConnectionId
         AND PhoneNormalized = @phone`,
      [
        { name: "businessId", type: sql.UniqueIdentifier, value: businessId },
        {
          name: "channelConnectionId",
          type: sql.UniqueIdentifier,
          value: channelConnectionId,
        },
        { name: "phone", type: sql.NVarChar(32), value: phone },
      ],
    );
    expect(Number(contacts.recordset[0]?.Cnt)).toBe(1);

    const conversations = await query<{ Cnt: number }>(
      `SELECT COUNT(1) AS Cnt FROM TblConversation
       WHERE BusinessID = @businessId AND ContactID = @contactId`,
      [
        { name: "businessId", type: sql.UniqueIdentifier, value: businessId },
        {
          name: "contactId",
          type: sql.UniqueIdentifier,
          value: inbound.contactId,
        },
      ],
    );
    expect(Number(conversations.recordset[0]?.Cnt)).toBe(1);

    const state = await getEffectiveConversationAiState({
      businessId,
      conversationId: inbound.conversationId,
    });
    expect(state.mode).toBe("HUMAN_PAUSED");
    expect(state.pauseReason).toBe("HUMAN_TAKEOVER");
  });

  it("19. reverse: JID inbound then bare observation", async ({ skip }) => {
    requireDb(skip);
    const phone = "201111962701";
    const inbound = await ingestWhatsAppInbound({
      accountKey,
      provider: "baileys",
      providerMessageId: `in-jid-${randomUUID()}`,
      externalContactKey: `${phone}@s.whatsapp.net`,
      fromMe: false,
      isGroup: false,
      upsertType: "notify",
      content: "jid first",
      receivedAt: new Date().toISOString(),
    });
    expect(inbound.outcome).toBe("accepted");
    if (inbound.outcome !== "accepted") return;

    const human = await ingestWhatsAppOutboundObserved({
      accountKey,
      provider: "baileys",
      providerMessageId: `human-bare-${randomUUID()}`,
      origin: "HUMAN_MANUAL",
      phone,
      externalContactKey: phone,
    });
    expect(human.outcome).toBe("accepted");
    if (human.outcome !== "accepted") return;
    expect(human.conversationId).toBe(inbound.conversationId);
  });

  it("1/5/6/7. mixed forms share contact; DRVOWA_API does not pause; obs idempotent", async ({
    skip,
  }) => {
    requireDb(skip);
    const phone = "201111962801";
    const a = await ingestWhatsAppInbound({
      accountKey,
      provider: "baileys",
      providerMessageId: `mix-a-${randomUUID()}`,
      externalContactKey: phone,
      fromMe: false,
      isGroup: false,
      upsertType: "notify",
      content: "a",
      receivedAt: new Date().toISOString(),
    });
    const b = await ingestWhatsAppInbound({
      accountKey,
      provider: "baileys",
      providerMessageId: `mix-b-${randomUUID()}`,
      externalContactKey: `${phone}@s.whatsapp.net`,
      fromMe: false,
      isGroup: false,
      upsertType: "notify",
      content: "b",
      receivedAt: new Date().toISOString(),
    });
    expect(a.outcome).toBe("accepted");
    expect(b.outcome).toBe("accepted");
    if (a.outcome !== "accepted" || b.outcome !== "accepted") return;
    expect(a.contactId).toBe(b.contactId);
    expect(a.conversationId).toBe(b.conversationId);

    const api = await ingestWhatsAppOutboundObserved({
      accountKey,
      provider: "baileys",
      providerMessageId: `api-${randomUUID()}`,
      origin: "DRVOWA_API",
      phone,
      externalContactKey: `${phone}@s.whatsapp.net`,
    });
    expect(api.outcome).toBe("accepted");
    const state = await getEffectiveConversationAiState({
      businessId,
      conversationId: a.conversationId,
    });
    expect(state.mode).toBe("AUTO");

    const providerMessageId = `dup-obs-${randomUUID()}`;
    const first = await ingestWhatsAppOutboundObserved({
      accountKey,
      provider: "baileys",
      providerMessageId,
      origin: "HUMAN_MANUAL",
      phone,
    });
    const second = await ingestWhatsAppOutboundObserved({
      accountKey,
      provider: "baileys",
      providerMessageId,
      origin: "HUMAN_MANUAL",
      phone,
    });
    expect(first.outcome).toBe("accepted");
    expect(second.outcome).toBe("duplicate");
  });

  it("8. concurrent mixed-form creates one contact", async ({ skip }) => {
    requireDb(skip);
    const phone = `2011119${String(Math.floor(Math.random() * 100000)).padStart(5, "0")}`;
    const results = await Promise.all([
      ingestWhatsAppInbound({
        accountKey,
        provider: "baileys",
        providerMessageId: `conc-a-${randomUUID()}`,
        externalContactKey: phone,
        fromMe: false,
        isGroup: false,
        upsertType: "notify",
        content: "conc-a",
        receivedAt: new Date().toISOString(),
      }),
      ingestWhatsAppInbound({
        accountKey,
        provider: "baileys",
        providerMessageId: `conc-b-${randomUUID()}`,
        externalContactKey: `${phone}@s.whatsapp.net`,
        fromMe: false,
        isGroup: false,
        upsertType: "notify",
        content: "conc-b",
        receivedAt: new Date().toISOString(),
      }),
    ]);
    const accepted = results.filter((r) => r.outcome === "accepted");
    expect(accepted.length).toBe(2);
    if (accepted[0]?.outcome !== "accepted" || accepted[1]?.outcome !== "accepted") {
      return;
    }
    expect(accepted[0].contactId).toBe(accepted[1].contactId);
    expect(accepted[0].conversationId).toBe(accepted[1].conversationId);
  });

  it("9/10. same phone isolated across channel and business", async ({ skip }) => {
    requireDb(skip);
    const phone = "201111962901";
    const a = await ingestWhatsAppInbound({
      accountKey,
      provider: "baileys",
      providerMessageId: `iso-a-${randomUUID()}`,
      externalContactKey: phone,
      fromMe: false,
      isGroup: false,
      upsertType: "notify",
      content: "iso-a",
      receivedAt: new Date().toISOString(),
    });
    const b = await ingestWhatsAppInbound({
      accountKey: accountKeyB,
      provider: "baileys",
      providerMessageId: `iso-b-${randomUUID()}`,
      externalContactKey: phone,
      fromMe: false,
      isGroup: false,
      upsertType: "notify",
      content: "iso-b",
      receivedAt: new Date().toISOString(),
    });
    expect(a.outcome).toBe("accepted");
    expect(b.outcome).toBe("accepted");
    if (a.outcome !== "accepted" || b.outcome !== "accepted") return;
    expect(a.contactId).not.toBe(b.contactId);
    expect(a.businessId).toBe(businessId);
    expect(b.businessId).toBe(businessBId);
    void channelConnectionIdB;
  });

  it("11. opaque LID stays separate from phone contact", async ({ skip }) => {
    requireDb(skip);
    const phone = "201111963001";
    const phoneIn = await ingestWhatsAppInbound({
      accountKey,
      provider: "baileys",
      providerMessageId: `lid-phone-${randomUUID()}`,
      externalContactKey: phone,
      fromMe: false,
      isGroup: false,
      upsertType: "notify",
      content: "phone",
      receivedAt: new Date().toISOString(),
    });
    const lidIn = await ingestWhatsAppInbound({
      accountKey,
      provider: "baileys",
      providerMessageId: `lid-opaque-${randomUUID()}`,
      externalContactKey: "999888777666555@lid",
      fromMe: false,
      isGroup: false,
      upsertType: "notify",
      content: "lid",
      receivedAt: new Date().toISOString(),
    });
    expect(phoneIn.outcome).toBe("accepted");
    expect(lidIn.outcome).toBe("accepted");
    if (phoneIn.outcome !== "accepted" || lidIn.outcome !== "accepted") return;
    expect(phoneIn.contactId).not.toBe(lidIn.contactId);
  });

  it("12-18. migration merge preserves history, AI state, observations, uniqueness", async ({
    skip,
  }) => {
    requireDb(skip);
    const phone = "201111963101";
    const contactA = randomUUID();
    const contactB = randomUUID();
    const convA = randomUUID();
    const convB = randomUUID();
    const msgId = randomUUID();
    const obsId = randomUUID();
    const providerObsId = `obs-merge-${randomUUID()}`;

    // Allow seeding pre-fix duplicates
    await query(
      `IF EXISTS (
         SELECT 1 FROM sys.indexes
         WHERE name = N'UQ_TblContact_Business_Channel_PhoneNormalized'
           AND object_id = OBJECT_ID(N'dbo.TblContact')
       )
       DROP INDEX UQ_TblContact_Business_Channel_PhoneNormalized ON dbo.TblContact`,
    );

    await query(
      `INSERT INTO TblContact (
         ContactID, BusinessID, ChannelConnectionID, ExternalContactKey,
         DisplayName, PhoneNormalized, CreatedAtUtc, UpdatedAtUtc
       ) VALUES
       (@contactA, @businessId, @channelConnectionId, @bare,
        NULL, @phone, DATEADD(day, -10, SYSUTCDATETIME()), SYSUTCDATETIME()),
       (@contactB, @businessId, @channelConnectionId, @jid,
        NULL, @phone, SYSUTCDATETIME(), SYSUTCDATETIME())`,
      [
        { name: "contactA", type: sql.UniqueIdentifier, value: contactA },
        { name: "contactB", type: sql.UniqueIdentifier, value: contactB },
        { name: "businessId", type: sql.UniqueIdentifier, value: businessId },
        {
          name: "channelConnectionId",
          type: sql.UniqueIdentifier,
          value: channelConnectionId,
        },
        { name: "bare", type: sql.NVarChar(256), value: phone },
        {
          name: "jid",
          type: sql.NVarChar(256),
          value: `${phone}@s.whatsapp.net`,
        },
        { name: "phone", type: sql.NVarChar(32), value: phone },
      ],
    );

    await query(
      `INSERT INTO TblConversation (
         ConversationID, BusinessID, ChannelConnectionID, ContactID, Status,
         LastMessageAtUtc, LastInboundAtUtc, LastOutboundAtUtc,
         CreatedAtUtc, UpdatedAtUtc
       ) VALUES
       (@convA, @businessId, @channelConnectionId, @contactA, N'OPEN',
        DATEADD(day, -1, SYSUTCDATETIME()), DATEADD(day, -1, SYSUTCDATETIME()), NULL,
        DATEADD(day, -10, SYSUTCDATETIME()), SYSUTCDATETIME()),
       (@convB, @businessId, @channelConnectionId, @contactB, N'OPEN',
        NULL, NULL, SYSUTCDATETIME(),
        SYSUTCDATETIME(), SYSUTCDATETIME())`,
      [
        { name: "convA", type: sql.UniqueIdentifier, value: convA },
        { name: "convB", type: sql.UniqueIdentifier, value: convB },
        { name: "businessId", type: sql.UniqueIdentifier, value: businessId },
        {
          name: "channelConnectionId",
          type: sql.UniqueIdentifier,
          value: channelConnectionId,
        },
        { name: "contactA", type: sql.UniqueIdentifier, value: contactA },
        { name: "contactB", type: sql.UniqueIdentifier, value: contactB },
      ],
    );

    await query(
      `INSERT INTO TblMessage (
         MessageID, BusinessID, ConversationID, ChannelConnectionID, ContactID,
         Direction, Provider, ProviderMessageID, ContentType, TextContent,
         ProviderTimestampUtc, ReceivedAtUtc, CreatedAtUtc
       ) VALUES (
         @msgId, @businessId, @convA, @channelConnectionId, @contactA,
         N'INBOUND', N'baileys', @pmid, N'TEXT', N'history',
         SYSUTCDATETIME(), SYSUTCDATETIME(), SYSUTCDATETIME()
       )`,
      [
        { name: "msgId", type: sql.UniqueIdentifier, value: msgId },
        { name: "businessId", type: sql.UniqueIdentifier, value: businessId },
        { name: "convA", type: sql.UniqueIdentifier, value: convA },
        {
          name: "channelConnectionId",
          type: sql.UniqueIdentifier,
          value: channelConnectionId,
        },
        { name: "contactA", type: sql.UniqueIdentifier, value: contactA },
        {
          name: "pmid",
          type: sql.NVarChar(256),
          value: `hist-${randomUUID()}`,
        },
      ],
    );

    await query(
      `INSERT INTO TblConversationAiState (
         BusinessID, ConversationID, Mode, PausedAtUtc, PauseReason,
         ResumedAtUtc, LastHumanOutboundProviderMessageID,
         CreatedAtUtc, UpdatedAtUtc
       ) VALUES (
         @businessId, @convB, N'HUMAN_PAUSED', SYSUTCDATETIME(), N'HUMAN_TAKEOVER',
         NULL, @lastHuman, SYSUTCDATETIME(), SYSUTCDATETIME()
       )`,
      [
        { name: "businessId", type: sql.UniqueIdentifier, value: businessId },
        { name: "convB", type: sql.UniqueIdentifier, value: convB },
        {
          name: "lastHuman",
          type: sql.NVarChar(256),
          value: providerObsId,
        },
      ],
    );

    await query(
      `INSERT INTO TblWhatsappOutboundObservation (
         OutboundObservationID, BusinessID, ChannelConnectionID, ConversationID,
         ContactID, ProviderMessageID, Origin, PhoneNormalized, ExternalContactKey,
         OccurredAtUtc, CreatedAtUtc
       ) VALUES (
         @obsId, @businessId, @channelConnectionId, @convB,
         @contactB, @providerObsId, N'HUMAN_MANUAL', @phone, @jid,
         SYSUTCDATETIME(), SYSUTCDATETIME()
       )`,
      [
        { name: "obsId", type: sql.UniqueIdentifier, value: obsId },
        { name: "businessId", type: sql.UniqueIdentifier, value: businessId },
        {
          name: "channelConnectionId",
          type: sql.UniqueIdentifier,
          value: channelConnectionId,
        },
        { name: "convB", type: sql.UniqueIdentifier, value: convB },
        { name: "contactB", type: sql.UniqueIdentifier, value: contactB },
        {
          name: "providerObsId",
          type: sql.NVarChar(256),
          value: providerObsId,
        },
        { name: "phone", type: sql.NVarChar(32), value: phone },
        {
          name: "jid",
          type: sql.NVarChar(256),
          value: `${phone}@s.whatsapp.net`,
        },
      ],
    );

    await execMergeWithRetry();

    const contacts = await query<{ ContactID: string; ExternalContactKey: string }>(
      `SELECT ContactID, ExternalContactKey FROM TblContact
       WHERE BusinessID = @businessId
         AND ChannelConnectionID = @channelConnectionId
         AND PhoneNormalized = @phone`,
      [
        { name: "businessId", type: sql.UniqueIdentifier, value: businessId },
        {
          name: "channelConnectionId",
          type: sql.UniqueIdentifier,
          value: channelConnectionId,
        },
        { name: "phone", type: sql.NVarChar(32), value: phone },
      ],
    );
    expect(contacts.recordset.length).toBe(1);
    expect(String(contacts.recordset[0]?.ContactID).toLowerCase()).toBe(
      contactA.toLowerCase(),
    );
    expect(contacts.recordset[0]?.ExternalContactKey).toBe(phone);

    const convs = await query<{ ConversationID: string }>(
      `SELECT ConversationID FROM TblConversation
       WHERE BusinessID = @businessId AND ContactID = @contactA`,
      [
        { name: "businessId", type: sql.UniqueIdentifier, value: businessId },
        { name: "contactA", type: sql.UniqueIdentifier, value: contactA },
      ],
    );
    expect(convs.recordset.length).toBe(1);
    expect(String(convs.recordset[0]?.ConversationID).toLowerCase()).toBe(
      convA.toLowerCase(),
    );

    const msgs = await query<{ Cnt: number }>(
      `SELECT COUNT(1) AS Cnt FROM TblMessage
       WHERE BusinessID = @businessId AND ConversationID = @convA AND MessageID = @msgId`,
      [
        { name: "businessId", type: sql.UniqueIdentifier, value: businessId },
        { name: "convA", type: sql.UniqueIdentifier, value: convA },
        { name: "msgId", type: sql.UniqueIdentifier, value: msgId },
      ],
    );
    expect(Number(msgs.recordset[0]?.Cnt)).toBe(1);

    const state = await getEffectiveConversationAiState({
      businessId,
      conversationId: convA,
    });
    expect(state.mode).toBe("HUMAN_PAUSED");
    expect(state.pauseReason).toBe("HUMAN_TAKEOVER");
    expect(state.lastHumanOutboundProviderMessageId).toBe(providerObsId);

    const obs = await query<{ ConversationID: string; ContactID: string }>(
      `SELECT ConversationID, ContactID FROM TblWhatsappOutboundObservation
       WHERE OutboundObservationID = @obsId`,
      [{ name: "obsId", type: sql.UniqueIdentifier, value: obsId }],
    );
    expect(String(obs.recordset[0]?.ConversationID).toLowerCase()).toBe(
      convA.toLowerCase(),
    );
    expect(String(obs.recordset[0]?.ContactID).toLowerCase()).toBe(
      contactA.toLowerCase(),
    );

    const gone = await query<{ Cnt: number }>(
      `SELECT COUNT(1) AS Cnt FROM TblContact WHERE ContactID = @contactB`,
      [{ name: "contactB", type: sql.UniqueIdentifier, value: contactB }],
    );
    expect(Number(gone.recordset[0]?.Cnt)).toBe(0);

    // Restore unique index if merge proc path dropped it for seeding
    await query(
      `IF NOT EXISTS (
         SELECT 1 FROM sys.indexes
         WHERE name = N'UQ_TblContact_Business_Channel_PhoneNormalized'
           AND object_id = OBJECT_ID(N'dbo.TblContact')
       )
       CREATE UNIQUE INDEX UQ_TblContact_Business_Channel_PhoneNormalized
         ON dbo.TblContact (BusinessID, ChannelConnectionID, PhoneNormalized)
         WHERE PhoneNormalized IS NOT NULL`,
    );

    const idx = await query<{ Cnt: number }>(
      `SELECT COUNT(1) AS Cnt FROM sys.indexes
       WHERE name = N'UQ_TblContact_Business_Channel_PhoneNormalized'
         AND object_id = OBJECT_ID(N'dbo.TblContact')`,
    );
    expect(Number(idx.recordset[0]?.Cnt)).toBe(1);

    // Unique index enforced
    await expect(
      query(
        `INSERT INTO TblContact (
           ContactID, BusinessID, ChannelConnectionID, ExternalContactKey,
           DisplayName, PhoneNormalized, CreatedAtUtc, UpdatedAtUtc
         ) VALUES (
           NEWID(), @businessId, @channelConnectionId, @otherKey,
           NULL, @phone, SYSUTCDATETIME(), SYSUTCDATETIME()
         )`,
        [
          { name: "businessId", type: sql.UniqueIdentifier, value: businessId },
          {
            name: "channelConnectionId",
            type: sql.UniqueIdentifier,
            value: channelConnectionId,
          },
          {
            name: "otherKey",
            type: sql.NVarChar(256),
            value: `${phone}-dup-key`,
          },
          { name: "phone", type: sql.NVarChar(32), value: phone },
        ],
      ),
    ).rejects.toThrow();
  });

  it("16. SAFETY_PAUSED wins over HUMAN_PAUSED during merge", async ({ skip }) => {
    requireDb(skip);
    const phone = "201111963201";
    const contactA = randomUUID();
    const contactB = randomUUID();
    const convA = randomUUID();
    const convB = randomUUID();

    await query(
      `IF EXISTS (
         SELECT 1 FROM sys.indexes
         WHERE name = N'UQ_TblContact_Business_Channel_PhoneNormalized'
           AND object_id = OBJECT_ID(N'dbo.TblContact')
       )
       DROP INDEX UQ_TblContact_Business_Channel_PhoneNormalized ON dbo.TblContact`,
    );

    await query(
      `INSERT INTO TblContact (
         ContactID, BusinessID, ChannelConnectionID, ExternalContactKey,
         PhoneNormalized, CreatedAtUtc, UpdatedAtUtc
       ) VALUES
       (@contactA, @businessId, @channelConnectionId, @bare, @phone,
        DATEADD(day, -5, SYSUTCDATETIME()), SYSUTCDATETIME()),
       (@contactB, @businessId, @channelConnectionId, @jid, @phone,
        SYSUTCDATETIME(), SYSUTCDATETIME())`,
      [
        { name: "contactA", type: sql.UniqueIdentifier, value: contactA },
        { name: "contactB", type: sql.UniqueIdentifier, value: contactB },
        { name: "businessId", type: sql.UniqueIdentifier, value: businessId },
        {
          name: "channelConnectionId",
          type: sql.UniqueIdentifier,
          value: channelConnectionId,
        },
        { name: "bare", type: sql.NVarChar(256), value: phone },
        {
          name: "jid",
          type: sql.NVarChar(256),
          value: `${phone}@s.whatsapp.net`,
        },
        { name: "phone", type: sql.NVarChar(32), value: phone },
      ],
    );
    await query(
      `INSERT INTO TblConversation (
         ConversationID, BusinessID, ChannelConnectionID, ContactID, Status,
         CreatedAtUtc, UpdatedAtUtc
       ) VALUES
       (@convA, @businessId, @channelConnectionId, @contactA, N'OPEN',
        DATEADD(day, -5, SYSUTCDATETIME()), SYSUTCDATETIME()),
       (@convB, @businessId, @channelConnectionId, @contactB, N'OPEN',
        SYSUTCDATETIME(), SYSUTCDATETIME())`,
      [
        { name: "convA", type: sql.UniqueIdentifier, value: convA },
        { name: "convB", type: sql.UniqueIdentifier, value: convB },
        { name: "businessId", type: sql.UniqueIdentifier, value: businessId },
        {
          name: "channelConnectionId",
          type: sql.UniqueIdentifier,
          value: channelConnectionId,
        },
        { name: "contactA", type: sql.UniqueIdentifier, value: contactA },
        { name: "contactB", type: sql.UniqueIdentifier, value: contactB },
      ],
    );
    // Give A a message so it is canonical; B has SAFETY_PAUSED
    await query(
      `INSERT INTO TblMessage (
         MessageID, BusinessID, ConversationID, ChannelConnectionID, ContactID,
         Direction, Provider, ProviderMessageID, ContentType, TextContent,
         ReceivedAtUtc, CreatedAtUtc
       ) VALUES (
         NEWID(), @businessId, @convA, @channelConnectionId, @contactA,
         N'INBOUND', N'baileys', @pmid, N'TEXT', N'x',
         SYSUTCDATETIME(), SYSUTCDATETIME()
       )`,
      [
        { name: "businessId", type: sql.UniqueIdentifier, value: businessId },
        { name: "convA", type: sql.UniqueIdentifier, value: convA },
        {
          name: "channelConnectionId",
          type: sql.UniqueIdentifier,
          value: channelConnectionId,
        },
        { name: "contactA", type: sql.UniqueIdentifier, value: contactA },
        { name: "pmid", type: sql.NVarChar(256), value: `s-${randomUUID()}` },
      ],
    );
    await query(
      `INSERT INTO TblConversationAiState (
         BusinessID, ConversationID, Mode, PausedAtUtc, PauseReason,
         CreatedAtUtc, UpdatedAtUtc
       ) VALUES
       (@businessId, @convA, N'HUMAN_PAUSED', SYSUTCDATETIME(), N'HUMAN_TAKEOVER',
        SYSUTCDATETIME(), SYSUTCDATETIME()),
       (@businessId, @convB, N'SAFETY_PAUSED', SYSUTCDATETIME(), N'AMBIGUOUS_OUTBOUND',
        SYSUTCDATETIME(), SYSUTCDATETIME())`,
      [
        { name: "businessId", type: sql.UniqueIdentifier, value: businessId },
        { name: "convA", type: sql.UniqueIdentifier, value: convA },
        { name: "convB", type: sql.UniqueIdentifier, value: convB },
      ],
    );

    await execMergeWithRetry();

    const state = await getEffectiveConversationAiState({
      businessId,
      conversationId: convA,
    });
    expect(state.mode).toBe("SAFETY_PAUSED");
    expect(state.pauseReason).toBe("AMBIGUOUS_OUTBOUND");

    await ensurePhoneUniqueIndex();
  });

  it("3. PENDING collision: normalize before repoint with unique index installed", async ({
    skip,
  }) => {
    requireDb(skip);
    const phone = "201111963301";
    const contactA = randomUUID();
    const contactB = randomUUID();
    const convA = randomUUID();
    const convB = randomUUID();
    const msgA = randomUUID();
    const msgB = randomUUID();
    const jobA = randomUUID();
    const jobB = randomUUID();

    await dropPhoneUniqueIndex();
    await query(
      `INSERT INTO TblContact (
         ContactID, BusinessID, ChannelConnectionID, ExternalContactKey,
         PhoneNormalized, CreatedAtUtc, UpdatedAtUtc
       ) VALUES
       (@contactA, @businessId, @channelConnectionId, @bare, @phone,
        DATEADD(day, -3, SYSUTCDATETIME()), SYSUTCDATETIME()),
       (@contactB, @businessId, @channelConnectionId, @jid, @phone,
        SYSUTCDATETIME(), SYSUTCDATETIME())`,
      [
        { name: "contactA", type: sql.UniqueIdentifier, value: contactA },
        { name: "contactB", type: sql.UniqueIdentifier, value: contactB },
        { name: "businessId", type: sql.UniqueIdentifier, value: businessId },
        {
          name: "channelConnectionId",
          type: sql.UniqueIdentifier,
          value: channelConnectionId,
        },
        { name: "bare", type: sql.NVarChar(256), value: phone },
        {
          name: "jid",
          type: sql.NVarChar(256),
          value: `${phone}@s.whatsapp.net`,
        },
        { name: "phone", type: sql.NVarChar(32), value: phone },
      ],
    );
    await query(
      `INSERT INTO TblConversation (
         ConversationID, BusinessID, ChannelConnectionID, ContactID, Status,
         CreatedAtUtc, UpdatedAtUtc
       ) VALUES
       (@convA, @businessId, @channelConnectionId, @contactA, N'OPEN',
        DATEADD(day, -3, SYSUTCDATETIME()), SYSUTCDATETIME()),
       (@convB, @businessId, @channelConnectionId, @contactB, N'OPEN',
        SYSUTCDATETIME(), SYSUTCDATETIME())`,
      [
        { name: "convA", type: sql.UniqueIdentifier, value: convA },
        { name: "convB", type: sql.UniqueIdentifier, value: convB },
        { name: "businessId", type: sql.UniqueIdentifier, value: businessId },
        {
          name: "channelConnectionId",
          type: sql.UniqueIdentifier,
          value: channelConnectionId,
        },
        { name: "contactA", type: sql.UniqueIdentifier, value: contactA },
        { name: "contactB", type: sql.UniqueIdentifier, value: contactB },
      ],
    );
    await query(
      `INSERT INTO TblMessage (
         MessageID, BusinessID, ConversationID, ChannelConnectionID, ContactID,
         Direction, Provider, ProviderMessageID, ContentType, TextContent,
         ReceivedAtUtc, CreatedAtUtc
       ) VALUES
       (@msgA, @businessId, @convA, @channelConnectionId, @contactA,
        N'INBOUND', N'baileys', @pmidA, N'TEXT', N'a',
        SYSUTCDATETIME(), SYSUTCDATETIME()),
       (@msgB, @businessId, @convB, @channelConnectionId, @contactB,
        N'INBOUND', N'baileys', @pmidB, N'TEXT', N'b',
        SYSUTCDATETIME(), SYSUTCDATETIME())`,
      [
        { name: "msgA", type: sql.UniqueIdentifier, value: msgA },
        { name: "msgB", type: sql.UniqueIdentifier, value: msgB },
        { name: "businessId", type: sql.UniqueIdentifier, value: businessId },
        { name: "convA", type: sql.UniqueIdentifier, value: convA },
        { name: "convB", type: sql.UniqueIdentifier, value: convB },
        {
          name: "channelConnectionId",
          type: sql.UniqueIdentifier,
          value: channelConnectionId,
        },
        { name: "contactA", type: sql.UniqueIdentifier, value: contactA },
        { name: "contactB", type: sql.UniqueIdentifier, value: contactB },
        { name: "pmidA", type: sql.NVarChar(256), value: `pa-${randomUUID()}` },
        { name: "pmidB", type: sql.NVarChar(256), value: `pb-${randomUUID()}` },
      ],
    );
    await query(
      `INSERT INTO TblAiReplyJob (
         AiReplyJobID, BusinessID, ChannelConnectionID, ConversationID, ContactID,
         TriggerMessageID, Status, NotBeforeUtc, AttemptCount,
         CreatedAtUtc, UpdatedAtUtc
       ) VALUES
       (@jobA, @businessId, @channelConnectionId, @convA, @contactA,
        @msgA, N'PENDING', SYSUTCDATETIME(), 0, SYSUTCDATETIME(), SYSUTCDATETIME()),
       (@jobB, @businessId, @channelConnectionId, @convB, @contactB,
        @msgB, N'PENDING', SYSUTCDATETIME(), 0, SYSUTCDATETIME(), SYSUTCDATETIME())`,
      [
        { name: "jobA", type: sql.UniqueIdentifier, value: jobA },
        { name: "jobB", type: sql.UniqueIdentifier, value: jobB },
        { name: "businessId", type: sql.UniqueIdentifier, value: businessId },
        {
          name: "channelConnectionId",
          type: sql.UniqueIdentifier,
          value: channelConnectionId,
        },
        { name: "convA", type: sql.UniqueIdentifier, value: convA },
        { name: "convB", type: sql.UniqueIdentifier, value: convB },
        { name: "contactA", type: sql.UniqueIdentifier, value: contactA },
        { name: "contactB", type: sql.UniqueIdentifier, value: contactB },
        { name: "msgA", type: sql.UniqueIdentifier, value: msgA },
        { name: "msgB", type: sql.UniqueIdentifier, value: msgB },
      ],
    );

    // Active-job filtered indexes stay installed; phone uniqueness restored after merge.
    await expect(execMergeWithRetry()).resolves.toBeUndefined();
    await ensurePhoneUniqueIndex();

    const contacts = await query<{ Cnt: number }>(
      `SELECT COUNT(1) AS Cnt FROM TblContact
       WHERE BusinessID = @businessId AND PhoneNormalized = @phone`,
      [
        { name: "businessId", type: sql.UniqueIdentifier, value: businessId },
        { name: "phone", type: sql.NVarChar(32), value: phone },
      ],
    );
    expect(Number(contacts.recordset[0]?.Cnt)).toBe(1);

    const pending = await query<{
      AiReplyJobID: string;
      Status: string;
      LastErrorCode: string | null;
    }>(
      `SELECT AiReplyJobID, Status, LastErrorCode FROM TblAiReplyJob
       WHERE AiReplyJobID IN (@jobA, @jobB)`,
      [
        { name: "jobA", type: sql.UniqueIdentifier, value: jobA },
        { name: "jobB", type: sql.UniqueIdentifier, value: jobB },
      ],
    );
    const pendingRows = pending.recordset.filter((r) => r.Status === "PENDING");
    const coalesced = pending.recordset.filter((r) => r.Status === "COALESCED");
    expect(pendingRows.length).toBe(1);
    expect(coalesced.length).toBe(1);
    expect(String(pendingRows[0]?.AiReplyJobID).toLowerCase()).toBe(
      jobA.toLowerCase(),
    );
    expect(coalesced[0]?.LastErrorCode).toBe("DEDUP_CONTACT_MERGE_PENDING");

    const pointed = await query<{ ConversationID: string; ContactID: string }>(
      `SELECT ConversationID, ContactID FROM TblAiReplyJob
       WHERE AiReplyJobID IN (@jobA, @jobB)`,
      [
        { name: "jobA", type: sql.UniqueIdentifier, value: jobA },
        { name: "jobB", type: sql.UniqueIdentifier, value: jobB },
      ],
    );
    for (const row of pointed.recordset) {
      expect(String(row.ConversationID).toLowerCase()).toBe(convA.toLowerCase());
      expect(String(row.ContactID).toLowerCase()).toBe(contactA.toLowerCase());
    }

    const pendingIdx = await query<{ Cnt: number }>(
      `SELECT COUNT(1) AS Cnt FROM sys.indexes
       WHERE name = N'UQ_TblAiReplyJob_Business_Conversation_Pending'
         AND object_id = OBJECT_ID(N'dbo.TblAiReplyJob')`,
    );
    expect(Number(pendingIdx.recordset[0]?.Cnt)).toBe(1);
  });

  it("4. PROCESSING collision: normalize before repoint", async ({ skip }) => {
    requireDb(skip);
    const phone = "201111963401";
    const contactA = randomUUID();
    const contactB = randomUUID();
    const convA = randomUUID();
    const convB = randomUUID();
    const msgA = randomUUID();
    const msgB = randomUUID();
    const jobA = randomUUID();
    const jobB = randomUUID();

    await dropPhoneUniqueIndex();
    await query(
      `INSERT INTO TblContact (
         ContactID, BusinessID, ChannelConnectionID, ExternalContactKey,
         PhoneNormalized, CreatedAtUtc, UpdatedAtUtc
       ) VALUES
       (@contactA, @businessId, @channelConnectionId, @bare, @phone,
        DATEADD(day, -3, SYSUTCDATETIME()), SYSUTCDATETIME()),
       (@contactB, @businessId, @channelConnectionId, @jid, @phone,
        SYSUTCDATETIME(), SYSUTCDATETIME())`,
      [
        { name: "contactA", type: sql.UniqueIdentifier, value: contactA },
        { name: "contactB", type: sql.UniqueIdentifier, value: contactB },
        { name: "businessId", type: sql.UniqueIdentifier, value: businessId },
        {
          name: "channelConnectionId",
          type: sql.UniqueIdentifier,
          value: channelConnectionId,
        },
        { name: "bare", type: sql.NVarChar(256), value: phone },
        {
          name: "jid",
          type: sql.NVarChar(256),
          value: `${phone}@s.whatsapp.net`,
        },
        { name: "phone", type: sql.NVarChar(32), value: phone },
      ],
    );
    await query(
      `INSERT INTO TblConversation (
         ConversationID, BusinessID, ChannelConnectionID, ContactID, Status,
         CreatedAtUtc, UpdatedAtUtc
       ) VALUES
       (@convA, @businessId, @channelConnectionId, @contactA, N'OPEN',
        DATEADD(day, -3, SYSUTCDATETIME()), SYSUTCDATETIME()),
       (@convB, @businessId, @channelConnectionId, @contactB, N'OPEN',
        SYSUTCDATETIME(), SYSUTCDATETIME())`,
      [
        { name: "convA", type: sql.UniqueIdentifier, value: convA },
        { name: "convB", type: sql.UniqueIdentifier, value: convB },
        { name: "businessId", type: sql.UniqueIdentifier, value: businessId },
        {
          name: "channelConnectionId",
          type: sql.UniqueIdentifier,
          value: channelConnectionId,
        },
        { name: "contactA", type: sql.UniqueIdentifier, value: contactA },
        { name: "contactB", type: sql.UniqueIdentifier, value: contactB },
      ],
    );
    await query(
      `INSERT INTO TblMessage (
         MessageID, BusinessID, ConversationID, ChannelConnectionID, ContactID,
         Direction, Provider, ProviderMessageID, ContentType, TextContent,
         ReceivedAtUtc, CreatedAtUtc
       ) VALUES
       (@msgA, @businessId, @convA, @channelConnectionId, @contactA,
        N'INBOUND', N'baileys', @pmidA, N'TEXT', N'a',
        SYSUTCDATETIME(), SYSUTCDATETIME()),
       (@msgB, @businessId, @convB, @channelConnectionId, @contactB,
        N'INBOUND', N'baileys', @pmidB, N'TEXT', N'b',
        SYSUTCDATETIME(), SYSUTCDATETIME())`,
      [
        { name: "msgA", type: sql.UniqueIdentifier, value: msgA },
        { name: "msgB", type: sql.UniqueIdentifier, value: msgB },
        { name: "businessId", type: sql.UniqueIdentifier, value: businessId },
        { name: "convA", type: sql.UniqueIdentifier, value: convA },
        { name: "convB", type: sql.UniqueIdentifier, value: convB },
        {
          name: "channelConnectionId",
          type: sql.UniqueIdentifier,
          value: channelConnectionId,
        },
        { name: "contactA", type: sql.UniqueIdentifier, value: contactA },
        { name: "contactB", type: sql.UniqueIdentifier, value: contactB },
        { name: "pmidA", type: sql.NVarChar(256), value: `pra-${randomUUID()}` },
        { name: "pmidB", type: sql.NVarChar(256), value: `prb-${randomUUID()}` },
      ],
    );
    await query(
      `INSERT INTO TblAiReplyJob (
         AiReplyJobID, BusinessID, ChannelConnectionID, ConversationID, ContactID,
         TriggerMessageID, Status, NotBeforeUtc, AttemptCount,
         LeaseUntilUtc, StartedAtUtc, CreatedAtUtc, UpdatedAtUtc
       ) VALUES
       (@jobA, @businessId, @channelConnectionId, @convA, @contactA,
        @msgA, N'PROCESSING', SYSUTCDATETIME(), 1,
        DATEADD(minute, 5, SYSUTCDATETIME()), SYSUTCDATETIME(), SYSUTCDATETIME(), SYSUTCDATETIME()),
       (@jobB, @businessId, @channelConnectionId, @convB, @contactB,
        @msgB, N'PROCESSING', SYSUTCDATETIME(), 1,
        DATEADD(minute, 5, SYSUTCDATETIME()), SYSUTCDATETIME(), SYSUTCDATETIME(), SYSUTCDATETIME())`,
      [
        { name: "jobA", type: sql.UniqueIdentifier, value: jobA },
        { name: "jobB", type: sql.UniqueIdentifier, value: jobB },
        { name: "businessId", type: sql.UniqueIdentifier, value: businessId },
        {
          name: "channelConnectionId",
          type: sql.UniqueIdentifier,
          value: channelConnectionId,
        },
        { name: "convA", type: sql.UniqueIdentifier, value: convA },
        { name: "convB", type: sql.UniqueIdentifier, value: convB },
        { name: "contactA", type: sql.UniqueIdentifier, value: contactA },
        { name: "contactB", type: sql.UniqueIdentifier, value: contactB },
        { name: "msgA", type: sql.UniqueIdentifier, value: msgA },
        { name: "msgB", type: sql.UniqueIdentifier, value: msgB },
      ],
    );

    await expect(execMergeWithRetry()).resolves.toBeUndefined();
    await ensurePhoneUniqueIndex();

    const jobs = await query<{
      AiReplyJobID: string;
      Status: string;
      LastErrorCode: string | null;
      ConversationID: string;
    }>(
      `SELECT AiReplyJobID, Status, LastErrorCode, ConversationID
       FROM TblAiReplyJob WHERE AiReplyJobID IN (@jobA, @jobB)`,
      [
        { name: "jobA", type: sql.UniqueIdentifier, value: jobA },
        { name: "jobB", type: sql.UniqueIdentifier, value: jobB },
      ],
    );
    const processing = jobs.recordset.filter((r) => r.Status === "PROCESSING");
    const failed = jobs.recordset.filter((r) => r.Status === "FAILED");
    expect(processing.length).toBe(1);
    expect(failed.length).toBe(1);
    expect(String(processing[0]?.AiReplyJobID).toLowerCase()).toBe(
      jobA.toLowerCase(),
    );
    expect(failed[0]?.LastErrorCode).toBe("DEDUP_CONTACT_MERGE_PROCESSING");
    for (const row of jobs.recordset) {
      expect(String(row.ConversationID).toLowerCase()).toBe(convA.toLowerCase());
    }

    const idx = await query<{ Cnt: number }>(
      `SELECT COUNT(1) AS Cnt FROM sys.indexes
       WHERE name = N'UQ_TblAiReplyJob_Business_Conversation_Processing'
         AND object_id = OBJECT_ID(N'dbo.TblAiReplyJob')`,
    );
    expect(Number(idx.recordset[0]?.Cnt)).toBe(1);
  });

  it("5. PROCESSING + PENDING combination both preserved", async ({ skip }) => {
    requireDb(skip);
    const phone = "201111963501";
    const contactA = randomUUID();
    const contactB = randomUUID();
    const convA = randomUUID();
    const convB = randomUUID();
    const msgA = randomUUID();
    const msgB = randomUUID();
    const jobProc = randomUUID();
    const jobPend = randomUUID();

    await dropPhoneUniqueIndex();
    await query(
      `INSERT INTO TblContact (
         ContactID, BusinessID, ChannelConnectionID, ExternalContactKey,
         PhoneNormalized, CreatedAtUtc, UpdatedAtUtc
       ) VALUES
       (@contactA, @businessId, @channelConnectionId, @bare, @phone,
        DATEADD(day, -2, SYSUTCDATETIME()), SYSUTCDATETIME()),
       (@contactB, @businessId, @channelConnectionId, @jid, @phone,
        SYSUTCDATETIME(), SYSUTCDATETIME())`,
      [
        { name: "contactA", type: sql.UniqueIdentifier, value: contactA },
        { name: "contactB", type: sql.UniqueIdentifier, value: contactB },
        { name: "businessId", type: sql.UniqueIdentifier, value: businessId },
        {
          name: "channelConnectionId",
          type: sql.UniqueIdentifier,
          value: channelConnectionId,
        },
        { name: "bare", type: sql.NVarChar(256), value: phone },
        {
          name: "jid",
          type: sql.NVarChar(256),
          value: `${phone}@s.whatsapp.net`,
        },
        { name: "phone", type: sql.NVarChar(32), value: phone },
      ],
    );
    await query(
      `INSERT INTO TblConversation (
         ConversationID, BusinessID, ChannelConnectionID, ContactID, Status,
         CreatedAtUtc, UpdatedAtUtc
       ) VALUES
       (@convA, @businessId, @channelConnectionId, @contactA, N'OPEN',
        DATEADD(day, -2, SYSUTCDATETIME()), SYSUTCDATETIME()),
       (@convB, @businessId, @channelConnectionId, @contactB, N'OPEN',
        SYSUTCDATETIME(), SYSUTCDATETIME())`,
      [
        { name: "convA", type: sql.UniqueIdentifier, value: convA },
        { name: "convB", type: sql.UniqueIdentifier, value: convB },
        { name: "businessId", type: sql.UniqueIdentifier, value: businessId },
        {
          name: "channelConnectionId",
          type: sql.UniqueIdentifier,
          value: channelConnectionId,
        },
        { name: "contactA", type: sql.UniqueIdentifier, value: contactA },
        { name: "contactB", type: sql.UniqueIdentifier, value: contactB },
      ],
    );
    await query(
      `INSERT INTO TblMessage (
         MessageID, BusinessID, ConversationID, ChannelConnectionID, ContactID,
         Direction, Provider, ProviderMessageID, ContentType, TextContent,
         ReceivedAtUtc, CreatedAtUtc
       ) VALUES
       (@msgA, @businessId, @convA, @channelConnectionId, @contactA,
        N'INBOUND', N'baileys', @pmidA, N'TEXT', N'a',
        SYSUTCDATETIME(), SYSUTCDATETIME()),
       (@msgB, @businessId, @convB, @channelConnectionId, @contactB,
        N'INBOUND', N'baileys', @pmidB, N'TEXT', N'b',
        SYSUTCDATETIME(), SYSUTCDATETIME())`,
      [
        { name: "msgA", type: sql.UniqueIdentifier, value: msgA },
        { name: "msgB", type: sql.UniqueIdentifier, value: msgB },
        { name: "businessId", type: sql.UniqueIdentifier, value: businessId },
        { name: "convA", type: sql.UniqueIdentifier, value: convA },
        { name: "convB", type: sql.UniqueIdentifier, value: convB },
        {
          name: "channelConnectionId",
          type: sql.UniqueIdentifier,
          value: channelConnectionId,
        },
        { name: "contactA", type: sql.UniqueIdentifier, value: contactA },
        { name: "contactB", type: sql.UniqueIdentifier, value: contactB },
        { name: "pmidA", type: sql.NVarChar(256), value: `ma-${randomUUID()}` },
        { name: "pmidB", type: sql.NVarChar(256), value: `mb-${randomUUID()}` },
      ],
    );
    await query(
      `INSERT INTO TblAiReplyJob (
         AiReplyJobID, BusinessID, ChannelConnectionID, ConversationID, ContactID,
         TriggerMessageID, Status, NotBeforeUtc, AttemptCount,
         LeaseUntilUtc, StartedAtUtc, CreatedAtUtc, UpdatedAtUtc
       ) VALUES
       (@jobProc, @businessId, @channelConnectionId, @convA, @contactA,
        @msgA, N'PROCESSING', SYSUTCDATETIME(), 1,
        DATEADD(minute, 5, SYSUTCDATETIME()), SYSUTCDATETIME(), SYSUTCDATETIME(), SYSUTCDATETIME()),
       (@jobPend, @businessId, @channelConnectionId, @convB, @contactB,
        @msgB, N'PENDING', SYSUTCDATETIME(), 0,
        NULL, NULL, SYSUTCDATETIME(), SYSUTCDATETIME())`,
      [
        { name: "jobProc", type: sql.UniqueIdentifier, value: jobProc },
        { name: "jobPend", type: sql.UniqueIdentifier, value: jobPend },
        { name: "businessId", type: sql.UniqueIdentifier, value: businessId },
        {
          name: "channelConnectionId",
          type: sql.UniqueIdentifier,
          value: channelConnectionId,
        },
        { name: "convA", type: sql.UniqueIdentifier, value: convA },
        { name: "convB", type: sql.UniqueIdentifier, value: convB },
        { name: "contactA", type: sql.UniqueIdentifier, value: contactA },
        { name: "contactB", type: sql.UniqueIdentifier, value: contactB },
        { name: "msgA", type: sql.UniqueIdentifier, value: msgA },
        { name: "msgB", type: sql.UniqueIdentifier, value: msgB },
      ],
    );

    await execMergeWithRetry();
    await ensurePhoneUniqueIndex();

    const jobs = await query<{ Status: string; ConversationID: string }>(
      `SELECT Status, ConversationID FROM TblAiReplyJob
       WHERE AiReplyJobID IN (@jobProc, @jobPend)`,
      [
        { name: "jobProc", type: sql.UniqueIdentifier, value: jobProc },
        { name: "jobPend", type: sql.UniqueIdentifier, value: jobPend },
      ],
    );
    const statuses = jobs.recordset.map((r) => r.Status).sort();
    expect(statuses).toEqual(["PENDING", "PROCESSING"]);
    for (const row of jobs.recordset) {
      expect(String(row.ConversationID).toLowerCase()).toBe(convA.toLowerCase());
    }
  });

  it("6. loop guard: latest PausedUntilUtc preserved on canonical", async ({
    skip,
  }) => {
    requireDb(skip);
    const phone = "201111963601";
    const contactA = randomUUID();
    const contactB = randomUUID();
    const convA = randomUUID();
    const convB = randomUUID();
    const msgA = randomUUID();

    await dropPhoneUniqueIndex();
    await query(
      `INSERT INTO TblContact (
         ContactID, BusinessID, ChannelConnectionID, ExternalContactKey,
         PhoneNormalized, CreatedAtUtc, UpdatedAtUtc
       ) VALUES
       (@contactA, @businessId, @channelConnectionId, @bare, @phone,
        DATEADD(day, -2, SYSUTCDATETIME()), SYSUTCDATETIME()),
       (@contactB, @businessId, @channelConnectionId, @jid, @phone,
        SYSUTCDATETIME(), SYSUTCDATETIME())`,
      [
        { name: "contactA", type: sql.UniqueIdentifier, value: contactA },
        { name: "contactB", type: sql.UniqueIdentifier, value: contactB },
        { name: "businessId", type: sql.UniqueIdentifier, value: businessId },
        {
          name: "channelConnectionId",
          type: sql.UniqueIdentifier,
          value: channelConnectionId,
        },
        { name: "bare", type: sql.NVarChar(256), value: phone },
        {
          name: "jid",
          type: sql.NVarChar(256),
          value: `${phone}@s.whatsapp.net`,
        },
        { name: "phone", type: sql.NVarChar(32), value: phone },
      ],
    );
    await query(
      `INSERT INTO TblConversation (
         ConversationID, BusinessID, ChannelConnectionID, ContactID, Status,
         CreatedAtUtc, UpdatedAtUtc
       ) VALUES
       (@convA, @businessId, @channelConnectionId, @contactA, N'OPEN',
        DATEADD(day, -2, SYSUTCDATETIME()), SYSUTCDATETIME()),
       (@convB, @businessId, @channelConnectionId, @contactB, N'OPEN',
        SYSUTCDATETIME(), SYSUTCDATETIME())`,
      [
        { name: "convA", type: sql.UniqueIdentifier, value: convA },
        { name: "convB", type: sql.UniqueIdentifier, value: convB },
        { name: "businessId", type: sql.UniqueIdentifier, value: businessId },
        {
          name: "channelConnectionId",
          type: sql.UniqueIdentifier,
          value: channelConnectionId,
        },
        { name: "contactA", type: sql.UniqueIdentifier, value: contactA },
        { name: "contactB", type: sql.UniqueIdentifier, value: contactB },
      ],
    );
    await query(
      `INSERT INTO TblMessage (
         MessageID, BusinessID, ConversationID, ChannelConnectionID, ContactID,
         Direction, Provider, ProviderMessageID, ContentType, TextContent,
         ReceivedAtUtc, CreatedAtUtc
       ) VALUES (
         @msgA, @businessId, @convA, @channelConnectionId, @contactA,
         N'INBOUND', N'baileys', @pmid, N'TEXT', N'hist',
         SYSUTCDATETIME(), SYSUTCDATETIME()
       )`,
      [
        { name: "msgA", type: sql.UniqueIdentifier, value: msgA },
        { name: "businessId", type: sql.UniqueIdentifier, value: businessId },
        { name: "convA", type: sql.UniqueIdentifier, value: convA },
        {
          name: "channelConnectionId",
          type: sql.UniqueIdentifier,
          value: channelConnectionId,
        },
        { name: "contactA", type: sql.UniqueIdentifier, value: contactA },
        { name: "pmid", type: sql.NVarChar(256), value: `g-${randomUUID()}` },
      ],
    );
    await query(
      `INSERT INTO TblAiConversationGuard (
         BusinessID, ConversationID, PausedUntilUtc, PauseReason, TriggeredAtUtc,
         CreatedAtUtc, UpdatedAtUtc
       ) VALUES
       (@businessId, @convA, DATEADD(minute, 5, SYSUTCDATETIME()), N'SHORT',
        DATEADD(minute, -10, SYSUTCDATETIME()), SYSUTCDATETIME(), SYSUTCDATETIME()),
       (@businessId, @convB, DATEADD(hour, 2, SYSUTCDATETIME()), N'LONGER',
        SYSUTCDATETIME(), SYSUTCDATETIME(), SYSUTCDATETIME())`,
      [
        { name: "businessId", type: sql.UniqueIdentifier, value: businessId },
        { name: "convA", type: sql.UniqueIdentifier, value: convA },
        { name: "convB", type: sql.UniqueIdentifier, value: convB },
      ],
    );

    await execMergeWithRetry();
    await ensurePhoneUniqueIndex();

    const guards = await query<{
      ConversationID: string;
      PausedUntilUtc: Date;
      PauseReason: string | null;
    }>(
      `SELECT ConversationID, PausedUntilUtc, PauseReason
       FROM TblAiConversationGuard
       WHERE BusinessID = @businessId
         AND ConversationID IN (@convA, @convB)`,
      [
        { name: "businessId", type: sql.UniqueIdentifier, value: businessId },
        { name: "convA", type: sql.UniqueIdentifier, value: convA },
        { name: "convB", type: sql.UniqueIdentifier, value: convB },
      ],
    );
    expect(guards.recordset.length).toBe(1);
    expect(String(guards.recordset[0]?.ConversationID).toLowerCase()).toBe(
      convA.toLowerCase(),
    );
    // Latest pause wins (duplicate's +2h)
    const pausedUntil = new Date(guards.recordset[0]!.PausedUntilUtc).getTime();
    expect(pausedUntil).toBeGreaterThan(Date.now() + 30 * 60 * 1000);
  });

  it("8. inverse: JID canonical + bare duplicate → digits ExternalContactKey", async ({
    skip,
  }) => {
    requireDb(skip);
    const phone = "201111963701";
    const contactA = randomUUID();
    const contactB = randomUUID();
    const convA = randomUUID();
    const convB = randomUUID();
    const msgA = randomUUID();

    await dropPhoneUniqueIndex();
    // History/canonical starts as JID; duplicate holds bare digits.
    await query(
      `INSERT INTO TblContact (
         ContactID, BusinessID, ChannelConnectionID, ExternalContactKey,
         PhoneNormalized, CreatedAtUtc, UpdatedAtUtc
       ) VALUES
       (@contactA, @businessId, @channelConnectionId, @jid, @phone,
        DATEADD(day, -5, SYSUTCDATETIME()), SYSUTCDATETIME()),
       (@contactB, @businessId, @channelConnectionId, @bare, @phone,
        SYSUTCDATETIME(), SYSUTCDATETIME())`,
      [
        { name: "contactA", type: sql.UniqueIdentifier, value: contactA },
        { name: "contactB", type: sql.UniqueIdentifier, value: contactB },
        { name: "businessId", type: sql.UniqueIdentifier, value: businessId },
        {
          name: "channelConnectionId",
          type: sql.UniqueIdentifier,
          value: channelConnectionId,
        },
        {
          name: "jid",
          type: sql.NVarChar(256),
          value: `${phone}@s.whatsapp.net`,
        },
        { name: "bare", type: sql.NVarChar(256), value: phone },
        { name: "phone", type: sql.NVarChar(32), value: phone },
      ],
    );
    await query(
      `INSERT INTO TblConversation (
         ConversationID, BusinessID, ChannelConnectionID, ContactID, Status,
         CreatedAtUtc, UpdatedAtUtc
       ) VALUES
       (@convA, @businessId, @channelConnectionId, @contactA, N'OPEN',
        DATEADD(day, -5, SYSUTCDATETIME()), SYSUTCDATETIME()),
       (@convB, @businessId, @channelConnectionId, @contactB, N'OPEN',
        SYSUTCDATETIME(), SYSUTCDATETIME())`,
      [
        { name: "convA", type: sql.UniqueIdentifier, value: convA },
        { name: "convB", type: sql.UniqueIdentifier, value: convB },
        { name: "businessId", type: sql.UniqueIdentifier, value: businessId },
        {
          name: "channelConnectionId",
          type: sql.UniqueIdentifier,
          value: channelConnectionId,
        },
        { name: "contactA", type: sql.UniqueIdentifier, value: contactA },
        { name: "contactB", type: sql.UniqueIdentifier, value: contactB },
      ],
    );
    await query(
      `INSERT INTO TblMessage (
         MessageID, BusinessID, ConversationID, ChannelConnectionID, ContactID,
         Direction, Provider, ProviderMessageID, ContentType, TextContent,
         ReceivedAtUtc, CreatedAtUtc
       ) VALUES (
         @msgA, @businessId, @convA, @channelConnectionId, @contactA,
         N'INBOUND', N'baileys', @pmid, N'TEXT', N'history',
         SYSUTCDATETIME(), SYSUTCDATETIME()
       )`,
      [
        { name: "msgA", type: sql.UniqueIdentifier, value: msgA },
        { name: "businessId", type: sql.UniqueIdentifier, value: businessId },
        { name: "convA", type: sql.UniqueIdentifier, value: convA },
        {
          name: "channelConnectionId",
          type: sql.UniqueIdentifier,
          value: channelConnectionId,
        },
        { name: "contactA", type: sql.UniqueIdentifier, value: contactA },
        { name: "pmid", type: sql.NVarChar(256), value: `inv-${randomUUID()}` },
      ],
    );

    await execMergeWithRetry();
    await ensurePhoneUniqueIndex();

    const contacts = await query<{
      ContactID: string;
      ExternalContactKey: string;
    }>(
      `SELECT ContactID, ExternalContactKey FROM TblContact
       WHERE BusinessID = @businessId AND PhoneNormalized = @phone`,
      [
        { name: "businessId", type: sql.UniqueIdentifier, value: businessId },
        { name: "phone", type: sql.NVarChar(32), value: phone },
      ],
    );
    expect(contacts.recordset.length).toBe(1);
    expect(String(contacts.recordset[0]?.ContactID).toLowerCase()).toBe(
      contactA.toLowerCase(),
    );
    expect(contacts.recordset[0]?.ExternalContactKey).toBe(phone);
  });
});
