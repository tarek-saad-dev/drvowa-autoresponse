import {describe,expect,it} from "vitest";
import {isBeforeWhatsAppReset} from "@/modules/messaging/workspace-reset-policy";
describe("WhatsApp reset watermark",()=>{
 const reset=new Date("2026-11-27T10:00:00Z");
 it("does not alter legacy workspace behavior",()=>expect(isBeforeWhatsAppReset(null,null,true)).toBe(false));
 it("rejects old, historical and unknown timestamps after explicit reset",()=>{
  expect(isBeforeWhatsAppReset(reset,new Date("2026-11-27T09:59:59Z"))).toBe(true);
  expect(isBeforeWhatsAppReset(reset,new Date("2026-11-27T10:00:01Z"),true)).toBe(true);
  expect(isBeforeWhatsAppReset(reset,null)).toBe(true);
  expect(isBeforeWhatsAppReset(reset,new Date("invalid"))).toBe(true);
  expect(isBeforeWhatsAppReset(reset,new Date("2026-11-27T10:00:01Z"))).toBe(false);
 });
});
