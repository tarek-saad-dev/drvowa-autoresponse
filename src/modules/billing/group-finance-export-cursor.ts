/** Stable keyset cursor for replayable approved payment exports (v1). */
export type CollectionCursor = {
  reviewedAtUtc: string;
  paymentRequestId: string;
};

const UTC_STAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validateExportTimestamp(value: string): string {
  if (!UTC_STAMP.test(value) || !Number.isFinite(Date.parse(value)) ||
      new Date(value).toISOString() !== value) {
    throw new RangeError("Invalid UTC timestamp");
  }
  return value;
}

export function encodeCollectionCursor(cursor: CollectionCursor): string {
  validateExportTimestamp(cursor.reviewedAtUtc);
  if (!UUID.test(cursor.paymentRequestId)) throw new RangeError("Invalid payment ID");
  return Buffer.from(JSON.stringify([cursor.reviewedAtUtc, cursor.paymentRequestId])).toString("base64url");
}

export function decodeCollectionCursor(value: string): CollectionCursor {
  if (!value || value.length > 256 || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new RangeError("Invalid collection cursor");
  }
  try {
    const decoded: unknown = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (!Array.isArray(decoded) || decoded.length !== 2 ||
        typeof decoded[0] !== "string" || typeof decoded[1] !== "string" ||
        !UUID.test(decoded[1])) {
      throw new RangeError("Invalid collection cursor");
    }
    return { reviewedAtUtc: validateExportTimestamp(decoded[0]), paymentRequestId: decoded[1] };
  } catch {
    throw new RangeError("Invalid collection cursor");
  }
}

export function parseExportLimit(raw: string | null): number {
  if (raw === null) return 100;
  if (!/^\d{1,3}$/.test(raw)) throw new RangeError("Invalid limit");
  const limit = Number(raw);
  if (limit < 1 || limit > 250) throw new RangeError("Limit must be between 1 and 250");
  return limit;
}
