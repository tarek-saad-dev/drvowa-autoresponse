import { CustomerProfilePanel } from "@/components/dashboard/crm/customer-profile-panel";

export default async function CustomerProfilePage({
  params,
}: {
  params: Promise<{ customerId: string }>;
}) {
  const { customerId } = await params;
  return <CustomerProfilePanel customerId={customerId} />;
}
