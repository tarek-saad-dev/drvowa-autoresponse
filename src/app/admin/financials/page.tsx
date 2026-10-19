import { AdminFinancialDashboard } from "@/components/admin/admin-financial-dashboard";
import { BillingLedgerSummary } from "@/components/admin/billing-ledger-summary";
import { getAdminFinancialReport } from "@/modules/billing/admin-financial-report";

export const dynamic = "force-dynamic";

export default async function AdminFinancialsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const params = await searchParams;
  const report = await getAdminFinancialReport({
    months: params.range === "12" ? 12 : 6,
  });
  return <><BillingLedgerSummary /><AdminFinancialDashboard report={report} detail /></>;
}
