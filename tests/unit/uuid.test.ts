import { describe, expect, it } from "vitest";

import {
  normalizeNullableUuid,
  normalizeUuid,
} from "@/lib/ids/uuid";

describe("normalizeUuid", () => {
  const lower = "01a339d4-dcd1-4737-923c-5df5eee558e5";
  const upper = "01A339D4-DCD1-4737-923C-5DF5EEE558E5";

  it("converts uppercase UUID to lowercase", () => {
    expect(normalizeUuid(upper)).toBe(lower);
  });

  it("leaves lowercase UUID unchanged", () => {
    expect(normalizeUuid(lower)).toBe(lower);
  });

  it("preserves UUID identity across case variants", () => {
    expect(normalizeUuid(upper)).toBe(normalizeUuid(lower));
    expect(normalizeUuid(upper) === lower).toBe(true);
  });

  it("preserves null for nullable UUIDs", () => {
    expect(normalizeNullableUuid(null)).toBeNull();
    expect(normalizeNullableUuid(undefined)).toBeNull();
  });

  it("normalizes non-null nullable UUIDs", () => {
    expect(normalizeNullableUuid(upper)).toBe(lower);
  });
});
