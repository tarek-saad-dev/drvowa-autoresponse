/**
 * Only the unanswered customer tail may be picked up on manual AI resume.
 * The input is the latest messages in reverse chronological order (all types,
 * not just TEXT). Never silently skip a photo/voice note or an outbound reply.
 */
export type CatchUpMessage = {
  messageId: string;
  direction: string;
  contentType: string;
  textContent: string | null;
  receivedAtUtc: Date;
};

export type CatchUpCandidate = {
  triggerMessageId: string;
  receivedAtUtc: Date;
  pendingCount: number;
};

export function selectPendingCustomerTail(
  newestFirst: readonly CatchUpMessage[],
): CatchUpCandidate | null {
  if (!newestFirst.length || newestFirst[0].direction !== "INBOUND") {
    return null;
  }

  let pendingCount = 0;
  for (const message of newestFirst) {
    if (message.direction === "OUTBOUND") break;
    if (
      message.direction !== "INBOUND"
      || message.contentType !== "TEXT"
      || !message.textContent?.trim()
    ) {
      // Media-only, empty, or otherwise ambiguous tail: leave it to a human.
      return null;
    }
    pendingCount += 1;
  }

  return pendingCount
    ? {
        triggerMessageId: newestFirst[0].messageId,
        receivedAtUtc: newestFirst[0].receivedAtUtc,
        pendingCount,
      }
    : null;
}
