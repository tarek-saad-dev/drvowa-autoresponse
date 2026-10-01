export const DASHBOARD_NAV = [
  { href: "/dashboard", label: "الرئيسية", key: "Overview", icon: "⌂", primary: true },
  { href: "/dashboard/inbox", label: "المحادثات", key: "Inbox", icon: "◌", primary: true },
  { href: "/dashboard/agent", label: "موظفك", key: "Receptionist", icon: "✦", primary: true },
  { href: "/dashboard/knowledge", label: "علّمه", key: "Knowledge", icon: "＋", primary: true },
  { href: "/dashboard/whatsapp", label: "واتساب", key: "WhatsApp", icon: "◉", primary: true },
  { href: "/dashboard/locations", label: "الفروع والمواقع", key: "Locations", icon: "⌖", primary: false },
  { href: "/dashboard/usage", label: "الاستهلاك", key: "Usage", icon: "↗", primary: false },
  { href: "/dashboard/billing", label: "الخطة والفوترة", key: "Billing", icon: "◇", primary: false },
  { href: "/dashboard/settings", label: "الإعدادات", key: "Settings", icon: "⚙", primary: false },
] as const;
