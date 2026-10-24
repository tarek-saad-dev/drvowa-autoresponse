export type DashboardNavLeaf = {
  href: string;
  label: string;
  mobileLabel: string;
  key: string;
  icon: string;
};

export type DashboardNavGroup = {
  id: "home" | "inbox" | "employee" | "settings";
  label: string;
  mobileLabel: string;
  icon: string;
  href: string;
  mobilePrimary: boolean;
  children?: readonly DashboardNavLeaf[];
};

/** Four clear primary destinations. Legacy URLs remain valid and are not shown as extra navigation. */
export const DASHBOARD_NAV_GROUPS = [
  {
    id: "home", label: "الرئيسية", mobileLabel: "الرئيسية",
    icon: "⌂", href: "/dashboard", mobilePrimary: true,
  },
  {
    id: "inbox", label: "المحادثات", mobileLabel: "المحادثات",
    icon: "◌", href: "/dashboard/inbox", mobilePrimary: true,
  },
  {
    id: "employee", label: "الموظف الذكي", mobileLabel: "الموظف",
    icon: "✦", href: "/dashboard/agent", mobilePrimary: true,
  },
  {
    id: "settings", label: "الإعدادات", mobileLabel: "الإعدادات",
    icon: "⚙", href: "/dashboard/settings", mobilePrimary: true,
    children: [
      { href: "/dashboard/settings", label: "النشاط وحسابي", mobileLabel: "الإعدادات", key: "Settings", icon: "⚙" },
      { href: "/dashboard/billing", label: "الاشتراك والاستخدام", mobileLabel: "الاشتراك", key: "Billing", icon: "◇" },
      { href: "/dashboard/integrations", label: "التكاملات", mobileLabel: "التكاملات", key: "Integrations", icon: "⇄" },
    ],
  },
] as const satisfies readonly DashboardNavGroup[];

/** Backward-compatible leaf registry for headings and existing deep links. */
export const DASHBOARD_NAV = [
  { href: "/dashboard", label: "الرئيسية", mobileLabel: "الرئيسية", key: "Overview", icon: "⌂", primary: true },
  { href: "/dashboard/inbox", label: "المحادثات", mobileLabel: "المحادثات", key: "Inbox", icon: "◌", primary: true },
  { href: "/dashboard/agent", label: "الموظف الذكي", mobileLabel: "الموظف", key: "Receptionist", icon: "✦", primary: true },
  { href: "/dashboard/knowledge", label: "علّم الموظف", mobileLabel: "التعليم", key: "Knowledge", icon: "＋", primary: false },
  { href: "/dashboard/settings", label: "الإعدادات", mobileLabel: "الإعدادات", key: "Settings", icon: "⚙", primary: true },
  { href: "/dashboard/whatsapp", label: "واتساب", mobileLabel: "واتساب", key: "WhatsApp", icon: "◉", primary: false },
  { href: "/dashboard/locations", label: "الفروع والمواقع", mobileLabel: "الفروع", key: "Locations", icon: "⌖", primary: false },
  { href: "/dashboard/integrations", label: "التكاملات", mobileLabel: "التكاملات", key: "Integrations", icon: "⇄", primary: false },
  { href: "/dashboard/billing", label: "الاشتراك والاستخدام", mobileLabel: "الاشتراك", key: "Billing", icon: "◇", primary: false },
  { href: "/dashboard/usage", label: "الاستخدام", mobileLabel: "الاستخدام", key: "Usage", icon: "◈", primary: false },
  { href: "/dashboard/reliability", label: "رقابة أداء البوت", mobileLabel: "الرقابة", key: "Reliability", icon: "◈", primary: false },
  { href: "/dashboard/account", label: "الحساب", mobileLabel: "الحساب", key: "Account", icon: "◎", primary: false },
] as const;

export function isNavHrefActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(href + "/");
}

export function getNavGroupChildren(
  group: (typeof DASHBOARD_NAV_GROUPS)[number],
): readonly DashboardNavLeaf[] {
  return "children" in group && group.children ? group.children : [];
}

export function isNavGroupActive(
  pathname: string,
  group: (typeof DASHBOARD_NAV_GROUPS)[number],
): boolean {
  if (isNavHrefActive(pathname, group.href)) return true;
  if (group.id === "employee" && isNavHrefActive(pathname, "/dashboard/knowledge")) return true;
  if (group.id === "settings" && [
    "/dashboard/account", "/dashboard/whatsapp", "/dashboard/locations",
    "/dashboard/usage", "/dashboard/reliability", "/dashboard/integrations", "/dashboard/billing",
  ].some((path) => isNavHrefActive(pathname, path))) return true;
  return getNavGroupChildren(group).some((child) => isNavHrefActive(pathname, child.href));
}
