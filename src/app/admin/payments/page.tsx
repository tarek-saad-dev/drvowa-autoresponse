import Link from "next/link";

import { AdminPaymentsPanel } from "@/components/admin/admin-payments-panel";
import { listPaymentsForAdmin } from "@/modules/billing/manual-payment-service";
import type { ManualPaymentStatus } from "@/types/domain";

type PageProps = {
  searchParams: Promise<{ status?: string }>;
};

export default async function AdminPaymentsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const raw = (params.status ?? "PENDING").toUpperCase();
  const status =
    raw === "ALL" ? "ALL" : (raw as ManualPaymentStatus);

  const items = await listPaymentsForAdmin({ status });

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold">طلبات الدفع</h2>
        <p className="mt-1 text-sm text-slate-400">
          راجع التحويلات يدوياً في InstaPay ثم اعتمد أو ارفض الطلب.
        </p>
      </div>
      <div className="flex flex-wrap gap-2 text-sm">
        {(
          [
            ["PENDING", "معلقة"],
            ["APPROVED", "معتمدة"],
            ["REJECTED", "مرفوضة"],
            ["ALL", "الكل"],
          ] as const
        ).map(([value, label]) => (
          <Link
            key={value}
            href={`/admin/payments?status=${value}`}
            className={`rounded-md px-3 py-1.5 ${
              (params.status ?? "PENDING").toUpperCase() === value
                ? "bg-amber-500 text-slate-950"
                : "bg-slate-800 text-slate-200 hover:bg-slate-700"
            }`}
          >
            {label}
          </Link>
        ))}
      </div>
      <AdminPaymentsPanel
        initialItems={items.map((p) => ({
          paymentRequestId: p.paymentRequestId,
          paymentReference: p.paymentReference,
          businessName: p.businessName,
          submitterEmail: p.submitterEmail,
          submitterName: p.submitterName,
          currentPlanName: p.currentPlanName,
          requestedPlanName: p.requestedPlanDisplayName,
          liveRequestedPlanPrice: p.liveRequestedPlanPrice,
          amount: p.amount,
          currencyCode: p.currencyCode,
          payerName: p.payerName,
          transferReference: p.transferReference,
          customerNote: p.customerNote,
          status: p.status,
          submittedAtLabel: p.submittedAtUtc
            ? new Intl.DateTimeFormat("en-GB", {
                dateStyle: "short",
                timeStyle: "short",
                timeZone: "UTC",
              }).format(p.submittedAtUtc)
            : "—",
          reviewNote: p.reviewNote,
        }))}
      />
    </div>
  );
}
