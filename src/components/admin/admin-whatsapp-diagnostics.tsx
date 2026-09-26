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
      <p className="text-sm text-slate-400">No WhatsApp connections found.</p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-800">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-slate-900 text-slate-300">
          <tr>
            <th className="px-3 py-2 font-medium">Business</th>
            <th className="px-3 py-2 font-medium">Account</th>
            <th className="px-3 py-2 font-medium">Runtime</th>
            <th className="px-3 py-2 font-medium">Compatibility</th>
            <th className="px-3 py-2 font-medium">Technical</th>
            <th className="px-3 py-2 font-medium">Recommended</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const crypto = row.live?.cryptoHealth;
            return (
              <tr
                key={row.channelConnectionId}
                className="border-t border-slate-800 align-top"
              >
                <td className="px-3 py-3">
                  <div className="font-medium text-slate-100">
                    {row.businessName || "—"}
                  </div>
                  <div className="font-mono text-xs text-slate-500">
                    {row.businessId.slice(0, 8)}…
                  </div>
                </td>
                <td className="px-3 py-3">
                  <div>{row.displayName || "WhatsApp"}</div>
                  <div className="text-slate-400" dir="ltr">
                    {row.maskedPhone || "—"}
                  </div>
                  <div className="font-mono text-xs text-slate-500">
                    {row.externalAccountKey || "—"}
                  </div>
                  <div className="text-xs text-slate-500">
                    DB {row.dbStatus}
                    {row.live ? ` · live ${row.live.state}` : " · live n/a"}
                  </div>
                </td>
                <td className="px-3 py-3 font-mono text-xs">
                  {row.runtimeEngine}
                </td>
                <td className="px-3 py-3">
                  <div className="font-medium">{row.compatibilityLabel}</div>
                  <div className="font-mono text-xs text-slate-500">
                    {row.compatibilityStatus || "—"}
                  </div>
                  {row.compatibilityReason ? (
                    <div className="mt-1 font-mono text-xs text-slate-500">
                      {row.compatibilityReason}
                    </div>
                  ) : null}
                </td>
                <td className="px-3 py-3 font-mono text-xs text-slate-300">
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
                    <span className="text-slate-500">no live crypto</span>
                  )}
                </td>
                <td className="px-3 py-3 font-mono text-xs">
                  {row.recommendedRuntimeEngine || "—"}
                  <div className="mt-1 text-slate-500">advisory only</div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
