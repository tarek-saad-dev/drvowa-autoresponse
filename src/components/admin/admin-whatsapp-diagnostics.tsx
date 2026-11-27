import type { IncidentView } from "@/modules/channels/incident-view";

type LiveCrypto = {
  status: string;
  plaintextInboundCount: number;
  decryptFailureCount: number;
  messageAbsentFromNodeCount: number;
  lastPlaintextInboundAt: string | null;
  lastDecryptFailureAt: string | null;
};

export type AdminWhatsAppRow = {
  channelConnectionId: string;
  businessId: string;
  businessName: string | null;
  displayName: string | null;
  maskedPhone: string | null;
  externalAccountKey: string | null;
  dbStatus: string;
  isActive: boolean;
  runtimeEngine: string;
  compatibilityStatus: string | null;
  compatibilityLabel: string;
  compatibilityReason: string | null;
  compatibilityUpdatedAt: string | null;
  recommendedRuntimeEngine: string | null;
  live: {
    state: string | null;
    ready: boolean;
    incidents?: IncidentView | null;
    cryptoHealth: LiveCrypto | null;
    compatibilityStatus: string | null;
    recommendedRuntimeEngine: string | null;
  } | null;
};

export function AdminWhatsAppDiagnostics({
  rows,
}: {
  rows: AdminWhatsAppRow[];
}) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No WhatsApp connections found.</p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-card text-foreground/85">
          <tr>
            <th className="px-3 py-2 font-medium">Business</th>
            <th className="px-3 py-2 font-medium">Account</th>
            <th className="px-3 py-2 font-medium">Runtime</th>
            <th className="px-3 py-2 font-medium">Compatibility</th>
            <th className="px-3 py-2 font-medium">Technical</th>
            <th className="px-3 py-2 font-medium">Incidents</th>
            <th className="px-3 py-2 font-medium">Recommended</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const crypto = row.live?.cryptoHealth;
            const incidents = row.live?.incidents;
            return (
              <tr
                key={row.channelConnectionId}
                className="border-t border-border align-top"
              >
                <td className="px-3 py-3">
                  <div className="font-medium text-foreground">
                    {row.businessName || "—"}
                  </div>
                  <div className="font-mono text-xs text-muted-foreground">
                    {row.businessId.slice(0, 8)}…
                  </div>
                </td>
                <td className="px-3 py-3">
                  <div>{row.displayName || "WhatsApp"}</div>
                  <div className="text-muted-foreground" dir="ltr">
                    {row.maskedPhone || "—"}
                  </div>
                  <div className="font-mono text-xs text-muted-foreground">
                    {row.externalAccountKey || "—"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    DB {row.dbStatus}
                    {row.live ? ` · live ${row.live.state}` : " · live n/a"}
                  </div>
                </td>
                <td className="px-3 py-3 font-mono text-xs">
                  {row.runtimeEngine}
                </td>
                <td className="px-3 py-3">
                  <div className="font-medium">{row.compatibilityLabel}</div>
                  <div className="font-mono text-xs text-muted-foreground">
                    {row.compatibilityStatus || "—"}
                  </div>
                  {row.compatibilityReason ? (
                    <div className="mt-1 font-mono text-xs text-muted-foreground">
                      {row.compatibilityReason}
                    </div>
                  ) : null}
                </td>
                <td className="px-3 py-3 font-mono text-xs text-foreground/85">
                  {crypto ? (
                    <ul className="space-y-0.5">
                      <li>plaintext: {crypto.plaintextInboundCount}</li>
                      <li>decrypt failures: {crypto.decryptFailureCount}</li>
                      <li>
                        message absent: {crypto.messageAbsentFromNodeCount}
                      </li>
                      <li>
                        last success:{" "}
                        {crypto.lastPlaintextInboundAt
                          ? crypto.lastPlaintextInboundAt.slice(0, 19)
                          : "—"}
                      </li>
                      <li>
                        last failure:{" "}
                        {crypto.lastDecryptFailureAt
                          ? crypto.lastDecryptFailureAt.slice(0, 19)
                          : "—"}
                      </li>
                      <li>crypto status: {crypto.status}</li>
                    </ul>
                  ) : (
                    <span className="text-muted-foreground">no live crypto</span>
                  )}
                </td>
                <td className="min-w-56 px-3 py-3 text-xs">
                  {!incidents ? <span className="text-muted-foreground">Monitoring unavailable</span> : <>
                    <p className={incidents.stale || incidents.active.length ? "font-bold text-warning" : "text-muted-foreground"}>
                      {incidents.stale ? "Stale sample — refresh" : incidents.active.length ? String(incidents.active.length) + " active" : "No active incident observed"}
                    </p>
                    <p className="mt-1 text-muted-foreground">Sample: {incidents.lastSampleAt.slice(0, 19)} UTC</p>
                    {incidents.active.map((i, index) => <div key={i.issue + index} className="mt-2 font-mono text-warning">{i.issue} · {Math.floor(i.durationMs / 1000)}s</div>)}
                    {incidents.recent.length ? <details className="mt-2"><summary>Recent conditions cleared ({incidents.recent.length})</summary>
                      {incidents.recent.map((i, index) => <p key={i.startedAt + i.issue + index} className="mt-1 font-mono">{i.issue} · {Math.floor(i.durationMs / 1000)}s · {i.endedAt.slice(0, 19)} UTC</p>)}
                    </details> : null}
                  </>}
                </td>
                <td className="px-3 py-3 font-mono text-xs">
                  {row.recommendedRuntimeEngine || "—"}
                  <div className="mt-1 text-muted-foreground">advisory only</div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
