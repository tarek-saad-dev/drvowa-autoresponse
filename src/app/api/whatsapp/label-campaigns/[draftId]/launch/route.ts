import { z } from "zod";
import { requireApiBusiness } from "@/lib/api/auth-context";
import { handleApiError, jsonOk, parseJsonBody } from "@/lib/api/http";
import { assertRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { requireLabelCampaignOwner } from "@/modules/messaging/label-campaign-drafts";
import {
  changeCampaignRun, launchCampaign, previewCampaignLaunch,
} from "@/modules/messaging/campaign-launch";

type Context = {params:Promise<{draftId:string}>};
const body = z.object({
  preflightId:z.string().uuid(),
  expectedEligible:z.number().int().min(1).max(60),
  expectedMessage:z.string().min(4).max(3000),
}).strict();
const actionBody = z.object({
  preflightId:z.string().uuid(),
  runId:z.string().uuid(),
  action:z.enum(["pause","resume","cancel"]),
}).strict();

export async function GET(request:Request,context:Context) {
  try {
    const {user,businessId}=await requireApiBusiness();
    await requireLabelCampaignOwner({businessId,userId:user.userId});
    const draftId=z.string().uuid().parse((await context.params).draftId);
    const preflightId=z.string().uuid().parse(new URL(request.url).searchParams.get("preflightId"));
    const preview=await previewCampaignLaunch({businessId,draftId,preflightId});
    return jsonOk({preview});
  } catch(error) {return handleApiError(error);}
}

/** Owner confirms both exact copy and exact currently eligible count. */
export async function POST(request:Request,context:Context) {
  try {
    const {user,businessId}=await requireApiBusiness();
    await requireLabelCampaignOwner({businessId,userId:user.userId});
    assertRateLimit(`campaign-launch:${businessId}`,RATE_LIMITS.labelCampaignLaunch);
    const draftId=z.string().uuid().parse((await context.params).draftId);
    const input=body.parse(await parseJsonBody(request));
    const run=await launchCampaign({
      businessId,draftId,userId:user.userId,
      preflightId:input.preflightId,expectedEligible:input.expectedEligible,
      expectedMessage:input.expectedMessage,
    });
    return jsonOk({run,scheduled:true}, {status:201});
  } catch(error) {return handleApiError(error);}
}

export async function PATCH(request:Request,context:Context) {
  try {
    const {user,businessId}=await requireApiBusiness();
    await requireLabelCampaignOwner({businessId,userId:user.userId});
    assertRateLimit(`campaign-action:${businessId}`,RATE_LIMITS.labelCampaignAction);
    const draftId=z.string().uuid().parse((await context.params).draftId);
    const input=actionBody.parse(await parseJsonBody(request));
    const run=await changeCampaignRun({businessId,draftId,...input});
    return jsonOk({run});
  } catch(error) {return handleApiError(error);}
}
