export const DASHBOARD_NAV = [
  { href: "/dashboard", label: "الرئيسية", mobileLabel: "الرئيسية", key: "Overview", icon: "⌂", primary: true },
  { href: "/dashboard/inbox", label: "المحادثات", mobileLabel: "الرسائل", key: "Inbox", icon: "◌", primary: true },
  { href: "/dashboard/agent", label: "الموظف", mobileLabel: "الموظف", key: "Receptionist", icon: "✦", primary: true },
  { href: "/dashboard/knowledge", label: "معلومات الموظف", mobileLabel: "المعلومات", key: "Knowledge", icon: "＋", primary: true },
  { href: "/dashboard/whatsapp", label: "اتصال واتساب", mobileLabel: "واتساب", key: "WhatsApp", icon: "◉", primary: true },
  { href: "/dashboard/locations", label: "الفروع والمواقع", mobileLabel: "الفروع", key: "Locations", icon: "⌖", primary: false },
  { href: "/dashboard/usage", label: "استخدام الخطة", mobileLabel: "الاستخدام", key: "Usage", icon: "↗", primary: false },
  { href: "/dashboard/billing", label: "الخطة والدفع", mobileLabel: "الخطة", key: "Billing", icon: "◇", primary: false },
  { href: "/dashboard/settings", label: "إعدادات البيزنس", mobileLabel: "الإعدادات", key: "Settings", icon: "⚙", primary: false },
] as const;
