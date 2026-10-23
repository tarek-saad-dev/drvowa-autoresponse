export type DashboardNavLeaf = {
  href: string;
  label: string;
  mobileLabel: string;
  key: string;
  icon: string;
};

export type DashboardNavGroup = {
  id: "home" | "inbox" | "employee" | "settings" | "account";
  label: string;
  mobileLabel: string;
  icon: string;
  /** Landing href when the group is selected as a top-level destination. */
  href: string;
  /** Shown in the mobile bottom bar. */
  mobilePrimary: boolean;
  children?: readonly DashboardNavLeaf[];
};

/**
 * Simplified information architecture.
 * Existing leaf URLs are preserved for bookmarks and deep links.
 */
export const DASHBOARD_NAV_GROUPS = [
  {
    id: "home",
    label: "الرئيسية",
    mobileLabel: "الرئيسية",
    icon: "⌂",
    href: "/dashboard",
    mobilePrimary: true,
  },
  {
    id: "inbox",
    label: "المحادثات",
    mobileLabel: "المحادثات",
    icon: "◌",
    href: "/dashboard/inbox",
    mobilePrimary: true,
  },
  {
    id: "employee",
    label: "الموظف الذكي",
    mobileLabel: "الموظف",
    icon: "✦",
    href: "/dashboard/agent",
    mobilePrimary: true,
    children: [
      {
        href: "/dashboard/agent",
        label: "إعداد الموظف",
        mobileLabel: "الإعداد",
        key: "Receptionist",
        icon: "✦",
      },
      {
        href: "/dashboard/knowledge",
        label: "علّم الموظف",
        mobileLabel: "التعليم",
        key: "Knowledge",
        icon: "＋",
      },
    ],
  },
  {
    id: "settings",
    label: "الإعدادات",
    mobileLabel: "الإعدادات",
    icon: "⚙",
    href: "/dashboard/settings",
    mobilePrimary: true,
    children: [
      {
        href: "/dashboard/whatsapp",
        label: "واتساب",
        mobileLabel: "واتساب",
        key: "WhatsApp",
        icon: "◉",
      },
      {
        href: "/dashboard/settings",
        label: "إعدادات النشاط",
        mobileLabel: "النشاط",
        key: "Settings",
        icon: "⚙",
      },
      {
        href: "/dashboard/locations",
        label: "الفروع والمواقع",
        mobileLabel: "الفروع",
        key: "Locations",
        icon: "⌖",
      },
      {
        href: "/dashboard/integrations",
        label: "التكاملات",
        mobileLabel: "التكاملات",
        key: "Integrations",
        icon: "⇄",
      },
      {
        href: "/dashboard/usage",
        label: "الاستخدام",
        mobileLabel: "الاستخدام",
        key: "Usage",
        icon: "↗",
      },
      {
        href: "/dashboard/billing",
        label: "الخطة والفواتير",
        mobileLabel: "الخطة",
        key: "Billing",
        icon: "◇",
      },
      {
        href: "/dashboard/reliability",
        label: "رقابة أداء البوت",
        mobileLabel: "الرقابة",
        key: "Reliability",
        icon: "◈",
      },
    ],
  },
  {
    id: "account",
    label: "الحساب",
    mobileLabel: "الحساب",
    icon: "◎",
    href: "/dashboard/account",
    mobilePrimary: true,
  },
] as const satisfies readonly DashboardNavGroup[];

/** Flat list for active-route matching and title resolution (backward compatible). */
export const DASHBOARD_NAV = [
  {
    href: "/dashboard",
    label: "الرئيسية",
    mobileLabel: "الرئيسية",
    key: "Overview",
    icon: "⌂",
    primary: true,
  },
  {
    href: "/dashboard/inbox",
    label: "المحادثات",
    mobileLabel: "المحادثات",
    key: "Inbox",
    icon: "◌",
    primary: true,
  },
  {
    href: "/dashboard/agent",
    label: "الموظف الذكي",
    mobileLabel: "الموظف",
    key: "Receptionist",
    icon: "✦",
    primary: true,
  },
  {
    href: "/dashboard/knowledge",
    label: "علّم الموظف",
    mobileLabel: "التعليم",
    key: "Knowledge",
    icon: "＋",
    primary: false,
  },
  {
    href: "/dashboard/whatsapp",
    label: "واتساب",
    mobileLabel: "واتساب",
    key: "WhatsApp",
    icon: "◉",
    primary: false,
  },
  {
    href: "/dashboard/reliability",
    label: "رقابة أداء البوت",
    mobileLabel: "الرقابة",
    key: "Reliability",
    icon: "◈",
    primary: false,
  },
  {
    href: "/dashboard/locations",
    label: "الفروع والمواقع",
    mobileLabel: "الفروع",
    key: "Locations",
    icon: "⌖",
    primary: false,
  },
  {
    href: "/dashboard/settings",
    label: "الإعدادات",
    mobileLabel: "الإعدادات",
    key: "Settings",
    icon: "⚙",
    primary: true,
  },
  {
    href: "/dashboard/integrations",
    label: "التكاملات",
    mobileLabel: "التكاملات",
    key: "Integrations",
    icon: "⇄",
    primary: false,
  },
  {
    href: "/dashboard/usage",
    label: "الاستخدام",
    mobileLabel: "الاستخدام",
    key: "Usage",
    icon: "↗",
    primary: false,
  },
  {
    href: "/dashboard/billing",
    label: "الخطة والفواتير",
    mobileLabel: "الخطة",
    key: "Billing",
    icon: "◇",
    primary: false,
  },
  {
    href: "/dashboard/account",
    label: "الحساب",
    mobileLabel: "الحساب",
    key: "Account",
    icon: "◎",
    primary: true,
  },
] as const;

export function isNavHrefActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(`${href}/`);
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
  return getNavGroupChildren(group).some((child) =>
    isNavHrefActive(pathname, child.href),
  );
}
