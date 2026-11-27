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
import { buildIncidentView, type IncidentView } from "@/modules/channels/incident-view";
import { listOpenWhatsAppAdminAlerts } from "@/modules/reliability/whatsapp-alert-service";

export const dynamic = "force-dynamic";

export default async function AdminWhatsAppPage() {
  await requirePlatformAdmin();

  const [connections, alerts] = await Promise.all([
    channelRepo.listAllWhatsAppConnections(),
    listOpenWhatsAppAdminAlerts(),
  ]);

  const rows = await Promise.all(
    connections.map(async (c) => {
      let live: {
        state: string | null;
        ready: boolean;
        incidents: IncidentView | null;
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
            incidents: buildIncidentView(status.incidentMonitor),
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
        <h2 className="text-xl font-semibold">WhatsApp reliability &amp; compatibility</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Live worker diagnostics and recent incidents. Refresh to get the latest sample; no automatic engine switching.
        </p>
      </div>
      <section className="rounded-lg border border-border p-4">
        <h3 className="font-semibold">تنبيهات الأعطال المفتوحة</h3>
        <p className="mt-1 text-xs text-muted-foreground">آخر 100 تنبيه مسجل في قاعدة البيانات؛ التنبيه القديم يحتاج إعادة تحقق ولا يعني أن العطل مستمر مؤكدًا.</p>
        {!alerts.length ? <p className="mt-3 text-sm text-muted-foreground">لا توجد تنبيهات مفتوحة مسجلة.</p> :
          <div className="mt-3 divide-y divide-border">{alerts.map(a => <div key={a.IncidentID} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
            <div><p className="font-bold">{a.BusinessName ?? "—"}</p><p className="font-mono text-xs text-warning">{a.DetailCode}</p></div>
            <div className="text-xs text-muted-foreground" dir="ltr"><p>Detected: {a.DetectedAtUtc.toISOString().slice(0,19)} UTC</p><p>Last seen: {a.LastSeenAtUtc.toISOString().slice(0,19)} UTC</p>{a.Stale ? <p className="text-warning">Stale — verify</p> : null}</div>
          </div>)}</div>}
      </section>
      <AdminWhatsAppDiagnostics rows={rows} />
    </div>
  );
}
