/** Monetary values are integer minor units; never accept browser-computed totals. */
const MAX_AMOUNT_MINOR = 999_999_999_999; // SQL DECIMAL(12,2) compatibility.
function assertMoney(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_AMOUNT_MINOR) {
    throw new RangeError("Invalid monetary amount");
  }
}

export function invoiceTotals(subtotalMinor: number, discountPercent: number, reason?: string) {
  assertMoney(subtotalMinor);
  if (!Number.isFinite(discountPercent) || discountPercent < 0 || discountPercent > 100
    || Math.abs(discountPercent * 100 - Math.round(discountPercent * 100)) > 0.0000001) {
    throw new RangeError("Discount must be between 0 and 100 with at most two decimals");
  }
  if (discountPercent > 0 && !reason?.trim()) throw new Error("Discount reason is required");
  const basisPoints = BigInt(Math.round(discountPercent * 100));
  const discountMinor = Number((BigInt(subtotalMinor) * basisPoints + BigInt(5000)) / BigInt(10000));
  return { subtotalMinor, discountMinor, totalMinor: subtotalMinor - discountMinor };
}

export function validateRefundAmount(capturedMinor: number, refundedMinor: number, requestedMinor: number): number {
  [capturedMinor, refundedMinor, requestedMinor].forEach(assertMoney);
  if (requestedMinor === 0 || refundedMinor > capturedMinor || requestedMinor > capturedMinor - refundedMinor) {
    throw new RangeError("Refund exceeds remaining captured amount or is zero");
  }
  return requestedMinor;
}
