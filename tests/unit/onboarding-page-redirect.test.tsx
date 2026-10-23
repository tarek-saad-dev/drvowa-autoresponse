import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
  requireAuthenticatedUser: vi.fn(),
  listBusinessesForUser: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/tenancy/require-user", () => ({
  requireAuthenticatedUser: mocks.requireAuthenticatedUser,
}));
vi.mock("@/modules/businesses/service", () => ({
  listBusinessesForUser: mocks.listBusinessesForUser,
}));
vi.mock("@/components/onboarding/guided-preview", () => ({
  GuidedOnboardingPreview: function MockPreview() {
    return null;
  },
}));

import OnboardingPage from "@/app/(app)/onboarding/page";
import { AuthError } from "@/lib/tenancy/errors";

const user = {
  userId: "11111111-1111-4111-8111-111111111111",
  email: "owner@example.com",
  fullName: "Owner",
  activeBusinessId: null,
};

describe("OnboardingPage routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuthenticatedUser.mockResolvedValue(user);
    mocks.listBusinessesForUser.mockResolvedValue([]);
  });

  it("renders onboarding for a user without a completed workspace", async () => {
    const element = await OnboardingPage({
      searchParams: Promise.resolve({}),
    });
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(element).toBeTruthy();
  });

  it("keeps incomplete workspaces on onboarding", async () => {
    mocks.listBusinessesForUser.mockResolvedValue([
      {
        businessId: "33333333-3333-4333-8333-333333333333",
        onboardingCompletedAtUtc: null,
      },
    ]);
    const element = await OnboardingPage({
      searchParams: Promise.resolve({ plan: "FREE" }),
    });
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(element).toBeTruthy();
  });

  it("sends completed onboarding users to the dashboard", async () => {
    mocks.listBusinessesForUser.mockResolvedValue([
      {
        businessId: "33333333-3333-4333-8333-333333333333",
        onboardingCompletedAtUtc: new Date("2026-01-01T00:00:00.000Z"),
      },
    ]);
    await expect(
      OnboardingPage({ searchParams: Promise.resolve({}) }),
    ).rejects.toThrow("REDIRECT:/dashboard");
  });

  it("redirects unauthenticated visitors to login", async () => {
    mocks.requireAuthenticatedUser.mockRejectedValue(new AuthError("no session"));
    await expect(
      OnboardingPage({ searchParams: Promise.resolve({}) }),
    ).rejects.toThrow("REDIRECT:/login");
  });
});
