import { query, sql } from "@/lib/db";
import { getAccountStatus } from "@/modules/channels/runtime-client";
import { buildIncidentView } from "@/modules/channels/incident-view";
import { ALERT_KIND, planIncidentAlerts } from "@/modules/reliability/whatsapp-alert-policy";

// Round-robin cursor prevents repeatedly scanning the first accounts.
// Single existing AI worker owns the tick; SQL unique key protects retries.
let cursor: string | null = null;
type AccountRow = { BusinessID: string; ChannelConnectionID: string; ExternalAccountKey: string };
function params(row: AccountRow, reference: string, code: string) {
  return [
    { name: "businessId", type: sql.UniqueIdentifier, value: row.BusinessID },
    { name: "kind", type: sql.NVarChar(48), value: ALERT_KIND },
    { name: "reference", type: sql.NVarChar(256), value: reference },
    { name: "code", type: sql.NVarChar(64), value: code },
  ];
}
export async function scanWhatsAppIncidentAlerts() {
  const result = await query<AccountRow>(
    `SELECT TOP (8) BusinessID, ChannelConnectionID, ExternalAccountKey
      FROM dbo.TblChannelConnection
      WHERE Channel=N'WHATSAPP' AND Provider=N'BAILEYS' AND RuntimeEngine=N'BAILEYS_V7'
        AND ExternalAccountKey IS NOT NULL AND (IsActive=1 OR Status=N'ERROR')
        AND (@cursor IS NULL OR ChannelConnectionID>@cursor)
      ORDER BY ChannelConnectionID`,
    [{ name: "cursor", type: sql.UniqueIdentifier, value: cursor }],
  );
  if (!result.recordset.length) { cursor = null; return { checked: 0, unavailable: 0 }; }
  let unavailable = 0;
  for (const row of result.recordset) {
    cursor = row.ChannelConnectionID;
    try {
      const live = await getAccountStatus(row.ExternalAccountKey);
      const view = buildIncidentView(live.incidentMonitor);
      if (!view || view.stale) { unavailable++; continue; }
      const actions = planIncidentAlerts(row.ChannelConnectionID, view);
      for (const event of actions.open) {
        await query(
          `MERGE dbo.TblReliabilityIncident WITH(HOLDLOCK) AS target
           USING (SELECT @businessId AS BusinessID,@kind AS IncidentKind,@reference AS ReferenceKey) AS source
           ON target.BusinessID=source.BusinessID AND target.IncidentKind=source.IncidentKind AND target.ReferenceKey=source.ReferenceKey
           WHEN MATCHED AND target.Status=N'OPEN' THEN UPDATE SET LastSeenAtUtc=SYSUTCDATETIME(), DetailCode=@code
           WHEN NOT MATCHED THEN INSERT(BusinessID,IncidentKind,ReferenceKey,DetailCode)
           VALUES(@businessId,@kind,@reference,@code);`, params(row, event.reference, event.code));
      }
      for (const event of actions.close) {
        // Missing/stale samples never resolve an incident; explicit interruption
        // is recorded distinctly and does not assert that the fault was repaired.
        await query(
          `UPDATE dbo.TblReliabilityIncident
            SET Status=N'RESOLVED',ResolvedAtUtc=SYSUTCDATETIME(),LastSeenAtUtc=SYSUTCDATETIME(),DetailCode=@code
            WHERE BusinessID=@businessId AND IncidentKind=@kind AND ReferenceKey=@reference AND Status=N'OPEN'`,
          params(row, event.reference, event.code));
      }
    } catch { unavailable++; }
  }
  if (result.recordset.length < 8) cursor = null;
  return { checked: result.recordset.length, unavailable };
}

export async function getWhatsAppAdminAlertCount() {
  const r = await query<{ total: number; stale: number }>(
    `SELECT COUNT(*) AS total,
        COUNT(CASE WHEN LastSeenAtUtc < DATEADD(minute,-5,SYSUTCDATETIME()) THEN 1 END) AS stale
      FROM dbo.TblReliabilityIncident
      WHERE IncidentKind=@kind AND Status=N'OPEN'`,
    [{ name: "kind", type: sql.NVarChar(48), value: ALERT_KIND }],
  );
  return { total: Number(r.recordset[0]?.total ?? 0), stale: Number(r.recordset[0]?.stale ?? 0) };
}

export async function listOpenWhatsAppAdminAlerts() {
  const r = await query<{ IncidentID: string; BusinessName: string | null; DetailCode: string | null; DetectedAtUtc: Date; LastSeenAtUtc: Date; Stale: boolean }>(
    `SELECT TOP (100) i.IncidentID,b.Name AS BusinessName,i.DetailCode,i.DetectedAtUtc,i.LastSeenAtUtc,
       CAST(CASE WHEN i.LastSeenAtUtc<DATEADD(minute,-5,SYSUTCDATETIME()) THEN 1 ELSE 0 END AS bit) AS Stale
       FROM dbo.TblReliabilityIncident i LEFT JOIN dbo.TblBusiness b ON b.BusinessID=i.BusinessID
       WHERE i.IncidentKind=@kind AND i.Status=N'OPEN'
       ORDER BY i.DetectedAtUtc DESC`,
    [{ name: "kind", type: sql.NVarChar(48), value: ALERT_KIND }],
  );
  return r.recordset;
}
