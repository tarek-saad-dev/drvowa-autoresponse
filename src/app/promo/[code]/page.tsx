import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { listActivePlans } from "@/modules/billing/repository";
import { isPricingV1PaymentEnabled, quotePricingV1 } from "@/modules/pricing/payment-quote";
import { getPublicPromo, previewPromoPrice } from "@/modules/pricing/public-promo";
import { PromoLanding } from "./promo-landing";
export const dynamic="force-dynamic";

type Params={params:Promise<{code:string}>};

export async function generateMetadata({params}:Params):Promise<Metadata>{
 const {code}=await params;
 const promo=await getPublicPromo(code);
 return promo?{
  title:"عرض خاص | DRVO AutoResponse",
  description:"دعوة خاصة لاستخدام مساعد واتساب الذكي بسعر أقل عند الاشتراك، باستخدام كود خصم صالح.",
  robots:{index:false,follow:false},
 }: {title:"العرض غير متاح | DRVO AutoResponse",robots:{index:false,follow:false}};
}

export default async function PromoPage({params}:Params){
 const {code}=await params;
 const promo=await getPublicPromo(code);
 if(!promo)notFound();
 const plans=await listActivePlans();
 const offers=plans.filter(p=>p.status==="ACTIVE" && p.code!=="FREE" &&
   ["STARTER","PRO","BUSINESS"].includes(p.code) && p.currencyCode==="EGP" &&
   p.monthlyPriceAmount!=null && Number(p.monthlyPriceAmount)>0 &&
   (!promo.planCode||promo.planCode===p.code))
   .map(p=>{
     const monthly=Number(p.monthlyPriceAmount);
     const annual=isPricingV1PaymentEnabled() && quotePricingV1(p.code,"MONTHLY").amount===monthly
      ?quotePricingV1(p.code,"ANNUAL").amount:null;
     const monthlyAfter=promo.billingInterval==="ANNUAL"?null:
       previewPromoPrice({kind:promo.kind,value:promo.value,baseEgp:monthly})?.discountedEgp??null;
     const annualAfter=promo.billingInterval==="MONTHLY"||annual==null?null:
       previewPromoPrice({kind:promo.kind,value:promo.value,baseEgp:annual})?.discountedEgp??null;
     return {code:p.code,name:p.displayName,replies:Number(p.monthlyAiReplies??0),
       knowledge:Number(p.maxActiveKnowledgeItems??0),monthly,annual,monthlyAfter,annualAfter};
   }).filter(p=>p.monthlyAfter!==null||p.annualAfter!==null);
 if(offers.length===0)notFound();
 return <PromoLanding code={promo.code} kind={promo.kind} value={promo.value}
   partnerName={promo.partnerDisplayName} planCode={promo.planCode}
   billingInterval={promo.billingInterval}
   expiresAtUtc={promo.expiresAtUtc?.toISOString()??null}
   remaining={promo.remaining} offers={offers}/>;
}
