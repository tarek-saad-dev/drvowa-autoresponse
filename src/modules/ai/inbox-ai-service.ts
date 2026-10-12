import { NotFoundError, ForbiddenError } from "@/lib/tenancy/errors";
import { sql, withTransaction } from "@/lib/db";
import * as messagingRepo from "@/modules/messaging/repository";
import type { ConversationAiState } from "@/types/domain";
import { evaluateConversationLoopGuard } from "./guard-repository";
import { scheduleOrCoalesceJob } from "./jobs-repository";
import { getChannelAiSettingByConnection } from "./settings-repository";
import { selectPendingCustomerTail } from "./resume-catch-up";
import { MAX_HISTORY_MESSAGES } from "./provider";

import {
  getEffectiveConversationAiState,
  pauseConversationAi,
  resumeConversationAi,
} from "./conversation-state-repository";

async function assertConversationOwned(params: {
  businessId: string;
  conversationId: string;
}) {
  const conversation = await messagingRepo.getConversationForBusiness({
    businessId: params.businessId,
    conversationId: params.conversationId,
  });
  if (!conversation) {
    throw new NotFoundError("Conversation not found");
  }
  if (conversation.businessId !== params.businessId) {
    throw new ForbiddenError("Conversation access denied");
  }
  return conversation;
}

export async function getInboxConversationAiState(params: {
  businessId: string;
  conversationId: string;
}): Promise<ConversationAiState> {
  await assertConversationOwned(params);
  return getEffectiveConversationAiState(params);
}

export type ResumeCatchUp = {
  scheduled: boolean;
  pendingCount: number;
  reason?: string;
};

export type ResumeWithCatchUpResult = {
  state: ConversationAiState;
  catchUp: ResumeCatchUp;
};

/**
 * Explicit manual handback to AI. A conversation-row lock serializes concurrent
 * clicks from the SaaS inbox and the external ERP integration.
 *
 * We intentionally queue an existing inbound WITHOUT re-running the normal
 * inbound scheduling watermark gate: manual resume is the explicit permission
 * to answer the outstanding tail. Every other AI safety/activation gate remains.
 */
export async function resumeInboxConversationAiWithCatchUp(params: {
  businessId: string;
  conversationId: string;
}): Promise<ResumeWithCatchUpResult> {
  await assertConversationOwned(params);

  return withTransaction(async (trx) => {
    const inputs = [
      { name: "businessId", type: sql.UniqueIdentifier, value: params.businessId },
      { name: "conversationId", type: sql.UniqueIdentifier, value: params.conversationId },
    ];

    // Exclusive lock is held through the state transition and job insert.
    const locked = await trx.query<{
      ConversationID: string;
      ChannelConnectionID: string;
      ContactID: string;
    }>(
      `SELECT ConversationID, ChannelConnectionID, ContactID
       FROM dbo.TblConversation WITH (UPDLOCK, HOLDLOCK)
       WHERE BusinessID = @businessId AND ConversationID = @conversationId`,
      inputs,
    );
    if (!locked.recordset.length) {
      throw new NotFoundError("Conversation not found");
    }

    const previous = await getEffectiveConversationAiState(params, trx);
    if (previous.mode === "AUTO") {
      // Idempotent retry/double-click. Never queue the same customer tail again.
      return {
        state: previous,
        catchUp: { scheduled: false, pendingCount: 0, reason: "ALREADY_AUTO" },
      };
    }

    const state = await resumeConversationAi(params, trx);
    if (previous.mode !== "HUMAN_PAUSED") {
      // Safety pauses can be explicitly cleared, but never auto-replay history.
      return {
        state,
        catchUp: { scheduled: false, pendingCount: 0, reason: "SAFETY_RESUME" },
      };
    }

    // Include every message type so that voice/images and human replies cannot
    // be skipped over when deciding whether the last customer tail is answerable.
    const latest = await trx.query<{
      MessageID: string;
      Direction: string;
      ContentType: string;
      TextContent: string | null;
      ReceivedAtUtc: Date;
    }>(
      `SELECT TOP (@historyLimit)
         MessageID, Direction, ContentType, TextContent, ReceivedAtUtc
       FROM dbo.TblMessage
       WHERE BusinessID = @businessId AND ConversationID = @conversationId
       ORDER BY ISNULL(ProviderTimestampUtc, CreatedAtUtc) DESC,
                CreatedAtUtc DESC, MessageID DESC`,
      [...inputs, { name: "historyLimit", type: sql.Int, value: MAX_HISTORY_MESSAGES }],
    );
    const candidate = selectPendingCustomerTail(
      latest.recordset.map((m) => ({
        messageId: m.MessageID,
        direction: m.Direction,
        contentType: m.ContentType,
        textContent: m.TextContent,
        receivedAtUtc: m.ReceivedAtUtc,
      })),
    );

    if (!candidate) {
      return {
        state,
        catchUp: { scheduled: false, pendingCount: 0, reason: "NOTHING_PENDING" },
      };
    }

    const base = { scheduled: false, pendingCount: candidate.pendingCount };
    // Never resurrect forgotten threads just because someone toggled a switch.
    if (
      candidate.receivedAtUtc.getTime() < Date.now() - 24 * 60 * 60 * 1000
      || candidate.receivedAtUtc.getTime() > Date.now() + 60_000
    ) {
      return { state, catchUp: { ...base, reason: "STALE_INBOUND" } };
    }

    const conversation = locked.recordset[0];

    const setting = await getChannelAiSettingByConnection({
      businessId: params.businessId,
      channelConnectionId: conversation.ChannelConnectionID,
    }, trx);
    if (!setting?.autoReplyEnabled || !setting.enabledAtUtc) {
      return { state, catchUp: { ...base, reason: "AI_DISABLED" } };
    }
    if (candidate.receivedAtUtc < setting.enabledAtUtc) {
      return { state, catchUp: { ...base, reason: "STALE_ACTIVATION" } };
    }

    // A SENT reply for the same message or any PROCESSING reply in the
    // conversation may already be on the wire. Do not risk a second send.
    const activeReply = await trx.query<{ Status: string }>(
      `SELECT TOP (1) Status FROM dbo.TblAiReplyJob
       WHERE BusinessID = @businessId AND ConversationID = @conversationId
         AND ((TriggerMessageID = @triggerMessageId AND Status = N'SENT')
              OR Status = N'PROCESSING')`,
      [
        ...inputs,
        { name: "triggerMessageId", type: sql.UniqueIdentifier, value: candidate.triggerMessageId },
      ],
    );
    if (activeReply.recordset.length) {
      return { state, catchUp: { ...base, reason:
        activeReply.recordset[0].Status === "SENT" ? "ALREADY_ANSWERED" : "REPLY_IN_FLIGHT" } };
    }

    const guard = await evaluateConversationLoopGuard(params, trx);
    if (!guard.allow) {
      return { state, catchUp: { ...base, reason: guard.reason ?? "LOOP_GUARD_ACTIVE" } };
    }

    // Every existing PENDING job was created while AI was paused (or before
    // the new watermark) and is stale. Retire it before creating a fresh job.
    await trx.execute(
      `UPDATE dbo.TblAiReplyJob
       SET Status = N'SKIPPED', CompletedAtUtc = SYSUTCDATETIME(),
           LastErrorCode = N'RESUMED_REPLACED', UpdatedAtUtc = SYSUTCDATETIME()
       WHERE BusinessID = @businessId AND ConversationID = @conversationId
         AND Status = N'PENDING'`,
      inputs,
    );

    await scheduleOrCoalesceJob({
      businessId: params.businessId,
      channelConnectionId: conversation.ChannelConnectionID,
      conversationId: params.conversationId,
      contactId: conversation.ContactID,
      triggerMessageId: candidate.triggerMessageId,
      debounceMs: 0,
    }, trx);

    return {
      state,
      catchUp: { scheduled: true, pendingCount: candidate.pendingCount },
    };
  });
}

/** Compatible API for callers only interested in the state. */
export async function resumeInboxConversationAi(params: {
  businessId: string;
  conversationId: string;
}): Promise<ConversationAiState> {
  return (await resumeInboxConversationAiWithCatchUp(params)).state;
}

export async function pauseInboxConversationAi(params: {
  businessId: string;
  conversationId: string;
}): Promise<ConversationAiState> {
  await assertConversationOwned(params);
  return pauseConversationAi({
    businessId: params.businessId,
    conversationId: params.conversationId,
    mode: "HUMAN_PAUSED",
    pauseReason: "MANUAL_PAUSE",
  });
}
