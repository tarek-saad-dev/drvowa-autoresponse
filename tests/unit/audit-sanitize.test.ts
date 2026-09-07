import { describe, expect, it } from "vitest";

import { sanitizeAuditMetadata } from "@/modules/audit/service";

describe("sanitizeAuditMetadata", () => {
  it("strips secret-like keys and keeps safe metadata", () => {
    const cleaned = sanitizeAuditMetadata({
      slug: "acme",
      password: "secret",
      accessToken: "tok",
      authorization: "Bearer x",
      agentId: "abc",
    });

    expect(cleaned).toEqual({
      slug: "acme",
      agentId: "abc",
    });
  });

  it("returns null for empty or fully stripped metadata", () => {
    expect(sanitizeAuditMetadata(undefined)).toBeNull();
    expect(sanitizeAuditMetadata({ password: "x", token: "y" })).toBeNull();
  });
});
