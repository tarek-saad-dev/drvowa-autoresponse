/**
 * SQL Server uniqueidentifier comparison is case-insensitive, while JS string
 * equality is not. Use the actual row ID for selection/state and never compare
 * an external UUID directly with a hydrated message list.
 */
export function canonicalInboxConversationId(
  rows: ReadonlyArray<{ conversationId: string }>,
  requestedId: string | null | undefined,
): string | null {
  if (!requestedId) return null;
  return rows.find(row => row.conversationId.toLowerCase() === requestedId.toLowerCase())
    ?.conversationId ?? null;
}
