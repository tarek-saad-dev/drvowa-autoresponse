import { beforeEach,describe,expect,it,vi } from "vitest";
import { classifyCustomerText } from "@/modules/pulse/classifier";
import { needsCustomerFollowUp } from "@/modules/pulse/action-policy";

const db=vi.hoisted(()=>({execute:vi.fn()}));
vi.mock("@/lib/db",()=>({sql:{UniqueIdentifier:"uuid",DateTime2:"dt"}}));
import {recordHumanPulseReply,recordCustomerPulseFollowUp} from "@/modules/pulse/action-tracking";
import type { TransactionClient } from "@/lib/db";

const ctx={
 businessId:"11111111-1111-4111-8111-111111111111",
 conversationId:"22222222-2222-4222-8222-222222222222",
};
const trx={execute:db.execute,query:vi.fn()} as unknown as TransactionClient;
const at=new Date("2026-10-26T04:00:00.000Z");
describe("Pulse zero-click actions",()=>{
 beforeEach(()=>db.execute.mockReset());
 it("human response moves only older OPEN attention tasks into handling; never closes",async()=>{
   db.execute.mockResolvedValue(2);
   expect(await recordHumanPulseReply({...ctx,repliedAtUtc:at,providerMessageId:"msg-1"},trx)).toBe(2);
   const [sql,args]=db.execute.mock.calls[0] as [string,Array<{name:string;value:unknown}>];
   expect(sql).toContain("ActionState=N'IN_PROGRESS'");
   expect(sql).toContain("p.MessageAtUtc<=@at");
   expect(sql).toContain("p.ReviewStatus=N'OPEN'");
   expect(sql).not.toContain("N'RESOLVED'");
   expect(args).toEqual(expect.arrayContaining([expect.objectContaining({name:"at",value:at})]));
 });
 it("does not reopen after a generic thanks or a customer confirming resolution",async()=>{
   for(const text of ["تمام شكرا", "المشكلة اتحلت", "Thanks"]) {
     expect(await recordCustomerPulseFollowUp({...ctx,receivedAtUtc:at,text},trx)).toBe("UNCHANGED");
   }
   expect(db.execute).not.toHaveBeenCalled();
 });
 it("requeues explicit unmet customer request only after the last real human reply",async()=>{
   db.execute.mockResolvedValue(1);
   expect(await recordCustomerPulseFollowUp({...ctx,receivedAtUtc:at,text:"أنا لسه مستني الرد"},trx)).toBe("NEEDS_REPLY");
   const [sql]=db.execute.mock.calls[0] as [string];
   expect(sql).toContain("p.ActionState=N'IN_PROGRESS'");
   expect(sql).toContain("p.LastHumanReplyAtUtc<@at");
   expect(sql).toContain("ActionState=N'NEEDS_REPLY'");
 });
 it("replays and stale observations do not open a second task",async()=>{
   db.execute.mockResolvedValue(0);
   expect(await recordHumanPulseReply({...ctx,repliedAtUtc:at,providerMessageId:"same-id"},trx)).toBe(0);
   expect(await recordCustomerPulseFollowUp({...ctx,receivedAtUtc:at,text:"محتاج رد"},trx)).toBe("UNCHANGED");
 });
});
describe("Pulse rule v2 precision",()=>{
 it("rejects educational/refund terminology without a request",()=>{
   const text="صلاحية أو مسروقة، الاحتيال في الاسترجاع (refund) والاعتراضات (chargeback): استغلال العمليات المالية";
   expect(classifyCustomerText(text).some(x=>x.intent==="REFUND")).toBe(false);
   expect(classifyCustomerText("يعني ايه refund ومتى تستخدم؟").some(x=>x.intent==="REFUND")).toBe(false);
 });
 it("detects actual explicit refund requests",()=>{
   expect(classifyCustomerText("عايز استرداد المبلغ اللي دفعته").some(x=>x.intent==="REFUND")).toBe(true);
   expect(classifyCustomerText("I want a refund for my booking").some(x=>x.intent==="REFUND")).toBe(true);
 });
 it("never mistakes a negated request as escalation, but keeps complaint",()=>{
   const found=classifyCustomerText("مش محتاج حد من الادارة يكلمني، انا استنيت 20 دقيقة ومش هبطل");
   expect(found.some(x=>x.intent==="HUMAN")).toBe(false);
   expect(found.some(x=>x.intent==="COMPLAINT")).toBe(true);
   expect(classifyCustomerText("ممكن اكلم حد من الادارة او الاونر").some(x=>x.intent==="HUMAN")).toBe(true);
 });
 it("requires a new explicit unmet request to reopen a handled Pulse signal",()=>{
   expect(needsCustomerFollowUp("أنا لسه مستني تأكيد الحجز")).toBe(true);
   expect(needsCustomerFollowUp("ممكن اعرف الأسعار")).toBe(false);
   expect(needsCustomerFollowUp("تمام شكرا")).toBe(false);
   expect(needsCustomerFollowUp("المشكلة اتحلت")).toBe(false);
 });
});
