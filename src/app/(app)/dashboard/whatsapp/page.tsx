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
        <h1 className="text-2xl font-bold tracking-tight">واتساب</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          ربط قناة واتساب بمساحة العمل عبر رمز QR.
        </p>
      </div>
      <WhatsAppConnectionPanel initial={initial} />
    </div>
  );
}
