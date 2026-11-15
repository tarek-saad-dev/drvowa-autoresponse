import { CampaignBuilderPanel } from "@/components/dashboard/crm/campaign-builder-panel";

export default async function CampaignCreatePage({
  searchParams,
}: {
  searchParams: Promise<{ segmentId?: string }>;
}) {
  const { segmentId } = await searchParams;
  return <CampaignBuilderPanel initialSegmentId={segmentId} />;
}
