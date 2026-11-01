/**
 * READ-ONLY Pricing V1 production verification.
 * No payments, grants, users, receipts or test records are created.
 * An isolated SQL integration suite exercises the write-side end to end in CI.
 */
import { closePool, query } from "../src/lib/db";
import { isPricingV1PaymentEnabled, quotePricingV1 } from "../src/modules/pricing/payment-quote";

type PlanRow = {
  Code: string; MonthlyPriceAmount: number; MonthlyAiReplies: number;
  MaxWhatsAppConnections: number; MaxAgents: number; MaxActiveKnowledgeItems: number;
};
type Counts = { TotalOrders: number; ApprovedOrders: number; PaidReceipts: number; BadOrders: number };
type LotCounts = { InvalidLots: number; InvalidAllocations: number; ActiveReplies: number };

async function main() {
  const requiredFlags = [
    "DRVO_PRICING_V1_PAYMENTS",
    "DRVO_PRICING_V1_FREE_TRIAL",
    "DRVO_PRICING_V1_ADDON_DRAFTS",
    "DRVO_PRICING_V1_ADDON_CONSUMPTION",
  ];
  for (const key of requiredFlags) {
    if (process.env[key] !== "true") throw new Error(`Pricing V1 flag not enabled: ${key}`);
  }
  if (!isPricingV1PaymentEnabled() || quotePricingV1("STARTER", "ANNUAL").amount !== 14900) {
    throw new Error("Pricing V1 payment quote is not active");
  }
  const versions = await query<{Version:string}>(
    "SELECT Version FROM dbo.TblSchemaMigration WHERE Version IN (N'098',N'099',N'100',N'101')"
  );
  if (versions.recordset.length !== 4) throw new Error("Required pricing migrations 098–101 missing");

  const plans = await query<PlanRow>(`SELECT Code,MonthlyPriceAmount,MonthlyAiReplies,
    MaxWhatsAppConnections,MaxAgents,MaxActiveKnowledgeItems FROM dbo.TblPlan
    WHERE Code IN (N'FREE',N'STARTER',N'PRO',N'BUSINESS') AND Status=N'ACTIVE'`);
  const expected: Record<string,number[]> = {
    FREE:[0,30,1,1,50],
    STARTER:[1490,1000,1,1,100],
    PRO:[3490,3000,1,3,400],
    BUSINESS:[8490,8000,1,8,1200],
  };
  if (plans.recordset.length !== 4) throw new Error("Pricing V1 active plan count mismatch");
  for (const p of plans.recordset) {
    const actual = [p.MonthlyPriceAmount,p.MonthlyAiReplies,p.MaxWhatsAppConnections,
      p.MaxAgents,p.MaxActiveKnowledgeItems].map(Number);
    if (JSON.stringify(actual) !== JSON.stringify(expected[p.Code])) {
      throw new Error(`Pricing V1 database plan mismatch: ${p.Code}`);
    }
  }

  // Each order must have exactly one matching invoice, and approved orders one
  // receipt and one grant. Failed/rejected/unreviewed orders may not grant credit.
  const result = await query<Counts>(`
    SELECT
      COUNT(1) AS TotalOrders,
      COALESCE(SUM(CASE WHEN o.Status=N'APPROVED' THEN 1 ELSE 0 END),0) AS ApprovedOrders,
      COALESCE(SUM(CASE WHEN o.Status=N'APPROVED' AND docs.Receipts=1 THEN 1 ELSE 0 END),0) AS PaidReceipts,
      COALESCE(SUM(CASE WHEN
        i.InvoiceID IS NULL OR i.BusinessID<>o.BusinessID OR
        i.AmountMinor<>CONVERT(BIGINT,ROUND(o.AmountEgp*100,0)) OR
        i.CurrencyCode<>N'EGP' OR
        (o.Status=N'APPROVED' AND (i.Status<>N'PAID' OR i.SettledAtUtc IS NULL
           OR docs.Receipts<>1 OR docs.ReceiptValue<>i.AmountMinor OR
           docs.ReceiptCurrency<>N'EGP' OR grants.Grants<>1 OR grants.GrantedQuantity<>o.Quantity)) OR
        (o.Status=N'REJECTED' AND (i.Status<>N'VOID' OR docs.Receipts<>0 OR grants.Grants<>0)) OR
        (o.Status IN (N'DRAFT',N'PENDING') AND
          (i.Status<>N'OPEN' OR docs.Receipts<>0 OR grants.Grants<>0)) OR
        o.Status NOT IN (N'DRAFT',N'PENDING',N'APPROVED',N'REJECTED')
        THEN 1 ELSE 0 END),0) AS BadOrders
    FROM dbo.TblPricingAddonOrder o
    LEFT JOIN dbo.TblPricingAddonInvoice i ON i.OrderID=o.OrderID
    OUTER APPLY (
      SELECT COUNT(1) AS Receipts,COALESCE(SUM(r.AmountMinor),0) AS ReceiptValue,
        MAX(r.CurrencyCode) AS ReceiptCurrency
      FROM dbo.TblPricingAddonReceipt r WHERE r.InvoiceID=i.InvoiceID
    ) docs
    OUTER APPLY (
      SELECT COUNT(1) AS Grants, COALESCE(SUM(e.GrantedQuantity),0) AS GrantedQuantity
      FROM dbo.TblPricingAddonEntitlement e WHERE e.OrderID=o.OrderID
    ) grants`);
  const counts = result.recordset[0];
  if (!counts || Number(counts.BadOrders) !== 0) {
    throw new Error(`Pricing add-on order/invoice/receipt integrity failure: ${counts?.BadOrders ?? "no row"}`);
  }
  const lots = await query<LotCounts>(`SELECT
    (SELECT COUNT(1) FROM dbo.TblPricingAddonEntitlement e
      WHERE e.RemainingQuantity>e.GrantedQuantity OR e.ValidFromUtc>=e.ExpiresAtUtc
        OR e.BusinessID<>(SELECT o.BusinessID FROM dbo.TblPricingAddonOrder o WHERE o.OrderID=e.OrderID)
    ) AS InvalidLots,
    (SELECT COUNT(1) FROM dbo.TblPricingAddonReplyAllocation a
      JOIN dbo.TblPricingAddonEntitlement e ON e.EntitlementID=a.EntitlementID
      WHERE a.BusinessID<>e.BusinessID OR a.Quantity<=0
    ) AS InvalidAllocations,
    (SELECT COALESCE(SUM(CONVERT(BIGINT,e.RemainingQuantity)),0)
      FROM dbo.TblPricingAddonEntitlement e WHERE e.Unit=N'ai_reply'
      AND e.ExpiresAtUtc>SYSUTCDATETIME()) AS ActiveReplies`);
  const balances = lots.recordset[0];
  if (!balances || Number(balances.InvalidLots)!==0 || Number(balances.InvalidAllocations)!==0) {
    throw new Error("Pricing V1 entitlement or reservation integrity mismatch");
  }

  console.log("[pricing-v1-production-smoke] PASS", {
    enabled: true, migrations: ["098","099","100","101"], activePlans: plans.recordset.length,
    addOnOrders: Number(counts.TotalOrders),
    approvedOrders: Number(counts.ApprovedOrders),
    paidLocalReceipts: Number(counts.PaidReceipts),
    activeReplyCredits: Number(balances.ActiveReplies),
    financialHubReconciliation: "NOT_INCLUDED",
    writeSideVerifiedBy: "isolated SQL CI",
    readOnly: true,
  });
}

main().then(() => closePool()).catch(async (error: unknown) => {
  console.error("[pricing-v1-production-smoke] FAILED",
    error instanceof Error ? error.message : "unknown");
  await closePool();
  process.exitCode = 1;
});
