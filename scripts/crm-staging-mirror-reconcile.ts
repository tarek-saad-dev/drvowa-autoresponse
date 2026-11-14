/**
 * Read-only CRM staging SQL reconciliation. Never mutates operational tables.
 * Guard DB identity before querying any business CRM data. Designed for an
 * isolated AutoRespond staging database, NOT the production DRVO instance.
 */
import { closePool, getPool, query, sql } from "../src/lib/db";
import { requireApprovedStagingDbIdentity } from "../src/modules/crm/staging-guard";

function required(key: string): string {
  const value = process.env[key]?.trim();
  if (!value) throw new Error(`Missing required staging configuration: ${key}`);
  return value;
}

function expectedCount(key: string): number | null {
  const value = process.env[key]?.trim();
  if (value === undefined) return null;
  const numberValue = Number(value);
  if (!Number.isSafeInteger(numberValue) || numberValue < 0) {
    throw new Error(`Invalid nonnegative count configuration: ${key}`);
  }
  return numberValue;
}

function safeCount(value: unknown, field: string): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 0) {
    throw new Error(`Invalid aggregated count: ${field}`);
  }
  return result;
}

async function main(): Promise<void> {
  const expectedDatabase = required("CRM_STAGING_DB_NAME");
  const expectedLogin = required("CRM_STAGING_DB_LOGIN");
  const businessId = required("CRM_STAGING_BUSINESS_ID");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(businessId)) {
    throw new Error("Staging business ID must be a UUID");
  }

  const pool = await getPool();
  const identity = await pool.request().query<{
    DatabaseName: string;
    LoginName: string;
  }>("SELECT DB_NAME() AS DatabaseName, SUSER_SNAME() AS LoginName");
  const first = identity.recordset[0];
  if (!first) throw new Error("Cannot verify staging SQL identity");
  requireApprovedStagingDbIdentity({
    actualDatabase: first.DatabaseName,
    actualLogin: first.LoginName,
    expectedDatabase,
    expectedLogin,
  });

  const summaryResult = await query<{
    linkedCustomers: number;
    invoiceMirrors: number;
    cancelledInvoices: number;
    validSales: number;
    invoiceLines: number;
    invoiceMissingCustomer: number;
    catalogTotal: number;
    catalogDeleted: number;
  }>(`
    SELECT
      (SELECT COUNT_BIG(1) FROM dbo.TblCrmCustomer c
       WHERE c.BusinessID=@businessId AND c.ExternalErpClientId IS NOT NULL
         AND c.Status <> N'MERGED') AS linkedCustomers,
      (SELECT COUNT_BIG(1) FROM dbo.TblErpInvoiceMirror i
       WHERE i.BusinessID=@businessId) AS invoiceMirrors,
      (SELECT COUNT_BIG(1) FROM dbo.TblErpInvoiceMirror i
       WHERE i.BusinessID=@businessId AND i.IsDeleted=1) AS cancelledInvoices,
      (SELECT COUNT_BIG(1) FROM dbo.TblErpInvoiceMirror i
       WHERE i.BusinessID=@businessId AND i.IsValidSale=1 AND i.IsDeleted=0) AS validSales,
      (SELECT COUNT_BIG(1) FROM dbo.TblErpInvoiceLineMirror l
       WHERE l.BusinessID=@businessId) AS invoiceLines,
      (SELECT COUNT_BIG(1) FROM dbo.TblErpInvoiceMirror i
       WHERE i.BusinessID=@businessId AND i.ExternalClientId IS NOT NULL
         AND i.CustomerID IS NULL) AS invoiceMissingCustomer,
      (SELECT COUNT_BIG(1) FROM dbo.TblErpServiceCatalog s
       WHERE s.BusinessID=@businessId) AS catalogTotal,
      (SELECT COUNT_BIG(1) FROM dbo.TblErpServiceCatalog s
       WHERE s.BusinessID=@businessId AND s.IsDeleted=1) AS catalogDeleted
  `, [{ name: "businessId", type: sql.UniqueIdentifier, value: businessId }]);

  const row = summaryResult.recordset[0];
  if (!row) throw new Error("No CRM mirror summary returned");
  const values = {
    linkedCustomers: safeCount(row.linkedCustomers, "linkedCustomers"),
    invoiceMirrors: safeCount(row.invoiceMirrors, "invoiceMirrors"),
    cancelledInvoices: safeCount(row.cancelledInvoices, "cancelledInvoices"),
    validSales: safeCount(row.validSales, "validSales"),
    invoiceLines: safeCount(row.invoiceLines, "invoiceLines"),
    invoiceMissingCustomer: safeCount(row.invoiceMissingCustomer, "invoiceMissingCustomer"),
    catalogTotal: safeCount(row.catalogTotal, "catalogTotal"),
    catalogDeleted: safeCount(row.catalogDeleted, "catalogDeleted"),
  };

  const syncResult = await query<{ Resource: string; Status: string }>(`
    SELECT Resource, Status FROM dbo.TblErpSyncState
    WHERE BusinessID=@businessId AND Resource IN (N'customers',N'invoices',N'catalog')
    ORDER BY Resource
  `, [{ name: "businessId", type: sql.UniqueIdentifier, value: businessId }]);

  const syncStates = Object.fromEntries(syncResult.recordset.map((r) => [r.Resource, r.Status]));
  const allAppendComplete = ["customers", "invoices", "catalog"]
    .every((resource) => syncStates[resource] === "SUCCESS");

  const expected = {
    linkedCustomers: expectedCount("CRM_STAGING_EXPECT_SOURCE_CUSTOMERS"),
    invoiceMirrors: expectedCount("CRM_STAGING_EXPECT_SOURCE_INVOICES"),
    cancelledInvoices: expectedCount("CRM_STAGING_EXPECT_SOURCE_CANCELLED"),
    catalogTotal: expectedCount("CRM_STAGING_EXPECT_SOURCE_CATALOG"),
    catalogDeleted: expectedCount("CRM_STAGING_EXPECT_SOURCE_CATALOG_DELETED"),
  };
  const comparisons = Object.fromEntries(Object.entries(expected)
    .filter((entry): entry is [string, number] => entry[1] !== null)
    .map(([key, number]) => [key, values[key as keyof typeof expected] === number]));

  const requiresParity = process.env.CRM_STAGING_REQUIRE_PARITY === "YES_STAGING_ONLY";
  const mismatch = Object.values(comparisons).includes(false);
  const complete = allAppendComplete && !mismatch;
  console.log(JSON.stringify({
    mode: "crm-staging-sql-read-only",
    database: first.DatabaseName,
    login: first.LoginName,
    businessIdPrefix: businessId.slice(0, 8),
    syncStates,
    allAppendComplete,
    mirrorCounts: values,
    sourceCountComparisons: comparisons,
    parity: complete ? "PASS" : "INCOMPLETE_OR_MISMATCH",
  }, null, 2));

  if (requiresParity && !complete) {
    throw new Error("CRM staging mirror parity is incomplete or differs from approved source counts");
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "CRM staging mirror check failed");
  process.exitCode = 1;
}).finally(async () => {
  await closePool().catch(() => undefined);
});
