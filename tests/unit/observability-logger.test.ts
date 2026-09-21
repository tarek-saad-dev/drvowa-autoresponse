import { describe, expect, it, vi } from "vitest";

import { structuredLog } from "@/lib/observability/logger";

describe("structuredLog", () => {
  it("redacts sensitive field names", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    structuredLog("auth", "auth.password_reset.requested", {
      emailDomain: "example.com",
      password: "secret",
      token: "abc",
      authorization: "Bearer x",
      apiKey: "k",
    });
    expect(spy).toHaveBeenCalledTimes(1);
    const line = String(spy.mock.calls[0]?.[0]);
    const parsed = JSON.parse(line) as Record<string, unknown>;
    expect(parsed.event).toBe("auth.password_reset.requested");
    expect(parsed.emailDomain).toBe("example.com");
    expect(parsed.password).toBe("[redacted]");
    expect(parsed.token).toBe("[redacted]");
    expect(parsed.authorization).toBe("[redacted]");
    expect(parsed.apiKey).toBe("[redacted]");
    spy.mockRestore();
  });
});
