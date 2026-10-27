import { describe, expect, it } from "vitest";
import { evaluateFreeTrial } from "@/modules/pricing/free-trial-policy";
describe("V1 trial lifetime and deadline", () => {
 it("uses lifetime count rather than monthly count",()=>{
  const start=new Date("2026-10-01T00:00:00Z");
  expect(evaluateFreeTrial(start,new Date("2026-10-02T00:00:00Z"),29).remaining).toBe(1);
  expect(evaluateFreeTrial(start,new Date("2026-10-02T00:00:00Z"),30).allowed).toBe(false);
  expect(evaluateFreeTrial(start,new Date("2026-10-08T00:00:00Z"),0).expired).toBe(true);
 });
});
