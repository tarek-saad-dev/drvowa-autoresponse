/**
 * Internal pricing wallet access — NOT a payment approval or public API.
 * The caller MUST verify subscription / signed payment and settlement state.
 * Do not invoke until the rollout flag and SQL-backed integration tests pass.
 */
import { randomUUID } from "node:crypto";
import { query, sql } from "@/lib/db";

export type CreditMutationOutcome = "APPLIED" | "DUPLICATE" | "INSUFFICIENT" | "NO_WALLET" | "NO_CONSUMPTION";

function requireKey(value: string, maxLength: number): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength) throw new Error("INVALID_CREDIT_KEY");
  return trimmed;
}
function validateReplies(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > 10000000) throw new Error("INVALID_CREDIT_AMOUNT");
  return value;
}
function outcome(value: unknown): CreditMutationOutcome {
  if (value === "APPLIED" || value === "DUPLICATE" || value === "INSUFFICIENT" ||
    value === "NO_WALLET" || value === "NO_CONSUMPTION") return value;
  throw new Error("UNEXPECTED_CREDIT_OUTCOME");
}
export async function grantVerifiedReplies(input: {
  businessId: string; entitlementKey: string; replies: number; reference: string;
}): Promise<CreditMutationOutcome> {
  const result = await query<{ Outcome: string }>(
    "EXEC dbo.PricingV1GrantReplies @BusinessID, @IdempotencyKey, @EventID, @Replies, @Reference",
    [
      { name: "BusinessID", type: sql.UniqueIdentifier, value: input.businessId },
      { name: "IdempotencyKey", type: sql.NVarChar(160), value: requireKey(input.entitlementKey, 160) },
      { name: "EventID", type: sql.UniqueIdentifier, value: randomUUID() },
      { name: "Replies", type: sql.BigInt, value: validateReplies(input.replies) },
      { name: "Reference", type: sql.NVarChar(200), value: requireKey(input.reference, 200) },
    ],
  );
  return outcome(result.recordset[0]?.Outcome);
}
export async function consumeDeliveredReply(input: {
  businessId: string; deliveryId: string;
}): Promise<CreditMutationOutcome> {
  const result = await query<{ Outcome: string }>(
    "EXEC dbo.PricingV1ConsumeReply @BusinessID, @IdempotencyKey, @EventID",
    [
      { name: "BusinessID", type: sql.UniqueIdentifier, value: input.businessId },
      { name: "IdempotencyKey", type: sql.NVarChar(160), value: requireKey("reply:" + input.deliveryId, 160) },
      { name: "EventID", type: sql.UniqueIdentifier, value: randomUUID() },
    ],
  );
  return outcome(result.recordset[0]?.Outcome);
}
export async function reverseUndeliveredReply(input: {
  businessId: string; consumedEventId: string;
}): Promise<CreditMutationOutcome> {
  const result = await query<{ Outcome: string }>(
    "EXEC dbo.PricingV1ReverseFailedReply @BusinessID, @OriginalConsumeEventID, @EventID",
    [
      { name: "BusinessID", type: sql.UniqueIdentifier, value: input.businessId },
      { name: "OriginalConsumeEventID", type: sql.UniqueIdentifier, value: input.consumedEventId },
      { name: "EventID", type: sql.UniqueIdentifier, value: randomUUID() },
    ],
  );
  return outcome(result.recordset[0]?.Outcome);
}
