import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { closePool, getDbConfig, query, sql } from "@/lib/db";
import { signup } from "@/modules/auth/service";
import { completeOnboarding } from "@/modules/onboarding/service";
import { submitManualPaymentRequest, approveManualPayment } from "@/modules/billing/manual-payment-service";
import { reserveQuota, releaseQuotaReservation, getEntitlementSnapshot } from "@/modules/billing/entitlements";
import { USAGE_EVENT_AI_REPLY } from "@/modules/billing/period";
import { getReplyAddonBalance } from "@/modules/pricing/addon-balance";
import { createAddonTransferDraft, submitAddonTransfer, reviewAddonTransfer } from "@/modules/pricing/addon-transfer-service";

let configured = false;
try { getDbConfig(); configured = true; } catch { /* no database */ }
const isolated = process.env.DRVO_TEST_ISOLATED_DB === "1" &&
 /(?:test|isolated)/i.test(process.env.DB_NAME ?? "");

describe.runIf(configured && isolated)("pricing V1 add-on SQL lifecycle", () => {
 afterAll(async () => { await closePool(); });
 it("approves once, consumes earliest lot once, restores on failed reply and ignores expired credit", async () => {
  process.env.MANUAL_INSTAPAY_ENABLED="1";
  process.env.DRVO_PRICING_V1_ADDON_DRAFTS="true";
  process.env.DRVO_PRICING_V1_ADDON_CONSUMPTION="true";
  const suffix=randomUUID().slice(0,8);
  const signed=await signup({fullName:"Addon Test",email:`addon_${suffix}@example.com`,password:"TestAddon!23456"});
  const userId=signed.user.userId;
  const onboard=await completeOnboarding({
   userId,business:{name:`Addon ${suffix}`,category:"عام",countryCode:"SA",locale:"ar-SA",timezone:"Asia/Riyadh"},
   location:null,agent:{name:"Assistant",roleTitle:"Agent",language:"ar",dialect:null,tone:"مهني",instructions:null},
   knowledgeItems:[{category:"ABOUT",title:"About",content:"Test"}],
  });
  const businessId=onboard.business.businessId;
  const payment=await submitManualPaymentRequest({businessId,userId,planCode:"PRO",payerName:"Addon test payer"});
  await approveManualPayment({paymentRequestId:payment.paymentRequestId,reviewerUserId:userId});
  const key=`addon-${randomUUID()}`;
  const orderId=await createAddonTransferDraft({businessId,userId,addonCode:"replies_250",idempotencyKey:key});
  expect(await createAddonTransferDraft({businessId,userId,addonCode:"replies_250",idempotencyKey:key})).toBe(orderId);
  expect(await submitAddonTransfer({businessId,orderId,payerName:"Sender",transferReference:"INSTA-TEST"})).toBe("PENDING");
  expect(await reviewAddonTransfer({orderId,reviewerUserId:userId,decision:"APPROVED"})).toBe("APPROVED");
  expect(await reviewAddonTransfer({orderId,reviewerUserId:userId,decision:"APPROVED"})).toBe("APPROVED");
  const granted=await query<{Total:number}>(`SELECT COUNT(*) AS Total FROM dbo.TblPricingAddonEntitlement WHERE OrderID=@id`,
   [{name:"id",type:sql.UniqueIdentifier,value:orderId}]);
  expect(granted.recordset[0].Total).toBe(1);
  expect((await getReplyAddonBalance(businessId)).availableReplies).toBe(250);
  // The existing billing plan table can differ from the draft V1 catalog.
  const active = await getEntitlementSnapshot(businessId);
  const baseLimit = active.plan?.monthlyAiReplies;
  expect(baseLimit).toBeGreaterThan(0);
  const reservationKey=`addon-res-${randomUUID()}`;
  await reserveQuota({businessId,eventType:USAGE_EVENT_AI_REPLY,reservationKey:`seed-${randomUUID()}`});
  await query(`UPDATE dbo.TblUsagePeriodCounter SET Quantity=@limit
    WHERE BusinessID=@b AND EventType=@event`,
   [{name:"limit",type:sql.Int,value:baseLimit},
    {name:"b",type:sql.UniqueIdentifier,value:businessId},
    {name:"event",type:sql.NVarChar(64),value:USAGE_EVENT_AI_REPLY}]);
  const first=await reserveQuota({businessId,eventType:USAGE_EVENT_AI_REPLY,reservationKey});
  const repeated=await reserveQuota({businessId,eventType:USAGE_EVENT_AI_REPLY,reservationKey});
  expect(repeated.reservationId).toBe(first.reservationId);
  expect(repeated.idempotent).toBe(true);
  expect((await getReplyAddonBalance(businessId)).availableReplies).toBe(249);
  await releaseQuotaReservation({businessId,eventType:USAGE_EVENT_AI_REPLY,reservationKey});
  await releaseQuotaReservation({businessId,eventType:USAGE_EVENT_AI_REPLY,reservationKey});
  expect((await getReplyAddonBalance(businessId)).availableReplies).toBe(250);
  const allocation=await query<{State:string}>(`SELECT State FROM dbo.TblPricingAddonReplyAllocation
    WHERE BusinessID=@b AND ReservationKey=@k`,
   [{name:"b",type:sql.UniqueIdentifier,value:businessId},{name:"k",type:sql.NVarChar(200),value:reservationKey}]);
  expect(allocation.recordset[0].State).toBe("RELEASED");
  // Concurrent requests must allocate one unit per unique reservation key.
  const concurrentKeys=Array.from({length:8},()=>`parallel-${randomUUID()}`);
  const concurrent=await Promise.all(concurrentKeys.map(reservationKey=>
    reserveQuota({businessId,eventType:USAGE_EVENT_AI_REPLY,reservationKey})));
  expect(new Set(concurrent.map(item=>item.reservationId)).size).toBe(8);
  expect((await getReplyAddonBalance(businessId)).availableReplies).toBe(242);
  const deduped=await Promise.all(concurrentKeys.map(reservationKey=>
    reserveQuota({businessId,eventType:USAGE_EVENT_AI_REPLY,reservationKey})));
  expect(deduped.every(item=>item.idempotent)).toBe(true);
  expect((await getReplyAddonBalance(businessId)).availableReplies).toBe(242);
  await Promise.all(concurrentKeys.map(reservationKey=>
    releaseQuotaReservation({businessId,eventType:USAGE_EVENT_AI_REPLY,reservationKey})));
  expect((await getReplyAddonBalance(businessId)).availableReplies).toBe(250);
  await query(`UPDATE dbo.TblPricingAddonEntitlement SET ExpiresAtUtc=DATEADD(SECOND,-1,SYSUTCDATETIME())
   WHERE OrderID=@id`,[{name:"id",type:sql.UniqueIdentifier,value:orderId}]);
  expect((await getReplyAddonBalance(businessId)).availableReplies).toBe(0);
  await expect(reserveQuota({businessId,eventType:USAGE_EVENT_AI_REPLY,reservationKey:`expired-${randomUUID()}`})).rejects.toThrow();
 });
});
