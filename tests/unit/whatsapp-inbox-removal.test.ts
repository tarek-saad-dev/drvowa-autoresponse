import { beforeEach, describe, expect, it, vi } from "vitest";
const db=vi.hoisted(()=>({query:vi.fn(),execute:vi.fn()}));
vi.mock("@/lib/db",()=>({sql:{UniqueIdentifier:"uuid",VarChar:(n:number)=>"varchar:"+n},withTransaction:async(fn:(trx:unknown)=>Promise<unknown>)=>fn(db)}));
import { removeInboxContacts } from "@/modules/messaging/conversation-privacy-service";
const business="11111111-1111-4111-8111-111111111111";
const id="22222222-2222-4222-8222-222222222222";
const other="33333333-3333-4333-8333-333333333333";
describe("inbox removal",()=>{
 beforeEach(()=>{vi.resetAllMocks();db.execute.mockResolvedValue(1);});
 it("inserts a persistent block and returns all matching conversation IDs",async()=>{
  db.query.mockResolvedValueOnce({recordset:[{ConversationID:id,PhoneNormalized:"201001234567"}]})
    .mockResolvedValueOnce({recordset:[]}).mockResolvedValueOnce({recordset:[{ConversationID:id},{ConversationID:other}]});
  expect(await removeInboxContacts(business,[id,id])).toEqual({removedIds:[id,other]});
  expect(db.execute).toHaveBeenCalledTimes(1);
  expect(db.execute.mock.calls[0][0]).toContain("TblWhatsAppRemovedContact");
  expect(db.query.mock.calls[0][1][0].value).toBe(business);
 });
 it("rejects a missing or cross-tenant selection without writing",async()=>{
  db.query.mockResolvedValueOnce({recordset:[]});
  await expect(removeInboxContacts(business,[id])).rejects.toThrow();
  expect(db.execute).not.toHaveBeenCalled();
 });
 it("rejects unresolved identity without writing",async()=>{
  db.query.mockResolvedValueOnce({recordset:[{ConversationID:id,PhoneNormalized:null}]});
  await expect(removeInboxContacts(business,[id])).rejects.toThrow();
  expect(db.execute).not.toHaveBeenCalled();
 });
});
