import Link from "next/link";

import { getAdminOverviewCounts } from "@/modules/billing/manual-payment-service";

export default async function AdminHomePage() {
  const overview = await getAdminOverviewCounts();

  const cards = [
    {
      label: "طلبات دفع معلقة",
      value: overview.pendingPayments,
      href: "/admin/payments?status=PENDING",
    },
    {
      label: "اشتراكات مدفوعة نشطة",
      value: overview.activePaidSubscriptions,
      href: "/admin/payments?status=APPROVED",
    },
    {
      label: "مدفوعات تمت الموافقة عليها هذا الشهر",
      value: overview.approvedThisMonth,
      href: "/admin/payments?status=APPROVED",
    },
    {
      label: "إجمالي المبالغ المعتمدة هذا الشهر",
      value: `${overview.approvedAmountThisMonth} EGP`,
      href: "/admin/payments?status=APPROVED",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">نظرة عامة</h2>
        <p className="mt-1 text-sm text-slate-400">
          أرقام حقيقية من قاعدة البيانات — راجع التحويلات خارج DRVOWA عبر InstaPay.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {cards.map((card) => (
          <Link
            key={card.label}
            href={card.href}
            className="rounded-xl border border-slate-800 bg-slate-900 p-5 transition hover:border-amber-500/40"
          >
            <p className="text-sm text-slate-400">{card.label}</p>
            <p className="mt-2 text-3xl font-bold tracking-tight">{card.value}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
