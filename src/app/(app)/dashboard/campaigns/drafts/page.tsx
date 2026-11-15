import { LabelCampaignChat } from "@/components/dashboard/label-campaign-chat";

export default async function CampaignDraftsPage({
  searchParams,
}: {
  searchParams: Promise<{ draftId?: string }>;
}) {
  const { draftId } = await searchParams;
  return (
    <div className="space-y-5" dir="rtl">
      <div>
        <p className="text-xs font-black text-primary">الحملات</p>
        <h1 className="mt-1 text-3xl font-black">المسودات والإرسال</h1>
        <p className="mt-2 text-sm leading-7 text-muted-foreground">
          راجع الرسالة واعتمد نصها، وافحص أرقام المستلمين وموافقاتهم.
          الإرسال يتطلب تأكيدًا أخيرًا ولا يبدأ بمجرد فتح المسودة.
        </p>
      </div>
      <LabelCampaignChat initialDraftId={draftId} />
    </div>
  );
}
