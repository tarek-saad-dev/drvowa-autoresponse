export const DASHBOARD_NAV = [
  { href: "/dashboard", label: "الرئيسية", mobileLabel: "الرئيسية", key: "Overview", icon: "⌂", primary: true },
  { href: "/dashboard/inbox", label: "الرسائل", mobileLabel: "الرسائل", key: "Inbox", icon: "◌", primary: true },
  { href: "/dashboard/agent", label: "موظف الاستقبال", mobileLabel: "الموظف", key: "Receptionist", icon: "✦", primary: true },
  { href: "/dashboard/knowledge", label: "المعرفة", mobileLabel: "المعرفة", key: "Knowledge", icon: "＋", primary: true },
  { href: "/dashboard/whatsapp", label: "واتساب", mobileLabel: "واتساب", key: "WhatsApp", icon: "◉", primary: true },
  { href: "/dashboard/locations", label: "الفروع والمواقع", mobileLabel: "الفروع", key: "Locations", icon: "⌖", primary: false },
  { href: "/dashboard/usage", label: "الاستخدام", mobileLabel: "الاستخدام", key: "Usage", icon: "↗", primary: false },
  { href: "/dashboard/billing", label: "الخطة والفوترة", mobileLabel: "الخطة", key: "Billing", icon: "◇", primary: false },
  { href: "/dashboard/settings", label: "الإعدادات", mobileLabel: "الإعدادات", key: "Settings", icon: "⚙", primary: false },
] as const;
