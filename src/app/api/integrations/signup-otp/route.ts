import { z } from "zod";
import { NextResponse } from "next/server";
import { requireApiBusiness } from "@/lib/api/auth-context";
import { handleApiError, parseJsonBody } from "@/lib/api/http";
import { requireBusinessRole } from "@/lib/tenancy/require-role";
import { signupOtpKeyStatus, rotateSignupOtpKey, revokeSignupOtpKey } from "@/modules/integrations/signup-otp-key";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const reply=(body:object,status=200)=>NextResponse.json(body,{status,headers:{"Cache-Control":"no-store"}});
async function authorizedBusiness(){
  const {businessId,user}=await requireApiBusiness();
  await requireBusinessRole(user.userId,businessId,["OWNER","ADMIN"]);
  return businessId;
}
export async function GET(){
  try{return reply({ok:true,...await signupOtpKeyStatus(await authorizedBusiness())});}
  catch(error){const response=handleApiError(error);response.headers.set("Cache-Control","no-store");return response;}
}
export async function POST(request:Request){
  try{
    const businessId=await authorizedBusiness();
    const site=request.headers.get("sec-fetch-site");
    if((site && site!=="same-origin" && site!=="none")||!request.headers.get("content-type")?.toLowerCase().startsWith("application/json"))return reply({error:"طلب غير صالح."},415);
    const body=z.object({action:z.enum(["rotate","revoke"])}).strict().parse(await parseJsonBody(request));
    if(body.action==="revoke"){await revokeSignupOtpKey(businessId);return reply({ok:true,active:false});}
    const apiKey=await rotateSignupOtpKey(businessId);
    return reply({ok:true,active:true,apiKey});
  }catch(error){const response=handleApiError(error);response.headers.set("Cache-Control","no-store");return response;}
}
