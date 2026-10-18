/** Pure Phase 1 contract for DRVO Tech's SaaS Financial Hub payment endpoint. */

export const SAAS_FINANCIAL_EVENT_PATH = "/api/saas-financial/v1/events" as const;
export const SAAS_FINANCIAL_MAX_AMOUNT_MINOR = 1_000_000_000_000_000 as const;
export const SAAS_FINANCIAL_CURRENCIES = ["EGP", "USD", "SAR"] as const;

export type SaasFinancialCurrency = (typeof SAAS_FINANCIAL_CURRENCIES)[number];

export type PaymentConfirmedV1 = Readonly<{
  schema_version: 1;
  event_id: string;
  type: "payment.confirmed";
  source_payment_id: string;
  amount_minor: number;
  currency: SaasFinancialCurrency;
  occurred_at: string;
}>;

const HUB_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,149}$/;
const PAYMENT_REQUEST_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DECIMAL_12_2 = /^(?:0|[1-9][0-9]{0,9})\.[0-9]{2}$/;
const ISO_OFFSET_SECONDS = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|[+-](?:0\d|1[0-3]):[0-5]\d|[+-]14:00)$/;
const PAYMENT_FIELDS = [
  "schema_version", "event_id", "type", "source_payment_id",
  "amount_minor", "currency", "occurred_at",
] as const;

function fullMatch(pattern: RegExp, value: string): boolean {
  return pattern.exec(value)?.[0] === value;
}

export function isHubIdentifier(value: unknown): value is string {
  return typeof value === "string" && fullMatch(HUB_IDENTIFIER, value);
}

function manualPaymentUuid(paymentRequestId: string): string {
  if (typeof paymentRequestId !== "string" || !fullMatch(PAYMENT_REQUEST_UUID, paymentRequestId)) {
    throw new RangeError("Invalid manual PaymentRequestID");
  }
  return paymentRequestId.toLowerCase();
}

export function sourcePaymentIdForManualRequest(paymentRequestId: string): string {
  return `autorespond:manual-payment:${manualPaymentUuid(paymentRequestId)}`;
}

export function eventIdForManualPaymentConfirmation(paymentRequestId: string): string {
  return `autorespond:payment.confirmed:${manualPaymentUuid(paymentRequestId)}`;
}

/** The SQL DECIMAL(12,2) value must be read as text, before any number coercion. */
export function decimal12_2ToMinorUnits(amountText: string): number {
  if (typeof amountText !== "string" || !fullMatch(DECIMAL_12_2, amountText)) {
    throw new RangeError("Expected canonical DECIMAL(12,2) text");
  }
  const [major, fraction] = amountText.split(".");
  const minor = BigInt(major) * BigInt(100) + BigInt(fraction);
  if (minor < BigInt(1) || minor > BigInt(SAAS_FINANCIAL_MAX_AMOUNT_MINOR)
    || minor > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError("Amount is outside the Hub's safe positive range");
  }
  return Number(minor);
}

export function isSaasFinancialCurrency(value: unknown): value is SaasFinancialCurrency {
  return typeof value === "string"
    && (SAAS_FINANCIAL_CURRENCIES as readonly string[]).includes(value);
}

type ParsedTimestamp = { canonical: string; epochMicroseconds: bigint };

/** Mirrors the Hub's ISO seconds, offset and six-fractional-digit acceptance. */
export function parseHubTimestamp(value: unknown): ParsedTimestamp {
  if (typeof value !== "string") throw new RangeError("Invalid Hub timestamp");
  const match = ISO_OFFSET_SECONDS.exec(value);
  if (!match || match[0] !== value) throw new RangeError("Invalid Hub timestamp");

  const [, yearText, monthText, dayText, hourText, minuteText, secondText, fractionText = "", zone] = match;
  const [year, month, day, hour, minute, second] = [
    yearText, monthText, dayText, hourText, minuteText, secondText,
  ].map(Number);
  const local = new Date(0);
  local.setUTCFullYear(year, month - 1, day);
  local.setUTCHours(hour, minute, second, 0);
  if (local.getUTCFullYear() !== year || local.getUTCMonth() !== month - 1
    || local.getUTCDate() !== day || local.getUTCHours() !== hour
    || local.getUTCMinutes() !== minute || local.getUTCSeconds() !== second) {
    throw new RangeError("Invalid Hub timestamp");
  }

  const offsetMinutes = zone === "Z" ? 0
    : (zone[0] === "+" ? 1 : -1)
      * (Number(zone.slice(1, 3)) * 60 + Number(zone.slice(4, 6)));
  const epochMilliseconds = local.getTime() - offsetMinutes * 60_000;
  const utc = new Date(epochMilliseconds);
  if (!Number.isFinite(epochMilliseconds) || utc.getUTCFullYear() < 0
    || utc.getUTCFullYear() > 9999) {
    throw new RangeError("Invalid Hub timestamp");
  }
  const fraction = fractionText.padEnd(6, "0");
  return {
    canonical: `${utc.toISOString().slice(0, 19)}.${fraction}Z`,
    epochMicroseconds: BigInt(epochMilliseconds) * BigInt(1_000) + BigInt(fraction),
  };
}

export function serializeUtcOccurredAt(value: Date): string {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())
    || value.getUTCFullYear() < 0 || value.getUTCFullYear() > 9999) {
    throw new RangeError("Invalid UTC occurrence date");
  }
  return value.toISOString();
}

/** Validate a proposed wire object before any future delivery code serializes it. */
export function parsePaymentConfirmedV1(
  value: unknown,
  bounds: { sourceActivatedAt: string; now?: Date },
): PaymentConfirmedV1 {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new RangeError("Payment event must be a plain object");
  }
  const data = value as Record<string, unknown>;
  const keys = Object.keys(data);
  if (keys.length !== PAYMENT_FIELDS.length
    || keys.some((key) => !(PAYMENT_FIELDS as readonly string[]).includes(key))) {
    throw new RangeError("Payment event has missing or unknown fields");
  }
  if (data.schema_version !== 1 || data.type !== "payment.confirmed"
    || !isHubIdentifier(data.event_id) || !isHubIdentifier(data.source_payment_id)
    || typeof data.amount_minor !== "number" || !Number.isSafeInteger(data.amount_minor)
    || data.amount_minor < 1 || data.amount_minor > SAAS_FINANCIAL_MAX_AMOUNT_MINOR
    || !isSaasFinancialCurrency(data.currency)) {
    throw new RangeError("Invalid Hub payment fields");
  }

  const occurred = parseHubTimestamp(data.occurred_at);
  const activation = parseHubTimestamp(bounds.sourceActivatedAt);
  const now = bounds.now ?? new Date();
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    throw new RangeError("Invalid current time");
  }
  if (occurred.epochMicroseconds < activation.epochMicroseconds
    || occurred.epochMicroseconds > BigInt(now.getTime() + 300_000) * BigInt(1_000)) {
    throw new RangeError("Occurrence is outside Hub activation or future bounds");
  }

  return {
    schema_version: 1,
    event_id: data.event_id,
    type: "payment.confirmed",
    source_payment_id: data.source_payment_id,
    amount_minor: data.amount_minor,
    currency: data.currency,
    occurred_at: occurred.canonical,
  };
}
