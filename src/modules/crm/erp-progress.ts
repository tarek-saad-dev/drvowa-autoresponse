export type ProgressRow = {
  resource: "customers" | "invoices" | "catalog";
  sourceCount: number;
  mirroredCount: number;
  percent: number | null;
  discrepancy: boolean;
};

/** A snapshot ratio, never inferred from max ID or processed-page count.
 * The source and mirror include cancelled invoice headers and deleted catalog
 * rows. A mismatch >100% is displayed explicitly rather than silently treated
 * as success. A zero-row source is complete only when CRM is also empty.
 */
export function calculateErpProgressRows(input: {
  sourceCounts: { customers: number; invoices: number; catalog: number };
  mirrored: { customers: number; invoices: number; catalog: number };
}): ProgressRow[] {
  const resources = ["customers", "invoices", "catalog"] as const;
  return resources.map((resource) => {
    const sourceCount = input.sourceCounts[resource];
    const mirroredCount = input.mirrored[resource];
    const valid = Number.isSafeInteger(sourceCount) && sourceCount >= 0
      && Number.isSafeInteger(mirroredCount) && mirroredCount >= 0;
    if (!valid) {
      return { resource, sourceCount, mirroredCount, percent: null, discrepancy: true };
    }
    const discrepancy = mirroredCount > sourceCount;
    const percent = sourceCount === 0
      ? (mirroredCount === 0 ? 100 : null)
      : Math.min(100, Math.round((mirroredCount / sourceCount) * 1000) / 10);
    return { resource, sourceCount, mirroredCount, percent, discrepancy };
  });
}

export function overallErpProgress(rows: ProgressRow[]) {
  if (!rows.length || rows.some((row) => row.percent === null || row.discrepancy)) return null;
  const all = rows.reduce((sum, row) => sum + row.sourceCount, 0);
  const copied = rows.reduce((sum, row) => sum + row.mirroredCount, 0);
  return all === 0 ? 100 : Math.min(100, Math.round((copied / all) * 1000) / 10);
}
