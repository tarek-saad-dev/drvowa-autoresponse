import { describe, expect, it, vi } from "vitest";
import { classifyCustomerText } from "@/modules/pulse/classifier";
import { pulseBounds } from "@/modules/pulse/time";

describe("Pulse signals", () => {
 it("classifies Egyptian Arabic booking and pricing without claiming completion",()=>{
  const result=classifyCustomerText("عايز احجز عندكم بكرة، والحلاقة بكام؟");
  expect(result.map(x=>x.intent)).toEqual(expect.arrayContaining(["BOOKING","PRICE"]));
  expect(result.every(x=>x.actionType===null)).toBe(true);
 });
 it("escalates explicit manager complaints without changing AI state",()=>{
  const result=classifyCustomerText("محدش رد عليا، عايز اكلم المدير حالا");
  expect(result.find(x=>x.intent==="HUMAN")?.actionType).toBe("REVIEW");
  expect(result.find(x=>x.intent==="COMPLAINT")?.priority).toBe("URGENT");
 });
 it("treats purchase inquiries as opportunities, not paid conversions",()=>{
  expect(classifyCustomerText("عايز اشترك في الباقة").find(x=>x.intent==="PURCHASE")).toMatchObject({
   actionType:"OPPORTUNITY",priority:"NORMAL",
  });
 });
 it("never invents intent for ordinary thanks, unclear messages, or unsupported media",()=>{
  expect(classifyCustomerText("تمام شكرا")).toEqual([]);
  expect(classifyCustomerText("")).toEqual([]);
  expect(classifyCustomerText(null)).toEqual([]);
  expect(classifyCustomerText("🎙")).toEqual([]);
 });
 it("redacts phone numbers and links from stored evidence",()=>{
  const signal=classifyCustomerText("عايز اكلم المدير على 01012345678 https://example.com/path");
  expect(signal[0].evidence).not.toContain("01012345678");
  expect(signal[0].evidence).not.toContain("https://");
 });
 it("respects maximum number of classifications",()=>{
  expect(classifyCustomerText("عايز اكلم المدير، بكام، احجزلي، استرداد المبلغ، مكانكم فين، وبتفتحوا امتي").length).toBeLessThanOrEqual(4);
 });
});
describe("Pulse reporting timezone",()=>{
 it("uses Cairo calendar day rather than UTC midnight",()=>{
  const b=pulseBounds("today","Africa/Cairo",new Date("2026-10-25T22:30:00.000Z"));
  expect(b.start.toISOString()).toBe("2026-10-25T21:00:00.000Z");
  expect(b.end.toISOString()).toBe("2026-10-26T21:00:00.000Z");
 });
 it("handles Egyptian DST changes by calculating both local boundaries independently",()=>{
  const b=pulseBounds("month","Africa/Cairo",new Date("2026-10-26T12:00:00.000Z"));
  expect(b.start.toISOString()).toBe("2026-09-30T21:00:00.000Z");
  expect(b.end.toISOString()).toBe("2026-10-31T22:00:00.000Z");
 });
 it("does not crash on invalid configured timezone",()=>{
  expect(pulseBounds("today","broken-timezone",new Date("2026-10-26T08:00:00Z")).zone).toBe("Africa/Cairo");
 });
});
