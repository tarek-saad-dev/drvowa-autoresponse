export type DashboardNavLeaf = {
  href: string;
  label: string;
  mobileLabel: string;
  key: string;
  icon: string;
};

export type DashboardNavGroup = {
  id: "home" | "inbox" | "crm" | "campaigns" | "employee" | "settings";
  label: string;
  mobileLabel: string;
  icon: string;
  href: string;
  mobilePrimary: boolean;
  children?: readonly DashboardNavLeaf[];
};

/** Primary destinations. Legacy URLs remain valid and are not shown as extra navigation. */
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
    id: "crm", label: "العملاء", mobileLabel: "العملاء",
    icon: "◎", href: "/dashboard/contacts", mobilePrimary: true,
    children: [
      { href: "/dashboard/contacts", label: "قائمة العملاء", mobileLabel: "العملاء", key: "Customers", icon: "◎" },
      { href: "/dashboard/crm/follow-ups", label: "المتابعات", mobileLabel: "المتابعات", key: "FollowUps", icon: "✓" },
      { href: "/dashboard/crm/segments", label: "الشرائح", mobileLabel: "الشرائح", key: "Segments", icon: "▤" },
      { href: "/dashboard/crm/erp", label: "مزامنة ERP", mobileLabel: "ERP", key: "CrmErp", icon: "⇄" },
    ],
  },
  {
    id: "campaigns", label: "الحملات", mobileLabel: "الحملات",
    icon: "◈", href: "/dashboard/campaigns", mobilePrimary: false,
    children: [
      { href: "/dashboard/campaigns", label: "مركز الحملات", mobileLabel: "الحملات", key: "Campaigns", icon: "◈" },
      { href: "/dashboard/campaigns/create", label: "منشئ AI", mobileLabel: "منشئ", key: "CampaignCreate", icon: "✦" },
    ],
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
  { href: "/dashboard/contacts", label: "العملاء", mobileLabel: "العملاء", key: "Customers", icon: "◎", primary: true },
  { href: "/dashboard/campaigns", label: "الحملات", mobileLabel: "الحملات", key: "Campaigns", icon: "◈", primary: false },
  { href: "/dashboard/campaigns/create", label: "منشئ الحملات", mobileLabel: "منشئ", key: "CampaignCreate", icon: "✦", primary: false },
  { href: "/dashboard/crm/follow-ups", label: "المتابعات", mobileLabel: "المتابعات", key: "FollowUps", icon: "✓", primary: false },
  { href: "/dashboard/crm/segments", label: "الشرائح", mobileLabel: "الشرائح", key: "Segments", icon: "▤", primary: false },
  { href: "/dashboard/crm/erp", label: "مزامنة ERP", mobileLabel: "ERP", key: "CrmErp", icon: "⇄", primary: false },
  { href: "/dashboard/agent", label: "الموظف الذكي", mobileLabel: "الموظف", key: "Receptionist", icon: "✦", primary: true },
  { href: "/dashboard/knowledge", label: "علّم الموظف", mobileLabel: "العلم", key: "Knowledge", icon: "＋", primary: false },
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
  if (group.id === "crm" && [
    "/dashboard/contacts",
    "/dashboard/crm/follow-ups",
    "/dashboard/crm/segments",
    "/dashboard/crm/erp",
  ].some((path) => isNavHrefActive(pathname, path))) return true;
  if (group.id === "campaigns" && isNavHrefActive(pathname, "/dashboard/campaigns")) return true;
  if (group.id === "settings" && [
    "/dashboard/account", "/dashboard/whatsapp", "/dashboard/locations",
    "/dashboard/usage", "/dashboard/reliability", "/dashboard/integrations", "/dashboard/billing",
  ].some((path) => isNavHrefActive(pathname, path))) return true;
  return getNavGroupChildren(group).some((child) => isNavHrefActive(pathname, child.href));
}
