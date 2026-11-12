import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { closePool, getPool, query, sql, withTransaction } from "@/lib/db";
import { compileAudienceFilter } from "@/modules/crm/audience-compiler";
import { parseAudienceFilterAst } from "@/modules/crm/audience-ast";
import { isValidErpSaleInvoice, erpInvoiceExternalKey } from "@/modules/crm/erp-sync";
import { normalizeCrmPhone } from "@/modules/crm/phone";

const isolated = process.env.DRVO_TEST_ISOLATED_DB === "1";

describe.runIf(isolated)("CRM Phase 1 SQL Server integration", () => {
  const businessA = randomUUID();
  const businessB = randomUUID();
  const userA = randomUUID();
  const customerA = randomUUID();
  const customerB = randomUUID();

  beforeAll(async () => {
    await getPool();
    // Ensure CRM tables exist (migration 104 applied by CI before these tests).
    const tables = await query<{ name: string }>(
      `SELECT name FROM sys.tables WHERE name IN (N'TblCrmCustomer', N'TblErpInvoiceMirror', N'TblCrmAudienceQueryAudit')`,
    );
    expect(tables.recordset.map((r) => r.name).sort()).toEqual([
      "TblCrmAudienceQueryAudit",
      "TblCrmCustomer",
      "TblErpInvoiceMirror",
    ]);

    await withTransaction(async (trx) => {
      await trx.query(
        `IF NOT EXISTS (SELECT 1 FROM dbo.TblUser WHERE UserID=@id)
         INSERT INTO dbo.TblUser (UserID, Email, PasswordHash, FullName, Status)
         VALUES (@id, @email, N'x', N'CRM Tester', N'ACTIVE')`,
        [
          { name: "id", type: sql.UniqueIdentifier, value: userA },
          { name: "email", type: sql.NVarChar(320), value: `crm-${userA}@example.com` },
        ],
      );
      for (const [id, name] of [
        [businessA, "CRM Biz A"],
        [businessB, "CRM Biz B"],
      ] as const) {
        await trx.query(
          `IF NOT EXISTS (SELECT 1 FROM dbo.TblBusiness WHERE BusinessID=@id)
           INSERT INTO dbo.TblBusiness
             (BusinessID, Name, Slug, Category, CountryCode, Locale, Timezone, Status)
           VALUES (@id, @name, @slug, N'salon', N'EG', N'ar-EG', N'Africa/Cairo', N'ACTIVE')`,
          [
            { name: "id", type: sql.UniqueIdentifier, value: id },
            { name: "name", type: sql.NVarChar(200), value: name },
            { name: "slug", type: sql.NVarChar(100), value: `crm-${id.slice(0, 8)}` },
          ],
        );
      }
    });
  }, 60_000);

  afterAll(async () => {
    await closePool().catch(() => undefined);
  });

  it("migration 104 is idempotent / repeatable (OBJECT_ID guards)", async () => {
    const sqlText = readFileSync(
      resolve("db/migrations/104_crm_phase1_foundation.sql"),
      "utf8",
    );
    const batches = sqlText
      .split(/^\s*GO\s*$/gim)
      .map((b) => b.trim())
      .filter(Boolean);
    // Re-running CREATE IF NOT EXISTS must succeed against already-applied schema.
    for (const batch of batches) {
      await query(batch);
    }
    const auditCols = await query<{ name: string }>(
      `SELECT c.name FROM sys.columns c
       INNER JOIN sys.tables t ON t.object_id = c.object_id
       WHERE t.name = N'TblCrmAudienceQueryAudit' AND c.name IN (N'MatchedRowCount', N'RowCount')`,
    );
    expect(auditCols.recordset.map((r) => r.name)).toEqual(["MatchedRowCount"]);
  });

  it("enforces tenant isolation on CRM customers by BusinessID", async () => {
    const phoneA = normalizeCrmPhone("01011112222");
    const phoneB = normalizeCrmPhone("01033334444");
    await query(
      `INSERT INTO dbo.TblCrmCustomer
         (CustomerID, BusinessID, FullName, PrimaryPhoneNormalized, Source, Status)
       VALUES
         (@cA, @bA, N'عميل أ', @pA, N'MANUAL', N'ACTIVE'),
         (@cB, @bB, N'عميل ب', @pB, N'MANUAL', N'ACTIVE')`,
      [
        { name: "cA", type: sql.UniqueIdentifier, value: customerA },
        { name: "cB", type: sql.UniqueIdentifier, value: customerB },
        { name: "bA", type: sql.UniqueIdentifier, value: businessA },
        { name: "bB", type: sql.UniqueIdentifier, value: businessB },
        { name: "pA", type: sql.NVarChar(32), value: phoneA },
        { name: "pB", type: sql.NVarChar(32), value: phoneB },
      ],
    );

    const scoped = await query<{ CustomerID: string }>(
      `SELECT CustomerID FROM dbo.TblCrmCustomer WHERE BusinessID=@bA`,
      [{ name: "bA", type: sql.UniqueIdentifier, value: businessA }],
    );
    expect(scoped.recordset.map((r) => r.CustomerID.toLowerCase())).toEqual([
      customerA.toLowerCase(),
    ]);
  });

  it("stores only valid مبيعات invoices as IsValidSale=1 in ERP mirror", async () => {
    const validKey = erpInvoiceExternalKey({ invId: 9001, invType: "مبيعات" })!;
    const invalidKey = erpInvoiceExternalKey({ invId: 9002, invType: "مرتجع" })!;
    expect(isValidErpSaleInvoice({ invType: "مبيعات", isActive: "no", status: "active" })).toBe(true);
    expect(isValidErpSaleInvoice({ invType: "مرتجع", isActive: "no", status: "active" })).toBe(false);

    await query(
      `INSERT INTO dbo.TblErpInvoiceMirror
         (InvoiceMirrorID, BusinessID, ExternalInvId, CustomerID, InvType, GrandTotal, IsValidSale, IsDeleted)
       VALUES
         (@id1, @bA, @k1, @cA, N'مبيعات', 100, 1, 0),
         (@id2, @bA, @k2, @cA, N'مرتجع', 50, 0, 0)`,
      [
        { name: "id1", type: sql.UniqueIdentifier, value: randomUUID() },
        { name: "id2", type: sql.UniqueIdentifier, value: randomUUID() },
        { name: "bA", type: sql.UniqueIdentifier, value: businessA },
        { name: "cA", type: sql.UniqueIdentifier, value: customerA },
        { name: "k1", type: sql.NVarChar(64), value: validKey },
        { name: "k2", type: sql.NVarChar(64), value: invalidKey },
      ],
    );

    const spend = await query<{ Total: number }>(
      `SELECT ISNULL(SUM(GrandTotal),0) AS Total
       FROM dbo.TblErpInvoiceMirror
       WHERE BusinessID=@bA AND CustomerID=@cA AND IsValidSale=1 AND IsDeleted=0`,
      [
        { name: "bA", type: sql.UniqueIdentifier, value: businessA },
        { name: "cA", type: sql.UniqueIdentifier, value: customerA },
      ],
    );
    expect(Number(spend.recordset[0]?.Total)).toBe(100);
  });

  it("compiles and executes a tenant-scoped audience query", async () => {
    const filter = parseAudienceFilterAst({
      version: 1,
      all: [{ type: "has_phone", value: true }],
      limit: 50,
    });
    const compiled = compileAudienceFilter({ businessId: businessA, filter });
    expect(compiled.sqlText).toContain("c.BusinessID = @businessId");

    const rows = await query<{ CustomerID: string }>(compiled.sqlText, compiled.inputs);
    expect(rows.recordset.every((r) => r.CustomerID)).toBe(true);
    // Only business A customer with phone should appear.
    expect(rows.recordset.map((r) => r.CustomerID.toLowerCase())).toContain(
      customerA.toLowerCase(),
    );
    expect(rows.recordset.map((r) => r.CustomerID.toLowerCase())).not.toContain(
      customerB.toLowerCase(),
    );
  });
});
