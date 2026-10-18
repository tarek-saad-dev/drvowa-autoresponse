import { closePool } from "@/lib/db";
import { parsePaymentConfirmedV1 } from "./saas-financial-contract";
import { readSaasFinancialConfig, type SaasFinancialConfig } from "./saas-financial-config";
import { classifyHubResponse, createHubClient, retryDelayMs, type HubResponse } from "./saas-financial-client";
import { claimFinancialEvent, settleFinancialEvent, type FinancialClaim } from "./saas-financial-delivery-repository";

type Environment = Readonly<Record<string, string | undefined>>;
type Logger = Pick<Console, "info" | "warn">;

function boundedInt(value: string | undefined, fallback: number, min: number, max: number, name: string): number {
  if (value === undefined) return fallback;
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))
    || Number(value) < min || Number(value) > max) throw new RangeError(`Invalid ${name}`);
  return Number(value);
}

/** Only environment-injected secrets are supported by this worker. Secret-manager references fail closed. */
export function resolveHubSecret(config: SaasFinancialConfig, env: Environment): string {
  const reference = config.credentialSecretRef;
  if (!reference?.startsWith("env:")) throw new Error("UNSUPPORTED_HUB_SECRET_REFERENCE");
  const name = reference.slice(4);
  if (name === "DRVO_GROUP_FINANCE_EXPORT_TOKEN") throw new Error("FINANCE_EXPORT_TOKEN_REUSE");
  const secret = env[name];
  if (!secret || secret !== secret.trim() || /[\r\n]/.test(secret)) throw new Error("HUB_SECRET_UNAVAILABLE");
  if (env.DRVO_GROUP_FINANCE_EXPORT_TOKEN && secret === env.DRVO_GROUP_FINANCE_EXPORT_TOKEN) {
    throw new Error("FINANCE_EXPORT_TOKEN_REUSE");
  }
  return secret;
}

export function validateClaim(claim: FinancialClaim, activatedAt: string): boolean {
  try {
    const raw = JSON.parse(claim.payload);
    // Capture stores JSON.stringify(event). Equality also rejects duplicate JSON keys.
    if (JSON.stringify(raw) !== claim.payload) return false;
    const event = parsePaymentConfirmedV1(raw, { sourceActivatedAt: activatedAt });
    return event.event_id === claim.eventId && event.source_payment_id === claim.sourcePaymentId
      && String(event.amount_minor) === claim.amountMinor && event.currency === claim.currency;
  } catch { return false; }
}

export async function deliverFinancialClaim(
  claim: FinancialClaim,
  activatedAt: string,
  send: (payload: string) => Promise<HubResponse>,
  settle: typeof settleFinancialEvent = settleFinancialEvent,
  logger: Logger = console,
): Promise<void> {
  if (!validateClaim(claim, activatedAt)) {
    await settle(claim, { state: "DEAD", errorCode: "LOCAL_PAYLOAD_INVALID" });
    logger.warn("[saas-financial-worker] review", { eventId: claim.eventId, code: "LOCAL_PAYLOAD_INVALID" });
    return;
  }
  let decision;
  try {
    decision = classifyHubResponse(await send(claim.payload), claim.eventId);
  } catch {
    // A request may have committed at the Hub before its response was lost.
    decision = { kind: "retry" as const, code: "UNCERTAIN_RESPONSE" };
  }
  const settlement = decision.kind === "accepted"
    ? { state: "ACCEPTED" as const, errorCode: null }
    : decision.kind === "review"
      ? { state: "DEAD" as const, errorCode: decision.code }
      : { state: "PENDING" as const, errorCode: decision.code,
          delayMs: retryDelayMs(claim.attemptCount, decision.retryAfterMs) };
  const owned = await settle(claim, settlement);
  if (!owned) logger.warn("[saas-financial-worker] lease_lost", { eventId: claim.eventId });
  else if (decision.kind !== "accepted") {
    logger.warn(`[saas-financial-worker] ${decision.kind}`, { eventId: claim.eventId, code: decision.code });
  }
}

export function createFinancialWorker(options: {
  env?: Environment;
  claim?: typeof claimFinancialEvent;
  settle?: typeof settleFinancialEvent;
  send?: (payload: string) => Promise<HubResponse>;
  sleep?: (ms: number) => Promise<void>;
  close?: () => Promise<void>;
  logger?: Logger;
} = {}) {
  const env = options.env ?? process.env;
  const config = readSaasFinancialConfig(env);
  const logger = options.logger ?? console;
  const batchSize = boundedInt(env.DRVO_SAAS_FINANCIAL_WORKER_BATCH_SIZE, 10, 1, 100,
    "DRVO_SAAS_FINANCIAL_WORKER_BATCH_SIZE");
  const pollMs = boundedInt(env.DRVO_SAAS_FINANCIAL_WORKER_POLL_MS, 5_000, 100, 60_000,
    "DRVO_SAAS_FINANCIAL_WORKER_POLL_MS");
  const leaseSeconds = 60; // Greater than the 15-second total HTTP timeout.
  const send = config.deliveryEnabled
    ? options.send ?? createHubClient({
        endpoint: config.endpoint!, keyId: config.credentialKeyId!, secret: resolveHubSecret(config, env),
      })
    : undefined;
  // Even a test transport must not bypass runtime credential presence.
  if (config.deliveryEnabled && options.send) resolveHubSecret(config, env);
  const claim = options.claim ?? claimFinancialEvent;
  const settle = options.settle ?? settleFinancialEvent;
  const close = options.close ?? closePool;
  let stopping = false;
  let started = false;
  let wake: (() => void) | null = null;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => {
    const timer = setTimeout(() => { wake = null; resolve(); }, ms);
    wake = () => { clearTimeout(timer); wake = null; resolve(); };
  }));

  return {
    requestShutdown: () => { stopping = true; wake?.(); },
    async loop(): Promise<void> {
      if (started) throw new Error("Financial worker already started");
      started = true;
      if (!config.deliveryEnabled) {
        logger.info("[saas-financial-worker] delivery_disabled");
        return;
      }
      logger.info("[saas-financial-worker] started", { batchSize, pollMs });
      try {
        while (!stopping) {
          try {
            for (let n = 0; n < batchSize && !stopping; n++) {
              const row = await claim(config.sourceKey!, leaseSeconds);
              if (!row) break;
              await deliverFinancialClaim(row, config.sourceActivatedAt!, send!, settle, logger);
            }
          } catch {
            logger.warn("[saas-financial-worker] database_or_loop_error");
          }
          if (!stopping) await sleep(pollMs);
        }
      } finally {
        await close();
        logger.info("[saas-financial-worker] stopped");
      }
    },
  };
}
