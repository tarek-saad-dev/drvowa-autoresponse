import { beforeEach, describe, expect, it, vi } from "vitest";
const db=vi.hoisted(()=>({query:vi.fn()}));
vi.mock("@/lib/db",()=>({query:db.query,sql:{UniqueIdentifier:"uuid",Int:"int"}}));
import { getPrivacyInventory } from "@/modules/messaging/privacy-center-service";
describe("owner privacy inventory",()=>{
 beforeEach(()=>vi.resetAllMocks());
 it("counts only the selected business and reports hidden data without writing",async()=>{
  const business="11111111-1111-4111-8111-111111111111";
  const date=new Date("2026-11-27T00:00:00Z");
  db.query.mockResolvedValueOnce({recordset:[{Messages:12,HiddenMessages:4,OlderMessages:7,OlderMedia:2,HiddenMedia:1}]})
    .mockResolvedValueOnce({recordset:[{PhoneNormalized:"201001234567",RemovedAtUtc:date}]});
  expect(await getPrivacyInventory(business,90)).toEqual({messages:12,hiddenMessages:4,olderMessages:7,olderMedia:2,hiddenMedia:1,days:90,removed:[{phone:"201001234567",removedAtUtc:date.toISOString()}]});
  for(const [statement,params] of db.query.mock.calls){
   expect(statement).toContain("BusinessID=@businessId");
   expect(params[0].value).toBe(business);
   expect(statement).not.toMatch(/\b(DELETE|UPDATE|INSERT|MERGE)\b/i);
  }
  expect(db.query.mock.calls[0][1][1].value).toBe(90);
 });
 it("handles an empty business",async()=>{
  db.query.mockResolvedValue({recordset:[]});
  expect(await getPrivacyInventory("11111111-1111-4111-8111-111111111111",30)).toMatchObject({messages:0,hiddenMessages:0,olderMessages:0,olderMedia:0,removed:[]});
 });
});
