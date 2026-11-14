import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({ pathname: "/dashboard/inbox" }));
vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode; [key: string]: unknown }) =>
    createElement("a", { ...props, href }, children),
}));
vi.mock("@/components/brand/brand-logo", () => ({
  BrandLogo: () => createElement("span", null, "DRVO"),
}));
vi.mock("@/components/ui/app-icon", () => ({
  AppIcon: ({ name }: { name: string }) => createElement("span", { "data-icon": name }),
}));
vi.mock("@/components/dashboard/workspace-switcher", () => ({
  WorkspaceSwitcher: () => createElement("span", null, "اختيار النشاط"),
}));
vi.mock("@/components/ui/theme-toggle", () => ({
  ThemeToggle: () => createElement("span", null, "المظهر"),
}));
vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: { children: ReactNode; [key: string]: unknown }) =>
    createElement("button", props, children),
}));

import { DashboardTopbar } from "@/components/dashboard/topbar";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { MobileNav } from "@/components/dashboard/mobile-nav";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const topbar = source("src/components/dashboard/topbar.tsx");
const shell = source("src/components/dashboard/dashboard-shell.tsx");
const layout = source("src/app/(app)/dashboard/layout.tsx");

const topProps = {
  showPlatformAdminLink: true,
  businesses: [{
    businessId: "12345678-1234-4234-8234-123456789abc",
    name: "Example Business",
  }],
  activeBusinessId: "12345678-1234-4234-8234-123456789abc",
};

describe("Dashboard horizontal top navigation", () => {
  it("renders all six destinations in one compact top row, with logo and far-left logout", () => {
    navigation.pathname = "/dashboard/inbox";
    const html = renderToStaticMarkup(createElement(DashboardTopbar, topProps as Parameters<typeof DashboardTopbar>[0]));
    expect(html).toContain('aria-label="التنقل العلوي"');
    for (const label of ["الرئيسية", "المحادثات", "العملاء", "الحملات", "الموظف الذكي", "الإعدادات"]) {
      expect(html).toContain(label);
    }
    expect(html).toContain("lg:flex");
    expect(html).toContain("flex h-16 min-w-0 items-center");
    expect(html).not.toContain("border-t border-border/70");
    expect(html).toContain("mx-1 h-5 w-px bg-border/70");
    expect(html).toContain('href="/dashboard"');
    expect(html).toContain('href="/dashboard/inbox"');
    expect(topbar).toContain('href="/admin"');
    expect(topbar).toContain("إدارة المنصة");
    expect(html).not.toContain("Growth");
    expect(html).not.toContain("Ahmed");
    expect(html).toContain("خروج");
    expect(html).toContain('data-icon="log-out"');
    expect(html).toContain('aria-current="page"');
  });


  it("moves optional tools into Settings instead of showing a second header strip", () => {
    expect(topbar).toContain('group.id === "settings" ? optionControls : null');
    expect(topbar).toContain('openGroup === "mobile-options"');
    expect(topbar).toContain("WorkspaceSwitcher");
    expect(topbar).toContain("ThemeToggle");
    expect(topbar).not.toContain("avatarInitial");
    expect(topbar).not.toContain("displayPlan");
    expect(topbar).not.toContain("activeBusiness?.name");
    expect(topbar).not.toContain("sm:min-h-16");
    expect(topbar).not.toContain("min-h-[52px]");
    expect(topbar).toContain('aria-label="تسجيل الخروج"');
    expect(topbar).toContain('bg-border/70');
  });

  it("keeps submenu navigation accessible with disclosure buttons and correct active state", () => {
    expect(topbar).toContain("getNavGroupChildren(group)");
    expect(topbar).toContain('aria-expanded={expanded}');
    expect(topbar).toContain('aria-controls={"topnav-" + group.id}');
    expect(topbar).toContain("setOpenGroup(current => current === group.id ? null : group.id)");
    expect(topbar).toContain("if (event.key === \"Escape\") setOpenGroup(null)");
    expect(topbar).toContain('onClick={() => setOpenGroup(null)}');
    expect(topbar).toContain("children.map((child)");
  });

  it("removes the desktop sidebar from shared layout and preserves the mobile bottom bar", () => {
    navigation.pathname = "/dashboard/inbox";
    const html = renderToStaticMarkup(createElement(DashboardShell, {
      topbar: createElement("div", null, "desktop-header"),
      mobileNav: createElement("div", null, "mobile-footer"),
      children: createElement("div", null, "messages"),
    }));
    expect(html).toContain("desktop-header");
    expect(html).toContain("hidden shrink-0 lg:block");
    expect(html).toContain("mobile-footer");
    expect(html).not.toContain("normal-sidebar");
    expect(shell).not.toContain("sidebar:");
    expect(layout).not.toContain("DashboardSidebar");
    expect(layout).not.toContain("planName={planName}");
    expect(layout).not.toContain("ensureCurrentSubscriptionEntitlements");
    expect(layout).toContain("showPlatformAdminLink={showPlatformAdminLink}");
    const mobile = renderToStaticMarkup(createElement(MobileNav, { showPlatformAdminLink: true }));
    expect(mobile).toContain("bottom-0");
    expect(mobile).toContain("lg:hidden");
    expect(mobile).toContain("التنقل الرئيسي");
  });

  it("preserves fullscreen Inbox and Agent workspace structures with no side rail", () => {
    expect(shell).toContain('const isInbox = pathname === "/dashboard/inbox"');
    expect(shell).toContain('const isAgent = pathname === "/dashboard/agent"');
    expect(shell).toContain("fixed inset-0 z-40 flex h-[100dvh]");
    expect(shell).toContain("min-w-0 flex-1 overflow-hidden p-0");
    expect(shell).toContain("!isInbox || !threadOpen");
    expect(shell).toContain('className={isInbox ? "hidden shrink-0 lg:block" : "shrink-0"}');
  });
});
