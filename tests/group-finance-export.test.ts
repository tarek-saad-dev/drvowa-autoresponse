import { describe, expect, it } from "vitest";

import { authorizeFinanceExport } from "../src/modules/billing/group-finance-export-auth";
import {
  decodeCollectionCursor,
  encodeCollectionCursor,
  parseExportLimit,
  validateExportTimestamp,
} from "../src/modules/billing/group-finance-export-cursor";

describe("group finance service authentication", () => {
  const secret = "A".repeat(64);

  it("fails closed when export is not configured", () => {
    expect(authorizeFinanceExport("Bearer " + secret, null)).toBe(false);
    expect(authorizeFinanceExport("Bearer " + secret, "short")).toBe(false);
  });

  it("accepts only the exact configured service token", () => {
    expect(authorizeFinanceExport("Bearer " + secret, secret)).toBe(true);
    expect(authorizeFinanceExport("Bearer " + secret + "x", secret)).toBe(false);
    expect(authorizeFinanceExport("bearer " + secret, secret)).toBe(false);
    expect(authorizeFinanceExport(null, secret)).toBe(false);
    expect(authorizeFinanceExport("Bearer ", secret)).toBe(false);
    expect(authorizeFinanceExport("Bearer " + "B".repeat(64), secret)).toBe(false);
  });
});

describe("approved collection export cursor", () => {
  const cursor = {
    reviewedAtUtc: "2026-10-14T02:10:00.123Z",
    paymentRequestId: "9e921ec1-e38e-4420-bd3e-6abeaef494f5",
  };

  it("roundtrips stable UTC timestamp and payment ID", () => {
    expect(decodeCollectionCursor(encodeCollectionCursor(cursor))).toEqual(cursor);
  });

  it("refuses malformed timestamps and cursors", () => {
    expect(() => validateExportTimestamp("2026-10-14")).toThrow(RangeError);
    expect(() => validateExportTimestamp("2026-02-31T00:00:00.000Z")).toThrow(RangeError);
    expect(() => decodeCollectionCursor("invalid#")).toThrow(RangeError);
    expect(() => decodeCollectionCursor("x".repeat(1000))).toThrow(RangeError);
    expect(() => encodeCollectionCursor({ ...cursor, paymentRequestId: "not-a-uuid" })).toThrow(RangeError);
  });

  it("caps pages and rejects invalid pagination", () => {
    expect(parseExportLimit(null)).toBe(100);
    expect(parseExportLimit("250")).toBe(250);
    expect(() => parseExportLimit("251")).toThrow(RangeError);
    expect(() => parseExportLimit("-1")).toThrow(RangeError);
    expect(() => parseExportLimit("1 OR 1=1")).toThrow(RangeError);
  });
});
