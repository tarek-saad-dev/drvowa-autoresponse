import { describe,expect,it } from "vitest";
import { evaluatePulseRules } from "@/modules/pulse/quality";
import { redactPulseInput,validatePulseAssessment,isPulseDisagreement } from "@/modules/pulse/intelligence";

describe("Pulse Intelligence safety",()=>{
 it("refuses invented, ungrounded model evidence",()=>{
  expect(validatePulseAssessment({intent:"COMPLAINT",confidence:99,evidence:"customer threatened to sue"},"عايز احجز بكرة")).toBeNull();
 });
 it("rejects low confidence assessments",()=>{
  expect(validatePulseAssessment({intent:"COMPLAINT",confidence:30,evidence:"محتاج مدير"},"محتاج مدير")).toBeNull();
 });
 it("accepts short verifiable evidence",()=>{
  expect(validatePulseAssessment({intent:"COMPLAINT",confidence:90,evidence:"التأخير"},
    "متضايق من التأخير")).toMatchObject({intent:"COMPLAINT"});
 });
 it("masks personal contact and URLs before model calls",()=>{
  const text=redactPulseInput("عايز احجز رن علي 01012345678 او me@example.com و https://example.com");
  expect(text).not.toContain("01012345678");
  expect(text).not.toContain("me@example.com");
  expect(text).not.toContain("https://example.com");
 });
 it("does not interpret OTHER as model disagreement",()=>{
  expect(isPulseDisagreement("BOOKING",{intent:"OTHER",confidence:80,evidence:"حجز"})).toBeNull();
 });
});
describe("rule classification benchmark",()=>{
 it("exports inspectable precision, recall and individual errors",()=>{
  const report=evaluatePulseRules([
   {text:"عايز احجز عندكم",intent:"BOOKING"},
   {text:"عايز اشترك",intent:"PURCHASE"},
   {text:"شكرا جدا",intent:null},
   {text:"ده ايه؟",intent:null},
  ]);
  expect(report.total).toBe(4);
  expect(report.accuracy).toBeGreaterThan(0.5);
  expect(report.mistakes).toBeInstanceOf(Array);
 });
});
