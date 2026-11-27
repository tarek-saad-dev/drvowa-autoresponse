import { describe,it,expect } from "vitest";
import { modeAllowsCapture,modeAllowsAi,type PrivacyModePolicy } from "@/modules/messaging/privacy-mode-policy";
const at=new Date("2026-11-27T00:00:00Z"); const later=new Date(at.getTime()+1000); const earlier=new Date(at.getTime()-1000);
const phone="201001234567";
describe("privacy modes",()=>{
 for(const mode of ["ALL","BUSINESS_ONLY","MANUAL"] as const) it(mode,()=>{
  const p:PrivacyModePolicy={mode,updatedAtUtc:at,approved:[{phone,at}]};
  expect(modeAllowsCapture(p,phone)).toBe(true);
  expect(modeAllowsCapture(p,null)).toBe(mode!=="BUSINESS_ONLY");
  expect(modeAllowsAi(p,phone,later)).toBe(true);
  expect(modeAllowsAi(p,phone,earlier)).toBe(false);
  expect(modeAllowsAi(p,"201001234568",later)).toBe(mode==="ALL");
 });
});
