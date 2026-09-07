import { describe, expect, it } from "vitest";

import {
  buildUniqueSlugCandidate,
  slugifyBusinessName,
} from "@/modules/businesses/slug";

describe("slugifyBusinessName", () => {
  it("lowercases and hyphenates words", () => {
    expect(slugifyBusinessName("Hello World Cafe")).toBe("hello-world-cafe");
  });

  it("strips non-ascii and punctuation", () => {
    expect(slugifyBusinessName("Café — Riyadh!")).toBe("cafe-riyadh");
  });

  it("falls back to business for empty-like input", () => {
    expect(slugifyBusinessName("!!!")).toBe("business");
    expect(slugifyBusinessName("   ")).toBe("business");
  });
});

describe("buildUniqueSlugCandidate", () => {
  it("returns base on attempt 0", () => {
    expect(buildUniqueSlugCandidate("acme", 0)).toBe("acme");
  });

  it("appends attempt-based suffix for collisions", () => {
    expect(buildUniqueSlugCandidate("acme", 1)).toBe("acme-2");
    expect(buildUniqueSlugCandidate("acme", 2)).toBe("acme-3");
  });
});
