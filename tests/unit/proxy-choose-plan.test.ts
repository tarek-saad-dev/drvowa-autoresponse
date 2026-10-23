import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("proxy choose-plan coverage", () => {
  const source = readFileSync(
    join(process.cwd(), "src/proxy.ts"),
    "utf8",
  );

  it("matches /choose-plan so x-pathname is forwarded after login", () => {
    expect(source).toContain('pathname === "/choose-plan"');
    expect(source).toContain('"/choose-plan"');
    expect(source).toContain('"/choose-plan/:path*"');
  });

  it("still protects dashboard and onboarding routes", () => {
    expect(source).toContain('pathname.startsWith("/dashboard")');
    expect(source).toContain('pathname.startsWith("/onboarding")');
    expect(source).toContain('"/dashboard/:path*"');
    expect(source).toContain('"/onboarding"');
  });
});
