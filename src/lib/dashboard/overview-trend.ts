import { query, sql } from "@/lib/db";

export type OverviewTrendDay = { date: string; conversations: number };

export async function getOverviewConversationTrend(businessId: string): Promise<OverviewTrendDay[]> {
  const rows = await query<{ DayUtc: string; Total: number }>(
    `SELECT CONVERT(varchar(10), CAST(COALESCE(c.LastMessageAtUtc, c.CreatedAtUtc) AS date), 23) AS DayUtc,
            COUNT(1) AS Total
       FROM dbo.TblConversation c
      WHERE c.BusinessID = @businessId
        AND c.IsArchived = 0
        AND COALESCE(c.LastMessageAtUtc, c.CreatedAtUtc) >= DATEADD(day, -6, CAST(SYSUTCDATETIME() AS date))
      GROUP BY CAST(COALESCE(c.LastMessageAtUtc, c.CreatedAtUtc) AS date)
      ORDER BY DayUtc`,
    [{ name: "businessId", type: sql.UniqueIdentifier, value: businessId }],
  );
  return rows.recordset.map((row) => ({ date: row.DayUtc, conversations: Number(row.Total) || 0 }));
}

export function fillOverviewTrend(rows: OverviewTrendDay[], now: Date = new Date()): OverviewTrendDay[] {
  const counts = new Map(rows.map((row) => [row.date, row.conversations]));
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(todayUtc - (6 - index) * 86_400_000).toISOString().slice(0, 10);
    return { date, conversations: counts.get(date) ?? 0 };
  });
}
