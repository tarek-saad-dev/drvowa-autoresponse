import {
  getAccountStatus,
  sendAccountMessage,
  WhatsAppRuntimeError,
} from "@/modules/channels/runtime-client";

const recentNudges = new Map<string, number>();
const NUDGE_DEBOUNCE_MS = 90_000;

/**
 * Mirror an escalation alert into the bot account's own WhatsApp chat
 * ("Message yourself") so staff watching the business phone see it.
 */
export async function sendBotSelfEscalationAlert(params: {
  accountKey: string;
  ownerPhone: string | null;
  escalationId: string;
  message: string;
  kind: "initial" | "nudge";
}): Promise<"SENT" | "SKIPPED" | "FAILED"> {
  let botDest: string | null = null;
  try {
    const status = await getAccountStatus(params.accountKey);
    botDest = status.linkedDestination || status.linkedPhone || null;
  } catch (error) {
    console.warn("[bot-self-notify] status_failed", {
      code: error instanceof WhatsAppRuntimeError ? error.code : "STATUS_FAILED",
    });
    return "FAILED";
  }

  if (!botDest) {
    console.warn("[bot-self-notify] no_linked_destination");
    return "SKIPPED";
  }

  // If the owner alert already targets the bot number, Message-yourself is that send.
  if (params.ownerPhone && botDest === params.ownerPhone && params.kind === "initial") {
    return "SKIPPED";
  }

  if (params.kind === "nudge") {
    const last = recentNudges.get(params.escalationId) ?? 0;
    if (Date.now() - last < NUDGE_DEBOUNCE_MS) return "SKIPPED";
  }

  const idempotencyKey = params.kind === "initial"
    ? `owner-escalation-botself:${params.escalationId}`
    : `owner-escalation-botself-nudge:${params.escalationId}:${Math.floor(Date.now() / NUDGE_DEBOUNCE_MS)}`;

  try {
    const result = await sendAccountMessage({
      accountKey: params.accountKey,
      phone: botDest,
      message: params.message,
      idempotencyKey,
    });
    const ok = Boolean(
      result.success
      || (result.status ?? "").toLowerCase() === "sent"
      || (result.status ?? "").toLowerCase() === "duplicate",
    );
    if (!ok || !result.messageId) {
      console.warn("[bot-self-notify] send_failed", {
        code: result.code ?? "SEND_FAILED",
        destSuffix: botDest.slice(-6),
      });
      return "FAILED";
    }
    if (params.kind === "nudge") {
      recentNudges.set(params.escalationId, Date.now());
    }
    console.info("[bot-self-notify] sent", {
      kind: params.kind,
      destSuffix: botDest.slice(-6),
    });
    return "SENT";
  } catch (error) {
    console.warn("[bot-self-notify] send_error", {
      code: error instanceof WhatsAppRuntimeError ? error.code : "SEND_ERROR",
    });
    return "FAILED";
  }
}

export function escalationNudgeMessage(params: {
  businessName: string;
  customerPhone?: string | null;
  customerLabel?: string | null;
  conversationId: string;
  businessId: string;
  lastCustomerText?: string | null;
}): string {
  const phone = params.customerPhone?.trim() || null;
  const label = phone ? ("+" + phone) : (params.customerLabel?.trim() || "عميل");
  const app = "https://app.drvotech.com/dashboard/inbox?businessId="
    + encodeURIComponent(params.businessId)
    + "&conversationId=" + encodeURIComponent(params.conversationId);
  const snippet = String(params.lastCustomerText || "")
    .replace(/[\r\n\t]+/g, " ")
    .trim()
    .slice(0, 80);
  if (phone) {
    return "🔔 عميل لسه مستني\n"
      + label.slice(0, 64) + "\n"
      + (snippet ? (snippet + "\n") : "")
      + "https://wa.me/" + encodeURIComponent(phone);
  }
  return "🔔 عميل لسه مستني\n"
    + label.slice(0, 64) + "\n"
    + (snippet ? (snippet + "\n") : "")
    + app;
}
