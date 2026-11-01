import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
describe("pricing grant / reversal SQL safety contract", () => {
 const sql=readFileSync(resolve(process.cwd(),"db/migrations/091_pricing_credit_settlement.sql"),"utf8");
 it("has atomic grants, stable uniqueness and tenant locks",()=>{
  expect(sql).toContain("PricingV1GrantReplies");
  expect(sql).toContain("WITH (UPDLOCK, HOLDLOCK)");
  expect(sql).toContain("IdempotencyKey=@IdempotencyKey");
  expect(sql).toContain("Conflicting pricing grant key");
 });
 it("only reverses real consumption, one time per event",()=>{
  expect(sql).toContain("PricingV1ReverseFailedReply");
  expect(sql).toContain("EventKind=N'CONSUME'");
  expect(sql).toContain("reverse:");
  expect(sql).toContain("N'NO_CONSUMPTION'");
 });
 it("does not rewrite any old subscription or plan data",()=>{
  expect(sql).not.toMatch(/\\b(?:UPDATE|DELETE FROM)\\s+(?:dbo\\.)?(?:TblSubscription|TblPlan)\\b/i);
 });
});
