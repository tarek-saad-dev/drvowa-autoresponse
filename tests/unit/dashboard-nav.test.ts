import { describe, expect, it } from "vitest";

import {
  DASHBOARD_NAV,
  DASHBOARD_NAV_GROUPS,
  isNavGroupActive,
  isNavHrefActive,
} from "@/constants/nav";

describe("dashboard navigation IA", () => {
  it("exposes five mobile-primary destinations", () => {
    const mobile = DASHBOARD_NAV_GROUPS.filter((group) => group.mobilePrimary);
    expect(mobile.map((group) => group.id)).toEqual([
      "home",
      "inbox",
      "employee",
      "settings",
      "account",
    ]);
  });

  it("keeps legacy leaf routes discoverable", () => {
    const hrefs = DASHBOARD_NAV.map((item) => item.href);
    expect(hrefs).toEqual(expect.arrayContaining([
      "/dashboard",
      "/dashboard/inbox",
      "/dashboard/agent",
      "/dashboard/knowledge",
      "/dashboard/whatsapp",
      "/dashboard/settings",
      "/dashboard/locations",
      "/dashboard/billing",
      "/dashboard/usage",
      "/dashboard/reliability",
      "/dashboard/integrations",
      "/dashboard/account",
    ]));
  });

  it("activates employee group for knowledge routes", () => {
    const employee = DASHBOARD_NAV_GROUPS.find((group) => group.id === "employee")!;
    expect(isNavGroupActive("/dashboard/knowledge", employee)).toBe(true);
    expect(isNavHrefActive("/dashboard/knowledge", "/dashboard/agent")).toBe(false);
  });

  it("activates settings group for WhatsApp and billing", () => {
    const settings = DASHBOARD_NAV_GROUPS.find((group) => group.id === "settings")!;
    expect(isNavGroupActive("/dashboard/whatsapp", settings)).toBe(true);
    expect(isNavGroupActive("/dashboard/billing", settings)).toBe(true);
    expect(isNavGroupActive("/dashboard", settings)).toBe(false);
  });

  it("matches overview only on the exact dashboard path", () => {
    expect(isNavHrefActive("/dashboard", "/dashboard")).toBe(true);
    expect(isNavHrefActive("/dashboard/inbox", "/dashboard")).toBe(false);
  });
});
