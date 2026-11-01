import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { previewPromoPrice } from "@/modules/pricing/public-promo";
import { PromoLanding } from "@/app/promo/[code]/promo-landing";
import { PricingCards } from "@/components/landing/pricing-cards";
import type { Plan } from "@/types/domain";

describe("public influencer promotion",()=>{
 it("shows accurate 70% discount without offering invalid discounts",()=>{
   expect(previewPromoPrice({kind:"PERCENT",value:70,baseEgp:3490}))
     .toEqual({discountedEgp:1047,discountEgp:2443});
   expect(previewPromoPrice({kind:"PERCENT",value:70,baseEgp:1490}))
     .toEqual({discountedEgp:447,discountEgp:1043});
   expect(previewPromoPrice({kind:"FIXED",value:2000,baseEgp:1490})).toBeNull();
 });
 it("personalizes a promo link and explains the actual first-subscription condition",()=>{
   const html=renderToStaticMarkup(createElement(PromoLanding,{
     code:"CREATOR70",kind:"PERCENT" as const,value:70,
     partnerName:"صانع محتوى",planCode:"PRO",
     billingInterval:"MONTHLY" as const,expiresAtUtc:null,remaining:15,
     offers:[{code:"PRO",name:"نمو",replies:3000,knowledge:400,
       monthly:3490,annual:34900,monthlyAfter:1047,annualAfter:null}],
   }));
   expect(html).toContain("CREATOR70");
   expect(html).toContain("صانع محتوى");
   expect(html).toContain("70%");
   expect(html).toContain("3,490");
   expect(html).toContain("1,047");
   expect(html).toContain("عرض");
   expect(html).toContain("على طلب اشتراك واحد");
   expect(html).toContain("/promo/CREATOR70/activate?plan=PRO&amp;interval=MONTHLY");
   expect(html).not.toContain("مضمون");
 });
 it("keeps mobile pricing as selectable, one-plan-at-a-time comparison",()=>{
   const plan=(code:string,price:number,replies:number):Plan=>({
      planId:code,code,displayName:code,currencyCode:"EGP",
      monthlyPriceAmount:price,monthlyAiReplies:replies,
      monthlyWhatsAppOutbound:1000,maxWhatsAppConnections:1,
      maxAgents:1,maxActiveKnowledgeItems:100,billingInterval:"MONTHLY",
      status:"ACTIVE",createdAtUtc:new Date(),updatedAtUtc:new Date(),
   } as Plan);
   const html=renderToStaticMarkup(createElement(PricingCards,{
     plans:[plan("FREE",0,30),plan("STARTER",1490,1000),plan("PRO",3490,3000),
       plan("BUSINESS",8490,8000)],
     annualPrices:{STARTER:14900,PRO:34900,BUSINESS:84900},
     freeTrialEnabled:true,
   }));
   expect(html).toContain('aria-label="اختار باقة لعرض تفاصيلها"');
   expect(html).toContain('aria-label="الباقة المعروضة للمقارنة"');
   expect(html).toContain('data-mobile-active="true"');
   expect(html).toContain("3,490");
 });
});
