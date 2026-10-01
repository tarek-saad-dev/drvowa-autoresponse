import { WhatsAppConnectionPanel } from "@/components/dashboard/whatsapp-panel";
import { requireAuthenticatedUser } from "@/lib/tenancy/require-user";
import { resolveActiveBusiness } from "@/lib/tenancy/active-business";
import { getWhatsAppConnectionView } from "@/modules/channels/whatsapp-service";

export default async function WhatsAppPage() {
  const user = await requireAuthenticatedUser();
  const businessId = await resolveActiveBusiness(
    user.userId,
    user.activeBusinessId,
  );

  const view = businessId
    ? await getWhatsAppConnectionView({ businessId })
    : {
        uiState: "NOT_CONNECTED" as const,
        connection: null,
        runtime: null,
        message: null,
        compatibility: null,
      };

  const initial = {
    uiState: view.uiState,
    message: view.message ?? null,
    compatibility: view.compatibility ?? null,
    connection: view.connection
      ? {
          channelConnectionId: view.connection.channelConnectionId,
          status: view.connection.status,
          isActive: view.connection.isActive,
          displayName: view.connection.displayName,
          maskedPhone: view.connection.maskedPhone,
        }
      : null,
    runtime: view.runtime,
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-black text-primary">اتصال واتساب</p>
        <h1 className="mt-1 text-3xl font-black tracking-[-0.035em]">خلّي الموظف يستقبل العملاء على واتساب</h1>
        <p className="mt-2 max-w-2xl text-sm leading-7 text-muted-foreground">
          اربط الرقم في كام خطوة بسيطة، وهنا هتشوف حالة الاتصال واستقبال الرسائل بشكل واضح.
        </p>
      </div>
      <WhatsAppConnectionPanel initial={initial} />
    </div>
  );
}
