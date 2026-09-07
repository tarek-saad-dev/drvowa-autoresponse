export const DASHBOARD_NAV = [
  { href: "/dashboard", label: "نظرة عامة", key: "Overview" },
  { href: "/dashboard/inbox", label: "الوارد", key: "Inbox", deferred: true },
  {
    href: "/dashboard/contacts",
    label: "جهات الاتصال",
    key: "Contacts",
    deferred: true,
  },
  { href: "/dashboard/agent", label: "الوكيل الذكي", key: "AI Agent" },
  { href: "/dashboard/knowledge", label: "المعرفة", key: "Knowledge" },
  {
    href: "/dashboard/whatsapp",
    label: "واتساب",
    key: "WhatsApp",
    deferred: true,
  },
  { href: "/dashboard/locations", label: "المواقع", key: "Locations" },
  {
    href: "/dashboard/integrations",
    label: "التكاملات",
    key: "Integrations",
    deferred: true,
  },
  {
    href: "/dashboard/usage",
    label: "الاستخدام",
    key: "Usage",
    deferred: true,
  },
  {
    href: "/dashboard/billing",
    label: "الفوترة",
    key: "Billing",
    deferred: true,
  },
  { href: "/dashboard/settings", label: "الإعدادات", key: "Settings" },
] as const;
