import { requirePlatformAdmin } from "@/modules/platform-admin/service";
import * as channelRepo from "@/modules/channels/repository";
import {
  adminCompatibilityLabel,
} from "@/modules/channels/compatibility";
import {
  getAccountStatus,
  WhatsAppRuntimeError,
} from "@/modules/channels/runtime-client";
import { AdminWhatsAppDiagnostics } from "@/components/admin/admin-whatsapp-diagnostics";

export const dynamic = "force-dynamic";

export default async function AdminWhatsAppPage() {
  await requirePlatformAdmin();

  const connections = await channelRepo.listAllWhatsAppConnections();

  const rows = await Promise.all(
    connections.map(async (c) => {
      let live: {
        state: string | null;
        ready: boolean;
        cryptoHealth: {
          status: string;
          plaintextInboundCount: number;
          decryptFailureCount: number;
          messageAbsentFromNodeCount: number;
          lastPlaintextInboundAt: string | null;
          lastDecryptFailureAt: string | null;
        } | null;
        compatibilityStatus: string | null;
        recommendedRuntimeEngine: string | null;
      } | null = null;

      if (c.externalAccountKey) {
        try {
          const status = await getAccountStatus(c.externalAccountKey);
          const ch = status.cryptoHealth;
          live = {
            state: status.state ?? null,
            ready: Boolean(status.ready),
            cryptoHealth: ch
              ? {
                  status: String(ch.status || ch.cryptoHealth || "UNKNOWN"),
                  plaintextInboundCount: Number(ch.plaintextInboundCount) || 0,
                  decryptFailureCount: Number(ch.decryptFailureCount) || 0,
                  messageAbsentFromNodeCount:
                    Number(ch.messageAbsentFromNodeCount) || 0,
                  lastPlaintextInboundAt: ch.lastPlaintextInboundAt ?? null,
                  lastDecryptFailureAt: ch.lastDecryptFailureAt ?? null,
                }
              : null,
            compatibilityStatus: status.compatibilityStatus ?? null,
            recommendedRuntimeEngine: status.recommendedRuntimeEngine ?? null,
          };
        } catch (error) {
          if (!(error instanceof WhatsAppRuntimeError)) {
            throw error;
          }
          live = null;
        }
      }

      const status =
        (live?.compatibilityStatus as typeof c.compatibilityStatus) ||
        c.compatibilityStatus;

      return {
        channelConnectionId: c.channelConnectionId,
        businessId: c.businessId,
        businessName: c.businessName ?? null,
        displayName: c.displayName,
        maskedPhone: c.maskedPhone,
        externalAccountKey: c.externalAccountKey,
        dbStatus: c.status,
        isActive: c.isActive,
        runtimeEngine: c.runtimeEngine,
        compatibilityStatus: status,
        compatibilityLabel: adminCompatibilityLabel(status),
        compatibilityReason: c.compatibilityReason,
        compatibilityUpdatedAt: c.compatibilityUpdatedAt
          ? c.compatibilityUpdatedAt.toISOString()
          : null,
        recommendedRuntimeEngine:
          live?.recommendedRuntimeEngine || c.recommendedRuntimeEngine,
        live,
      };
    }),
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">WhatsApp compatibility</h2>
        <p className="mt-1 text-sm text-slate-400">
          Phase 1 observation only — no automatic engine switching.
        </p>
      </div>
      <AdminWhatsAppDiagnostics rows={rows} />
    </div>
  );
}
