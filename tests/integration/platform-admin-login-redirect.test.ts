import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { closePool, getDbConfig } from "@/lib/db";
import { resolvePostLoginPath } from "@/modules/auth/post-login-redirect";
import { signup, logout } from "@/modules/auth/service";
import { listBusinessesForUser } from "@/modules/businesses/service";
import { completeOnboarding } from "@/modules/onboarding/service";
import {
  isPlatformAdminUser,
  upsertPlatformAdmin,
} from "@/modules/platform-admin/service";
import { rethrowDbBootstrapFailure } from "../helpers/db-bootstrap";
import { clearTestCookies } from "../helpers/cookies";

function dbEnvConfigured(): boolean {
  try {
    getDbConfig();
    return true;
  } catch {
    return false;
  }
}

const dbEnvOk = dbEnvConfigured();

describe("platform admin post-login redirect (integration)", () => {
  let skip = !dbEnvOk;

  beforeAll(async () => {
    if (!dbEnvOk) return;
    try {
      const { getPool } = await import("@/lib/db");
      await getPool();
    } catch (error) {
      skip = true;
      rethrowDbBootstrapFailure(error);
    }
  });

  afterAll(async () => {
    clearTestCookies();
    await closePool().catch(() => undefined);
  });

  function requireDb(): boolean {
    return !skip;
  }

  it("SUPER_ADMIN + no business → redirectTo /admin", async () => {
    if (!requireDb()) return;
    clearTestCookies();
    const email = `admin.ob.${Date.now()}@example.com`;
    const signed = await signup({
      fullName: "Admin No Biz",
      email,
      password: "AdminLogin!23456789",
    });
    await upsertPlatformAdmin({
      userId: signed.user.userId,
      role: "SUPER_ADMIN",
      isActive: true,
    });
    const isAdmin = await isPlatformAdminUser(signed.user.userId);
    const businesses = await listBusinessesForUser(signed.user.userId);
    expect(isAdmin).toBe(true);
    expect(businesses.length).toBe(0);
    expect(
      resolvePostLoginPath({
        isPlatformAdmin: isAdmin,
        hasBusiness: businesses.length > 0,
      }),
    ).toBe("/admin");
    await logout();
  });

  it("SUPER_ADMIN + business → redirectTo /admin", async () => {
    if (!requireDb()) return;
    clearTestCookies();
    const email = `admin.biz.${Date.now()}@example.com`;
    const signed = await signup({
      fullName: "Admin With Biz",
      email,
      password: "AdminLogin!23456789",
    });
    await completeOnboarding({
      userId: signed.user.userId,
      business: {
        name: "Admin Biz",
        category: "عام",
        countryCode: "SA",
        locale: "ar-SA",
        timezone: "Asia/Riyadh",
      },
      location: null,
      agent: {
        name: "موظف الاستقبال",
        roleTitle: "موظف استقبال",
        language: "ar",
        dialect: null,
        tone: "مهني",
        instructions: null,
      },
      knowledgeItems: [
        { category: "ABOUT", title: "عن", content: "معرفة" },
      ],
    });
    await upsertPlatformAdmin({
      userId: signed.user.userId,
      role: "SUPER_ADMIN",
      isActive: true,
    });
    const isAdmin = await isPlatformAdminUser(signed.user.userId);
    const businesses = await listBusinessesForUser(signed.user.userId);
    expect(isAdmin).toBe(true);
    expect(businesses.length).toBeGreaterThan(0);
    expect(
      resolvePostLoginPath({
        isPlatformAdmin: isAdmin,
        hasBusiness: businesses.length > 0,
      }),
    ).toBe("/admin");
    await logout();
  });

  it("inactive platform admin is not treated as platform admin", async () => {
    if (!requireDb()) return;
    clearTestCookies();
    const email = `admin.off.${Date.now()}@example.com`;
    const signed = await signup({
      fullName: "Inactive Admin",
      email,
      password: "AdminLogin!23456789",
    });
    await upsertPlatformAdmin({
      userId: signed.user.userId,
      role: "SUPER_ADMIN",
      isActive: false,
    });
    const isAdmin = await isPlatformAdminUser(signed.user.userId);
    expect(isAdmin).toBe(false);
    expect(
      resolvePostLoginPath({
        isPlatformAdmin: isAdmin,
        hasBusiness: false,
      }),
    ).toBe("/onboarding");
    await logout();
  });
});
