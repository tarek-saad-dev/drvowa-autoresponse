import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
describe("pricing V1 additive SQL contract", () => {
  const sql = readFileSync(resolve(process.cwd(), "db/migrations/090_pricing_credit_wallet.sql"), "utf8");
  it("is isolated from legacy billing tables", () => {
    expect(sql).not.toMatch(/\\b(?:UPDATE|DELETE FROM)\\s+(?:dbo\\.)?TblSubscription\\b/i);
    expect(sql).toContain("TblPricingCreditWallet");
    expect(sql).toContain("TblPricingCreditEvent");
  });
  it("locks wallet, deduplicates charges and blocks negative balances", () => {
    expect(sql).toContain("WITH (UPDLOCK, HOLDLOCK)");
    expect(sql).toContain("UNIQUE (BusinessID, IdempotencyKey)");
    expect(sql).toContain("CHECK (AvailableReplies >= 0)");
    expect(sql).toContain("N'INSUFFICIENT'");
    expect(sql).toContain("N'DUPLICATE'");
  });
});
