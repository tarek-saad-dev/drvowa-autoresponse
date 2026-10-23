import { query, sql, withTransaction } from "@/lib/db";
import { getChannelConnection } from "@/modules/channels/repository";
import { sendAccountMessage, WhatsAppRuntimeError } from "@/modules/channels/runtime-client";
import {
  consumeQuotaReservation,
  releaseQuotaReservation,
  reserveQuota,
} from "@/modules/billing/entitlements";
import { isPlanEntitlementError } from "@/modules/billing/errors";
import { USAGE_EVENT_WHATSAPP_OUTBOUND } from "@/modules/billing/period";
import { getBusinessById } from "@/modules/businesses/service";
import {
  getContactForBusiness,
  getConversationForBusiness,
  insertMessageIdempotent,
  touchConversationOutbound,
} from "@/modules/messaging/repository";
import {
  escalationNudgeMessage,
  sendBotSelfEscalationAlert,
} from "./bot-self-notify";

type HoldJob = {
  EscalationID: string;
  BusinessID: string;
  ConversationID: string;
  ChannelConnectionID: string;
  CustomerHoldStep: number;
  CreatedAtUtc: Date;
};

const MAX_HOLD_STEPS = 4; // 1 ack + 3 delay apologies
const FOLLOW_UP_DELAY_SECONDS = [0, 300, 600, 900] as const;
const ABSORB_DEBOUNCE_MS = 45_000;
const ABSORB_FOLLOWUP_DELAY_SECONDS = 300;

const HOLD_TEMPLATES = [
  "حاضر يا فندم، تمام. هحوّلك دلوقتي لأحد المسؤولين، وهيراجع طلبك ويرد عليك في أقرب وقت. شكرًا لصبرك.",
  "بنعتذر لحضرتك على التأخير يا فندم. المسؤول لسه بيراجع طلبك، وهيتواصل معاك في أقرب فرصة.",
  "لسه مع حضرتك، ومقدرين انتظارك. المسؤول هيكمّل معاك في أقرب وقت، ومتأسفين على التأخير.",
  "بنعتذر تاني على التأخير. فريقنا لسه بيتابع حالتك، وهيتم الرد عليك في أقرب وقت ممكن.",
] as const;

const ABSORB_TEMPLATES = {
  default:
    "حاضر يا فندم، تمام. طلبك متحوّل للمسؤول وهيراجع ويرد عليك في أقرب وقت.",
  impatient:
    "حاضر يا فندم، فاهمين طلبك كويس. هخلي المسؤول يكلمك دلوقتي، ومتأسفين على الانتظار.",
} as const;

function holdText(step: number): string {
  return HOLD_TEMPLATES[Math.min(step, HOLD_TEMPLATES.length - 1)]!;
}

function absorbText(customerText: string | null | undefined): string {
  const raw = String(customerText || "").trim().toLowerCase()
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي");
  const impatient = /مطلبتش|انا طلبت|اتكلم مع|مسؤول|مسئول|موظف|مستعجل|فين الرد|لسه|التأخير|حد يرد/u.test(raw);
  return impatient ? ABSORB_TEMPLATES.impatient : ABSORB_TEMPLATES.default;
}

function nextDelaySeconds(nextStep: number): number | null {
  if (nextStep >= MAX_HOLD_STEPS) return null;
  return FOLLOW_UP_DELAY_SECONDS[Math.min(nextStep, FOLLOW_UP_DELAY_SECONDS.length - 1)] ?? 600;
}

async function stopHold(escalationId: string, businessId: string, code: string | null) {
  await query(
    `UPDATE dbo.TblHumanEscalation
        SET CustomerHoldNextAtUtc = NULL,
            CustomerHoldClaimedAtUtc = NULL,
            CustomerHoldLastErrorCode = @code,
            UpdatedAtUtc = SYSUTCDATETIME()
      WHERE EscalationID = @id AND BusinessID = @businessId`,
    [
      { name: "id", type: sql.UniqueIdentifier, value: escalationId },
      { name: "businessId", type: sql.UniqueIdentifier, value: businessId },
      { name: "code", type: sql.NVarChar(80), value: code },
    ],
  );
}

async function humanAlreadyReplied(job: HoldJob): Promise<boolean> {
  const result = await query<{ Found: number }>(
    `SELECT TOP 1 1 AS Found
       FROM dbo.TblMessage
      WHERE BusinessID = @businessId
        AND ConversationID = @conversationId
        AND Direction = N'OUTBOUND'
        AND Origin = N'HUMAN'
        AND ReceivedAtUtc >= @createdAt
      ORDER BY ReceivedAtUtc DESC`,
    [
      { name: "businessId", type: sql.UniqueIdentifier, value: job.BusinessID },
      { name: "conversationId", type: sql.UniqueIdentifier, value: job.ConversationID },
      { name: "createdAt", type: sql.DateTime2, value: job.CreatedAtUtc },
    ],
  );
  return Boolean(result.recordset[0]);
}

/**
 * Sends programmed customer hold / delay-apology messages while a human case is open.
 * Stops when a human agent replies or the escalation is resolved.
 */
export async function deliverNextCustomerHoldMessage(
  send: typeof sendAccountMessage = sendAccountMessage,
): Promise<"IDLE" | "SENT" | "RETRY" | "STOPPED" | "FAILED" | "UNKNOWN"> {
  // Unstick claims left mid-send after a worker crash (do not auto-resend that step).
  await query(
    `UPDATE dbo.TblHumanEscalation
        SET CustomerHoldNextAtUtc = NULL,
            CustomerHoldClaimedAtUtc = NULL,
            CustomerHoldLastErrorCode = N'WORKER_CRASH_HOLD_UNCERTAIN',
            UpdatedAtUtc = SYSUTCDATETIME()
      WHERE CustomerHoldClaimedAtUtc IS NOT NULL
        AND CustomerHoldClaimedAtUtc < DATEADD(minute, -10, SYSUTCDATETIME())
        AND ResolvedAtUtc IS NULL`,
  );

  const claimed = await query<HoldJob>(
    `;WITH due AS (
      SELECT TOP (1) *
        FROM dbo.TblHumanEscalation WITH (UPDLOCK, READPAST, ROWLOCK)
       WHERE ResolvedAtUtc IS NULL
         AND Status IN (N'OPEN', N'ACKNOWLEDGED')
         AND CustomerHoldNextAtUtc IS NOT NULL
         AND CustomerHoldNextAtUtc <= SYSUTCDATETIME()
         AND CustomerHoldClaimedAtUtc IS NULL
       ORDER BY CustomerHoldNextAtUtc, CreatedAtUtc
    )
    UPDATE due
       SET CustomerHoldClaimedAtUtc = SYSUTCDATETIME(),
           UpdatedAtUtc = SYSUTCDATETIME()
    OUTPUT INSERTED.EscalationID, INSERTED.BusinessID, INSERTED.ConversationID,
           INSERTED.ChannelConnectionID, INSERTED.CustomerHoldStep, INSERTED.CreatedAtUtc;`,
  );
  const job = claimed.recordset[0];
  if (!job) return "IDLE";

  const step = Number(job.CustomerHoldStep) || 0;
  if (step >= MAX_HOLD_STEPS) {
    await stopHold(job.EscalationID, job.BusinessID, "HOLD_MAX_REACHED");
    return "STOPPED";
  }

  if (await humanAlreadyReplied(job)) {
    await stopHold(job.EscalationID, job.BusinessID, "HUMAN_REPLIED");
    return "STOPPED";
  }

  const [conversation, channel] = await Promise.all([
    getConversationForBusiness({
      businessId: job.BusinessID,
      conversationId: job.ConversationID,
    }),
    getChannelConnection({
      businessId: job.BusinessID,
      channelConnectionId: job.ChannelConnectionID,
    }),
  ]);
  const contact = conversation
    ? await getContactForBusiness({
      businessId: job.BusinessID,
      contactId: conversation.contactId,
    })
    : null;

  const destination =
    contact?.phoneNormalized
    || (contact?.externalContactKey?.endsWith("@lid")
      ? contact.externalContactKey
      : null);

  if (!conversation || !channel?.externalAccountKey || !channel.isActive || !destination) {
    await stopHold(job.EscalationID, job.BusinessID, "HOLD_DESTINATION_UNAVAILABLE");
    return "FAILED";
  }

  const text = holdText(step);
  const reservationKey = `escalation-hold:${job.EscalationID}:${step}`;
  const idempotencyKey = `escalation-hold:${job.EscalationID}:step-${step}`;

  let releaseEligible = false;
  let held = false;
  try {
    const reserved = await reserveQuota({
      businessId: job.BusinessID,
      eventType: USAGE_EVENT_WHATSAPP_OUTBOUND,
      reservationKey,
    });
    held = reserved.state === "RESERVED" || reserved.state === "UNCERTAIN";
    releaseEligible = reserved.state === "RESERVED" && reserved.idempotent === false;
  } catch (error) {
    if (isPlanEntitlementError(error)) {
      await stopHold(job.EscalationID, job.BusinessID, error.code);
      return "FAILED";
    }
    throw error;
  }

  let sendResult;
  try {
    sendResult = await send({
      accountKey: channel.externalAccountKey,
      phone: destination,
      message: text,
      idempotencyKey,
    });
  } catch (error) {
    const code = error instanceof WhatsAppRuntimeError ? error.code : "HOLD_SEND_ERROR";
    if (["NOT_READY", "NOT_STARTED", "LOGGED_OUT"].includes(code)) {
      if (held && releaseEligible) {
        await releaseQuotaReservation({
          businessId: job.BusinessID,
          eventType: USAGE_EVENT_WHATSAPP_OUTBOUND,
          reservationKey,
        }).catch(() => undefined);
      }
      await query(
        `UPDATE dbo.TblHumanEscalation
            SET CustomerHoldClaimedAtUtc = NULL,
                CustomerHoldNextAtUtc = DATEADD(second, 90, SYSUTCDATETIME()),
                CustomerHoldLastErrorCode = @code,
                UpdatedAtUtc = SYSUTCDATETIME()
          WHERE EscalationID = @id AND BusinessID = @businessId`,
        [
          { name: "id", type: sql.UniqueIdentifier, value: job.EscalationID },
          { name: "businessId", type: sql.UniqueIdentifier, value: job.BusinessID },
          { name: "code", type: sql.NVarChar(80), value: code },
        ],
      );
      return "RETRY";
    }
    // Ambiguous/timeout: keep reservation uncertain by not releasing.
    await stopHold(job.EscalationID, job.BusinessID, code);
    return "UNKNOWN";
  }

  const statusLower = (sendResult.status ?? "").toLowerCase();
  const ok = Boolean(sendResult.success || statusLower === "sent" || statusLower === "duplicate");
  const providerMessageId = sendResult.originalMessageId ?? sendResult.messageId ?? null;
  if (!ok || !providerMessageId) {
    if (["NOT_READY", "NOT_STARTED", "LOGGED_OUT"].includes(sendResult.code ?? "")) {
      await query(
        `UPDATE dbo.TblHumanEscalation
            SET CustomerHoldClaimedAtUtc = NULL,
                CustomerHoldNextAtUtc = DATEADD(second, 90, SYSUTCDATETIME()),
                CustomerHoldLastErrorCode = @code,
                UpdatedAtUtc = SYSUTCDATETIME()
          WHERE EscalationID = @id AND BusinessID = @businessId`,
        [
          { name: "id", type: sql.UniqueIdentifier, value: job.EscalationID },
          { name: "businessId", type: sql.UniqueIdentifier, value: job.BusinessID },
          { name: "code", type: sql.NVarChar(80), value: sendResult.code ?? "NOT_READY" },
        ],
      );
      return "RETRY";
    }
    await stopHold(job.EscalationID, job.BusinessID, sendResult.code ?? "HOLD_SEND_FAILED");
    return "FAILED";
  }

  const sentAt = new Date();
  const nextStep = step + 1;
  const delaySec = nextDelaySeconds(nextStep);

  await withTransaction(async (trx) => {
    await insertMessageIdempotent(
      {
        businessId: job.BusinessID,
        conversationId: job.ConversationID,
        channelConnectionId: job.ChannelConnectionID,
        contactId: conversation.contactId,
        direction: "OUTBOUND",
        provider: "baileys",
        origin: "SYSTEM",
        providerMessageId: String(providerMessageId),
        contentType: "TEXT",
        textContent: text,
        providerTimestampUtc: sentAt,
        receivedAtUtc: sentAt,
      },
      trx,
    );
    await touchConversationOutbound(
      {
        businessId: job.BusinessID,
        conversationId: job.ConversationID,
        at: sentAt,
      },
      trx,
    );
    await consumeQuotaReservation({
      businessId: job.BusinessID,
      eventType: USAGE_EVENT_WHATSAPP_OUTBOUND,
      reservationKey,
      metadata: {
        source: "escalation_customer_hold",
        escalationId: job.EscalationID,
        step,
        providerMessageId: String(providerMessageId),
      },
      trx,
    });
    await trx.execute(
      `UPDATE dbo.TblHumanEscalation
          SET CustomerHoldStep = @nextStep,
              CustomerHoldClaimedAtUtc = NULL,
              CustomerHoldLastProviderMessageID = @providerMessageId,
              CustomerHoldLastErrorCode = NULL,
              CustomerHoldNextAtUtc = CASE
                WHEN @delaySec IS NULL THEN NULL
                ELSE DATEADD(second, @delaySec, SYSUTCDATETIME())
              END,
              UpdatedAtUtc = SYSUTCDATETIME()
        WHERE EscalationID = @id AND BusinessID = @businessId`,
      [
        { name: "id", type: sql.UniqueIdentifier, value: job.EscalationID },
        { name: "businessId", type: sql.UniqueIdentifier, value: job.BusinessID },
        { name: "nextStep", type: sql.Int, value: nextStep },
        { name: "providerMessageId", type: sql.NVarChar(256), value: String(providerMessageId) },
        { name: "delaySec", type: sql.Int, value: delaySec ?? null },
      ],
    );
  });

  return "SENT";
}

/**
 * When a customer writes again while waiting for a human, reply immediately with
 * a programmed "حاضر" absorb message (does not wait for the timer follow-up).
 */
export async function maybeSendCustomerHoldAbsorbOnInbound(params: {
  businessId: string;
  conversationId: string;
  customerText?: string | null;
  send?: typeof sendAccountMessage;
}): Promise<"SENT" | "SKIPPED" | "FAILED" | "UNKNOWN"> {
  const send = params.send ?? sendAccountMessage;
  const open = await query<{
    EscalationID: string;
    ChannelConnectionID: string;
    CustomerHoldStep: number;
    CreatedAtUtc: Date;
  }>(
    `SELECT TOP 1 EscalationID, ChannelConnectionID, CustomerHoldStep, CreatedAtUtc
       FROM dbo.TblHumanEscalation
      WHERE BusinessID = @businessId
        AND ConversationID = @conversationId
        AND ResolvedAtUtc IS NULL
        AND Status IN (N'OPEN', N'ACKNOWLEDGED')
      ORDER BY CreatedAtUtc DESC`,
    [
      { name: "businessId", type: sql.UniqueIdentifier, value: params.businessId },
      { name: "conversationId", type: sql.UniqueIdentifier, value: params.conversationId },
    ],
  );
  const escalation = open.recordset[0];
  if (!escalation) return "SKIPPED";

  const job: HoldJob = {
    EscalationID: escalation.EscalationID,
    BusinessID: params.businessId,
    ConversationID: params.conversationId,
    ChannelConnectionID: escalation.ChannelConnectionID,
    CustomerHoldStep: Number(escalation.CustomerHoldStep) || 0,
    CreatedAtUtc: escalation.CreatedAtUtc,
  };
  if (await humanAlreadyReplied(job)) {
    await stopHold(job.EscalationID, job.BusinessID, "HUMAN_REPLIED");
    return "SKIPPED";
  }

  const recent = await query<{ Found: number }>(
    `SELECT TOP 1 1 AS Found
       FROM dbo.TblMessage
      WHERE BusinessID = @businessId
        AND ConversationID = @conversationId
        AND Direction = N'OUTBOUND'
        AND Origin = N'SYSTEM'
        AND ReceivedAtUtc >= DATEADD(second, -@debounceSec, SYSUTCDATETIME())`,
    [
      { name: "businessId", type: sql.UniqueIdentifier, value: params.businessId },
      { name: "conversationId", type: sql.UniqueIdentifier, value: params.conversationId },
      { name: "debounceSec", type: sql.Int, value: Math.ceil(ABSORB_DEBOUNCE_MS / 1000) },
    ],
  );
  if (recent.recordset[0]) return "SKIPPED";

  const [conversation, channel] = await Promise.all([
    getConversationForBusiness({
      businessId: params.businessId,
      conversationId: params.conversationId,
    }),
    getChannelConnection({
      businessId: params.businessId,
      channelConnectionId: escalation.ChannelConnectionID,
    }),
  ]);
  const contact = conversation
    ? await getContactForBusiness({
      businessId: params.businessId,
      contactId: conversation.contactId,
    })
    : null;
  const destination =
    contact?.phoneNormalized
    || (contact?.externalContactKey?.endsWith("@lid")
      ? contact.externalContactKey
      : null);
  if (!conversation || !channel?.externalAccountKey || !channel.isActive || !destination) {
    return "FAILED";
  }

  const text = absorbText(params.customerText);
  const nonce = Date.now().toString(36);
  const reservationKey = `escalation-absorb:${job.EscalationID}:${nonce}`;
  const idempotencyKey = `escalation-absorb:${job.EscalationID}:${nonce}`;

  let releaseEligible = false;
  let held = false;
  try {
    const reserved = await reserveQuota({
      businessId: params.businessId,
      eventType: USAGE_EVENT_WHATSAPP_OUTBOUND,
      reservationKey,
    });
    held = reserved.state === "RESERVED" || reserved.state === "UNCERTAIN";
    releaseEligible = reserved.state === "RESERVED" && reserved.idempotent === false;
  } catch (error) {
    if (isPlanEntitlementError(error)) return "FAILED";
    throw error;
  }

  let sendResult;
  try {
    sendResult = await send({
      accountKey: channel.externalAccountKey,
      phone: destination,
      message: text,
      idempotencyKey,
    });
  } catch (error) {
    const code = error instanceof WhatsAppRuntimeError ? error.code : "ABSORB_SEND_ERROR";
    if (held && releaseEligible && ["NOT_READY", "NOT_STARTED", "LOGGED_OUT"].includes(code)) {
      await releaseQuotaReservation({
        businessId: params.businessId,
        eventType: USAGE_EVENT_WHATSAPP_OUTBOUND,
        reservationKey,
      }).catch(() => undefined);
    }
    return ["NOT_READY", "NOT_STARTED", "LOGGED_OUT"].includes(code) ? "FAILED" : "UNKNOWN";
  }

  const statusLower = (sendResult.status ?? "").toLowerCase();
  const ok = Boolean(sendResult.success || statusLower === "sent" || statusLower === "duplicate");
  const providerMessageId = sendResult.originalMessageId ?? sendResult.messageId ?? null;
  if (!ok || !providerMessageId) {
    if (held && releaseEligible) {
      await releaseQuotaReservation({
        businessId: params.businessId,
        eventType: USAGE_EVENT_WHATSAPP_OUTBOUND,
        reservationKey,
      }).catch(() => undefined);
    }
    return "FAILED";
  }

  const sentAt = new Date();
  await withTransaction(async (trx) => {
    await insertMessageIdempotent(
      {
        businessId: params.businessId,
        conversationId: params.conversationId,
        channelConnectionId: escalation.ChannelConnectionID,
        contactId: conversation.contactId,
        direction: "OUTBOUND",
        provider: "baileys",
        origin: "SYSTEM",
        providerMessageId: String(providerMessageId),
        contentType: "TEXT",
        textContent: text,
        providerTimestampUtc: sentAt,
        receivedAtUtc: sentAt,
      },
      trx,
    );
    await touchConversationOutbound(
      {
        businessId: params.businessId,
        conversationId: params.conversationId,
        at: sentAt,
      },
      trx,
    );
    await consumeQuotaReservation({
      businessId: params.businessId,
      eventType: USAGE_EVENT_WHATSAPP_OUTBOUND,
      reservationKey,
      metadata: {
        source: "escalation_customer_absorb",
        escalationId: job.EscalationID,
        providerMessageId: String(providerMessageId),
      },
      trx,
    });
    // Push the next timed delay-apology so we don't immediately stack another apology.
    await trx.execute(
      `UPDATE dbo.TblHumanEscalation
          SET CustomerHoldClaimedAtUtc = NULL,
              CustomerHoldLastProviderMessageID = @providerMessageId,
              CustomerHoldLastErrorCode = NULL,
              CustomerHoldNextAtUtc = DATEADD(second, @delaySec, SYSUTCDATETIME()),
              UpdatedAtUtc = SYSUTCDATETIME()
        WHERE EscalationID = @id AND BusinessID = @businessId AND ResolvedAtUtc IS NULL`,
      [
        { name: "id", type: sql.UniqueIdentifier, value: job.EscalationID },
        { name: "businessId", type: sql.UniqueIdentifier, value: params.businessId },
        { name: "providerMessageId", type: sql.NVarChar(256), value: String(providerMessageId) },
        { name: "delaySec", type: sql.Int, value: ABSORB_FOLLOWUP_DELAY_SECONDS },
      ],
    );
  });

  // Nudge staff on the bot phone whenever the waiting customer writes again.
  try {
    const setting = await query<{
      OwnerPhone: string | null;
      NotifyBotSelfEnabled: boolean | null;
    }>(
      `SELECT OwnerPhone, NotifyBotSelfEnabled
         FROM dbo.TblHumanEscalationSetting
        WHERE BusinessID = @businessId`,
      [{ name: "businessId", type: sql.UniqueIdentifier, value: params.businessId }],
    );
    const cfg = setting.recordset[0];
    if (cfg?.NotifyBotSelfEnabled !== false && channel.externalAccountKey) {
      const business = await getBusinessById({ businessId: params.businessId });
      await sendBotSelfEscalationAlert({
        accountKey: channel.externalAccountKey,
        ownerPhone: cfg?.OwnerPhone ?? null,
        escalationId: job.EscalationID,
        kind: "nudge",
        message: escalationNudgeMessage({
          businessId: params.businessId,
          businessName: business?.name ?? "البيزنس",
          customerPhone: contact?.phoneNormalized,
          customerLabel: contact?.externalContactKey,
          conversationId: params.conversationId,
          lastCustomerText: params.customerText,
        }),
      });
    }
  } catch (error) {
    console.warn("[customer-hold] bot_self_nudge_failed", {
      code: error instanceof Error ? error.name : "UNKNOWN",
    });
  }

  return "SENT";
}
