import { describe, expect, it } from "vitest";

import { resolvePostLoginPath } from "@/modules/auth/post-login-redirect";

describe("resolvePostLoginPath", () => {
  it("SUPER_ADMIN + no business → /admin", () => {
    expect(
      resolvePostLoginPath({ isPlatformAdmin: true, hasBusiness: false }),
    ).toBe("/admin");
  });

  it("SUPER_ADMIN + business → /admin", () => {
    expect(
      resolvePostLoginPath({ isPlatformAdmin: true, hasBusiness: true }),
    ).toBe("/admin");
  });

  it("normal user + business → /dashboard", () => {
    expect(
      resolvePostLoginPath({ isPlatformAdmin: false, hasBusiness: true }),
    ).toBe("/dashboard");
  });

  it("normal user + no business → /onboarding", () => {
    expect(
      resolvePostLoginPath({ isPlatformAdmin: false, hasBusiness: false }),
    ).toBe("/onboarding");
  });
});
