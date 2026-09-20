/**
 * Plan entitlement / quota errors. Safe, non-secret codes for APIs and AI jobs.
 */

export const PLAN_ERROR_CODES = {
  WHATSAPP_CONNECTION_LIMIT: "PLAN_WHATSAPP_CONNECTION_LIMIT",
  AGENT_LIMIT: "PLAN_AGENT_LIMIT",
  KNOWLEDGE_LIMIT: "PLAN_KNOWLEDGE_LIMIT",
  AI_QUOTA_EXCEEDED: "PLAN_AI_QUOTA_EXCEEDED",
  WHATSAPP_OUTBOUND_QUOTA_EXCEEDED: "PLAN_WHATSAPP_OUTBOUND_QUOTA_EXCEEDED",
  SUBSCRIPTION_INACTIVE: "PLAN_SUBSCRIPTION_INACTIVE",
} as const;

export type PlanErrorCode =
  (typeof PLAN_ERROR_CODES)[keyof typeof PLAN_ERROR_CODES];

export class PlanEntitlementError extends Error {
  readonly statusCode = 403;
  readonly code: PlanErrorCode;

  constructor(code: PlanErrorCode, message?: string) {
    super(message ?? code);
    this.name = "PlanEntitlementError";
    this.code = code;
  }
}

export function isPlanEntitlementError(
  error: unknown,
): error is PlanEntitlementError {
  return (
    error instanceof PlanEntitlementError
    || (
      typeof error === "object"
      && error !== null
      && "code" in error
      && typeof (error as { code: unknown }).code === "string"
      && String((error as { code: string }).code).startsWith("PLAN_")
    )
  );
}
