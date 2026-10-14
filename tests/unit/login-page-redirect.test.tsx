import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/modules/auth/service", () => ({ getCurrentSession: vi.fn() }));
vi.mock("@/modules/platform-admin/service", () => ({ isPlatformAdminUser: vi.fn() }));
vi.mock("@/modules/businesses/service", () => ({ listBusinessesForUser: vi.fn() }));
vi.mock("@/app/(auth)/login/login-form", () => ({
  default: function MockLoginForm() { return null; },
}));

import LoginPage from "@/app/(auth)/login/page";
import LoginForm from "@/app/(auth)/login/login-form";
import { getCurrentSession } from "@/modules/auth/service";
import { isPlatformAdminUser } from "@/modules/platform-admin/service";
import { listBusinessesForUser } from "@/modules/businesses/service";

const session = {
  sessionId: "22222222-2222-4222-8222-222222222222",
  userId: "11111111-1111-4111-8111-111111111111",
  email: "signed-in@example.com",
  fullName: "Signed In User",
  activeBusinessId: null,
  expiresAtUtc: new Date(Date.now() + 60_000),
};

describe("login entry for existing sessions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentSession).mockResolvedValue(null);
    vi.mocked(isPlatformAdminUser).mockResolvedValue(false);
    vi.mocked(listBusinessesForUser).mockResolvedValue([]);
  });

  it("renders the login form for a missing, expired or revoked session", async () => {
    const element = await LoginPage();
    expect(element.type).toBe(LoginForm);
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(isPlatformAdminUser).not.toHaveBeenCalled();
    expect(listBusinessesForUser).not.toHaveBeenCalled();
  });

  it("redirects a signed-in business owner to their dashboard", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(session);
    vi.mocked(listBusinessesForUser).mockResolvedValue([
      { businessId: "33333333-3333-4333-8333-333333333333" } as Awaited<ReturnType<typeof listBusinessesForUser>>[number],
    ]);
    await expect(LoginPage()).rejects.toThrow("REDIRECT:/dashboard");
    expect(isPlatformAdminUser).toHaveBeenCalledWith(session.userId);
    expect(listBusinessesForUser).toHaveBeenCalledWith(session.userId);
  });

  it("redirects an existing platform admin to /admin", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(session);
    vi.mocked(isPlatformAdminUser).mockResolvedValue(true);
    await expect(LoginPage()).rejects.toThrow("REDIRECT:/admin");
  });

  it("redirects a signed-in user without a workspace to onboarding", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(session);
    await expect(LoginPage()).rejects.toThrow("REDIRECT:/onboarding");
  });
});
