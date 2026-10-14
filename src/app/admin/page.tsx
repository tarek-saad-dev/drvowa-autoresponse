import { AdminFinancialDashboard } from "@/components/admin/admin-financial-dashboard";
import { getAdminFinancialReport } from "@/modules/billing/admin-financial-report";

export const dynamic = "force-dynamic";

export default async function AdminHomePage() {
  const report = await getAdminFinancialReport({ months: 6 });
  return <AdminFinancialDashboard report={report} />;
}
