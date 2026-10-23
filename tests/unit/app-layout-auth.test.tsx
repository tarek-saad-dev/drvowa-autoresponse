import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
  requireAuthenticatedUser: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/tenancy/require-user", () => ({
  requireAuthenticatedUser: mocks.requireAuthenticatedUser,
}));

import AppLayout from "@/app/(app)/layout";
import { AuthError } from "@/lib/tenancy/errors";

describe("AppLayout auth gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuthenticatedUser.mockResolvedValue({
      userId: "11111111-1111-4111-8111-111111111111",
    });
  });

  it("renders children for an authenticated user without forcing /onboarding", async () => {
    const element = await AppLayout({
      children: <div data-testid="child">ok</div>,
    });
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(element).toBeTruthy();
  });

  it("redirects unauthenticated users to /login", async () => {
    mocks.requireAuthenticatedUser.mockRejectedValue(new AuthError("no session"));
    await expect(
      AppLayout({ children: <div>secret</div> }),
    ).rejects.toThrow("REDIRECT:/login");
  });
});
