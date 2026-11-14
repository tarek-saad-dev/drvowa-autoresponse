import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({ pathname: "/dashboard/inbox" }));
vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode; [key: string]: unknown }) =>
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
  Button: ({ children, ...props }: { children: React.ReactNode; [key: string]: unknown }) =>
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
  userName: "Ahmed",
  planName: "Growth",
  showPlatformAdminLink: true,
  businesses: [{
    businessId: "12345678-1234-4234-8234-123456789abc",
    name: "Example Business",
  }],
  activeBusinessId: "12345678-1234-4234-8234-123456789abc",
};

describe("Dashboard horizontal top navigation", () => {
  it("renders all six primary destinations in a horizontal desktop nav and keeps account/plan", () => {
    navigation.pathname = "/dashboard/inbox";
    const html = renderToStaticMarkup(createElement(DashboardTopbar, topProps as Parameters<typeof DashboardTopbar>[0]));
    expect(html).toContain('aria-label="التنقل العلوي"');
    for (const label of ["الرئيسية", "المحادثات", "العملاء", "الحملات", "الموظف الذكي", "الإعدادات"]) {
      expect(html).toContain(label);
    }
    expect(html).toContain("md:flex");
    expect(html).toContain('href="/dashboard"');
    expect(html).toContain('href="/dashboard/inbox"');
    expect(html).toContain('href="/admin"');
    expect(html).toContain("إدارة المنصة");
    expect(html).toContain("Growth");
    expect(html).toContain("Ahmed");
    expect(html).toContain('aria-current="page"');
  });

  it("keeps submenu navigation accessible with disclosure buttons and correct active state", () => {
    expect(topbar).toContain("getNavGroupChildren(group)");
    expect(topbar).toContain('aria-expanded={expanded}');
    expect(topbar).toContain('aria-controls={`topnav-${group.id}`}');
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
    expect(html).toContain("hidden shrink-0 md:block");
    expect(html).toContain("mobile-footer");
    expect(html).not.toContain("normal-sidebar");
    expect(shell).not.toContain("sidebar:");
    expect(layout).not.toContain("DashboardSidebar");
    expect(layout).toContain("planName={planName}");
    expect(layout).toContain("showPlatformAdminLink={showPlatformAdminLink}");
    const mobile = renderToStaticMarkup(createElement(MobileNav, { showPlatformAdminLink: true }));
    expect(mobile).toContain("bottom-0");
    expect(mobile).toContain("md:hidden");
    expect(mobile).toContain("التنقل الرئيسي");
  });

  it("preserves fullscreen Inbox and Agent workspace structures with no side rail", () => {
    expect(shell).toContain('const isInbox = pathname === "/dashboard/inbox"');
    expect(shell).toContain('const isAgent = pathname === "/dashboard/agent"');
    expect(shell).toContain("fixed inset-0 z-40 flex h-[100dvh]");
    expect(shell).toContain("min-w-0 flex-1 overflow-hidden p-0");
    expect(shell).toContain("!isInbox || !threadOpen");
    expect(shell).toContain('className={isInbox ? "hidden shrink-0 md:block" : "shrink-0"}');
  });
});
