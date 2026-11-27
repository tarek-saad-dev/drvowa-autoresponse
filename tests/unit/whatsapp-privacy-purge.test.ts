import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const db=vi.hoisted(()=>({query:vi.fn(),trx:vi.fn()}));
vi.mock("@/lib/db",()=>({query:db.query,withTransaction:db.trx,sql:{UniqueIdentifier:"uuid",Int:"int",VarChar:(n:number)=>"varchar:"+n}}));
import {previewContentPurge,purgeContentBatch} from "@/modules/messaging/privacy-purge-service";
const business="11111111-1111-4111-8111-111111111111";
describe("privacy purge safety",()=>{
 beforeEach(()=>{vi.resetAllMocks();vi.stubEnv("DRVO_PRIVACY_OFFLINE_MAINTENANCE","false");});
 afterEach(()=>vi.unstubAllEnvs());
 it("refuses any write unless offline maintenance is explicitly enabled",async()=>{
  await expect(purgeContentBatch(business,{kind:"removed"})).rejects.toThrow("OFFLINE_MAINTENANCE_REQUIRED");
  expect(db.trx).not.toHaveBeenCalled();
 });
 it("previews tenant-scoped removed records without writing",async()=>{
  db.query.mockResolvedValue({recordset:[{Candidates:5,Eligible:3}]});
  expect(await previewContentPurge(business,{kind:"removed"})).toEqual({candidates:5,eligible:3});
  expect(db.query.mock.calls[0][0]).toContain("TblWhatsAppRemovedContact");
  expect(db.query.mock.calls[0][1][0].value).toBe(business);
  expect(db.trx).not.toHaveBeenCalled();
 });
 it("rejects unsupported retention periods",async()=>{
  await expect(previewContentPurge(business,{kind:"retention",days:1})).rejects.toThrow("INVALID_RETENTION_DAYS");
  expect(db.query).not.toHaveBeenCalled();
 });
 it("selects bounded rows and writes content purge transaction with scope",async()=>{
  vi.stubEnv("DRVO_PRIVACY_OFFLINE_MAINTENANCE","true");
  const query=vi.fn().mockResolvedValue({recordset:[{Purged:2}]});
  db.trx.mockImplementation(async(fn)=>fn({query}));
  expect(await purgeContentBatch(business,{kind:"retention",days:90})).toBe(2);
  const [statement,params]=query.mock.calls[0];
  expect(statement).toContain("TOP(100)");
  expect(statement).toContain("m.BusinessID=@businessId");
  expect(statement).toContain("PrivacyPurgedAtUtc=SYSUTCDATETIME()");
  expect(statement).toContain("TblWhatsAppMediaPurge");
  expect(statement).not.toMatch(/DELETE\s+(FROM\s+)?dbo\.TblMessage/i);
  expect(params[1].value).toBe(90);
 });
});
