import { NextResponse } from "next/server";
import { AuthError } from "@/lib/tenancy/errors";
import { requireAuthenticatedUser } from "@/lib/tenancy/require-user";
import { listBusinessesForUser } from "@/modules/businesses/service";
import { getPublicPromo, previewPromoPrice } from "@/modules/pricing/public-promo";
import { listActivePlans } from "@/modules/billing/repository";
import { isPricingV1PaymentEnabled, quotePricingV1 } from "@/modules/pricing/payment-quote";

export const dynamic="force-dynamic";

/** A real campaign landing link activates a short-lived first-party HTTP-only
 * attribution cookie. No user or payment records are created by following it. */
export async function GET(request:Request,{params}:{params:Promise<{code:string}>}){
 const {code}=await params;
 const promo=await getPublicPromo(code);
 if(!promo)return new Response("العرض غير متاح أو انتهت صلاحيته",{status:404});
 const url=new URL(request.url);
 const plan=url.searchParams.get("plan")?.toUpperCase()??promo.planCode??"PRO";
 const interval=url.searchParams.get("interval")?.toUpperCase()??promo.billingInterval??"MONTHLY";
 if(!["STARTER","PRO","BUSINESS"].includes(plan) ||
   !["MONTHLY","ANNUAL"].includes(interval) ||
   (promo.planCode&&promo.planCode!==plan) ||
   (promo.billingInterval&&promo.billingInterval!==interval)){
   return new Response("الباقة أو المدة غير صالحة لهذا الكود",{status:400});
 }
 const available=(await listActivePlans()).find(p=>p.code===plan && p.status==="ACTIVE" &&
   p.currencyCode==="EGP" && p.monthlyPriceAmount!=null && Number(p.monthlyPriceAmount)>0);
 if(!available)return new Response("الباقة غير متاحة حاليًا",{status:404});
 const base=interval==="ANNUAL"
   ?isPricingV1PaymentEnabled()&&quotePricingV1(plan,"MONTHLY").amount===Number(available.monthlyPriceAmount)
     ?quotePricingV1(plan,"ANNUAL").amount:null
   :Number(available.monthlyPriceAmount);
 if(base===null || !previewPromoPrice({kind:promo.kind,value:promo.value,baseEgp:base}))
   return new Response("الكود لا ينطبق على هذا الاشتراك",{status:400});

 let destination="/signup";
 try{
   const user=await requireAuthenticatedUser();
   const businesses=await listBusinessesForUser(user.userId);
   destination=businesses.length?"/dashboard/billing":"/choose-plan";
 }catch(error){if(!(error instanceof AuthError))throw error;}
 const response=NextResponse.redirect(new URL(destination,request.url));
 const maxAge=Math.max(1,Math.min(14*24*60*60,
    promo.expiresAtUtc?Math.floor((new Date(promo.expiresAtUtc).getTime()-Date.now())/1000):14*24*60*60));
 for(const [name,value] of [
   ["drvo_promo_code",promo.code],
   ["drvo_promo_plan",plan],
   ["drvo_promo_interval",interval],
 ]){
   response.cookies.set(name,value,{
     httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",
     path:"/",maxAge,
   });
 }
 return response;
}
