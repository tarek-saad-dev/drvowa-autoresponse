import { parseHubTimestamp, SAAS_FINANCIAL_EVENT_PATH } from "./saas-financial-contract";

/** Configuration data only; no capture, HTTP client, or secret resolution. */
export type SaasFinancialConfig = Readonly<{
  endpoint: string | null;
  sourceKey: string | null;
  sourceStatus: "disabled" | "active";
  captureEnabled: boolean;
  deliveryEnabled: boolean;
  reconciliationEnabled: boolean;
  sourceActivatedAt: string | null;
  captureCutoffAt: string | null;
  credentialKeyId: string | null;
  credentialSecretRef: string | null;
}>;

type Environment = Readonly<Record<string, string | undefined>>;
const PREFIX = "DRVO_SAAS_FINANCIAL_";

function fullMatch(pattern: RegExp, value: string): boolean {
  return pattern.exec(value)?.[0] === value;
}

function optional(env: Environment, name: string): string | null {
  const value = env[PREFIX + name];
  if (value === undefined) return null;
  if (value === "" || value !== value.trim()) {
    throw new RangeError(`Invalid ${PREFIX + name}`);
  }
  return value;
}

function flag(env: Environment, name: string): boolean {
  const value = env[PREFIX + name];
  if (value === undefined || value === "0") return false;
  if (value === "1") return true;
  throw new RangeError(`Invalid ${PREFIX + name}; use 0 or 1`);
}

function utcConfigTime(value: string | null, name: string): string | null {
  if (value === null) return null;
  if (!value.endsWith("Z")) throw new RangeError(`Invalid ${PREFIX + name}`);
  return parseHubTimestamp(value).canonical;
}

export function readSaasFinancialConfig(env: Environment = process.env): SaasFinancialConfig {
  const rawEndpoint = optional(env, "ENDPOINT");
  let endpoint: string | null = null;
  if (rawEndpoint !== null) {
    let url: URL;
    try {
      url = new URL(rawEndpoint);
    } catch {
      throw new RangeError("Invalid DRVO_SAAS_FINANCIAL_ENDPOINT");
    }
    if (url.protocol !== "https:" || !url.hostname || url.username || url.password
      || url.search || url.hash || url.pathname !== SAAS_FINANCIAL_EVENT_PATH
      || url.toString() !== rawEndpoint) {
      throw new RangeError("Invalid DRVO_SAAS_FINANCIAL_ENDPOINT");
    }
    endpoint = rawEndpoint;
  }

  const sourceKey = optional(env, "SOURCE_KEY");
  if (sourceKey !== null
    && !fullMatch(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,99}$/, sourceKey)) {
    throw new RangeError("Invalid DRVO_SAAS_FINANCIAL_SOURCE_KEY");
  }
  const sourceStatus = optional(env, "SOURCE_STATUS") ?? "disabled";
  if (sourceStatus !== "disabled" && sourceStatus !== "active") {
    throw new RangeError("Invalid DRVO_SAAS_FINANCIAL_SOURCE_STATUS");
  }

  const captureEnabled = flag(env, "CAPTURE_ENABLED");
  const deliveryEnabled = flag(env, "DELIVERY_ENABLED");
  const reconciliationEnabled = flag(env, "RECONCILIATION_ENABLED");
  const sourceActivatedAt = utcConfigTime(optional(env, "SOURCE_ACTIVATED_AT"), "SOURCE_ACTIVATED_AT");
  const captureCutoffAt = utcConfigTime(optional(env, "CAPTURE_CUTOFF_AT"), "CAPTURE_CUTOFF_AT");
  const credentialKeyId = optional(env, "CREDENTIAL_KEY_ID");
  const credentialSecretRef = optional(env, "CREDENTIAL_SECRET_REF");

  if (credentialKeyId !== null
    && !fullMatch(/^[A-Za-z0-9_-]{1,100}$/, credentialKeyId)) {
    throw new RangeError("Invalid DRVO_SAAS_FINANCIAL_CREDENTIAL_KEY_ID");
  }
  if (credentialSecretRef !== null
    && !fullMatch(/^env:[A-Z][A-Z0-9_]{0,127}$/, credentialSecretRef)
    && !fullMatch(/^secret:\/\/[A-Za-z0-9][A-Za-z0-9/_:.-]{0,199}$/, credentialSecretRef)) {
    throw new RangeError("Invalid DRVO_SAAS_FINANCIAL_CREDENTIAL_SECRET_REF");
  }
  if ((credentialKeyId === null) !== (credentialSecretRef === null)) {
    throw new RangeError("Credential ID and secret reference must be configured together");
  }
  if ((sourceActivatedAt === null) !== (captureCutoffAt === null)) {
    throw new RangeError("Activation and capture cutoff must be configured together");
  }
  if (sourceActivatedAt !== null && captureCutoffAt !== null
    && captureCutoffAt < sourceActivatedAt) {
    throw new RangeError("Capture cutoff precedes Hub source activation");
  }
  if (sourceStatus === "active" && (sourceKey === null || sourceActivatedAt === null)) {
    throw new RangeError("Active source needs its verified identity and activation time");
  }
  if (captureEnabled || deliveryEnabled || reconciliationEnabled) {
    if (sourceStatus !== "active" || endpoint === null || sourceKey === null
      || sourceActivatedAt === null || captureCutoffAt === null) {
      throw new RangeError("Financial controls require a verified active source and boundaries");
    }
  }
  if ((deliveryEnabled || reconciliationEnabled) && !captureEnabled) {
    throw new RangeError("Delivery and reconciliation require capture");
  }
  if ((deliveryEnabled || reconciliationEnabled) && credentialKeyId === null) {
    throw new RangeError("Delivery and reconciliation require credential references");
  }

  return {
    endpoint, sourceKey, sourceStatus, captureEnabled, deliveryEnabled,
    reconciliationEnabled, sourceActivatedAt, captureCutoffAt,
    credentialKeyId, credentialSecretRef,
  };
}
