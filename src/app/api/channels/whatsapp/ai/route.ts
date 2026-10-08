import { z } from "zod";

import { requireApiBusiness } from "@/lib/api/auth-context";
import { handleApiError, jsonOk, parseJsonBody } from "@/lib/api/http";
import {
  getWhatsAppAiSetting,
  listActiveAgentsForAi,
  upsertWhatsAppAiSetting,
} from "@/modules/ai";
import { HUMAN_TAKEOVER_RESUME_POLICIES } from "@/modules/ai/safety-policy";

export async function GET() {
  try {
    const { businessId } = await requireApiBusiness();
    const [setting, agents] = await Promise.all([
      getWhatsAppAiSetting({ businessId }),
      listActiveAgentsForAi({ businessId }),
    ]);
    return jsonOk({
      setting: setting
        ? {
            channelAiSettingId: setting.channelAiSettingId,
            channelConnectionId: setting.channelConnectionId,
            agentId: setting.agentId,
            autoReplyEnabled: setting.autoReplyEnabled,
            enabledAtUtc: setting.enabledAtUtc,
            debounceMs: setting.debounceMs,
            humanTakeoverResumePolicy: setting.humanTakeoverResumePolicy,
          }
        : null,
      agents: agents.map((a) => ({
        agentId: a.agentId,
        name: a.name,
        roleTitle: a.roleTitle,
        isActive: a.isActive,
      })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

const patchSchema = z.object({
  agentId: z.string().uuid(),
  autoReplyEnabled: z.boolean(),
  debounceMs: z.number().int().min(0).max(10_000).optional(),
  humanTakeoverResumePolicy: z.enum(HUMAN_TAKEOVER_RESUME_POLICIES).optional(),
});

export async function PATCH(request: Request) {
  try {
    const { businessId } = await requireApiBusiness();
    const body = await parseJsonBody(request);
    const parsed = patchSchema.parse(body);
    const setting = await upsertWhatsAppAiSetting({
      businessId,
      agentId: parsed.agentId,
      autoReplyEnabled: parsed.autoReplyEnabled,
      debounceMs: parsed.debounceMs,
      humanTakeoverResumePolicy: parsed.humanTakeoverResumePolicy,
    });
    return jsonOk({
      setting: {
        channelAiSettingId: setting.channelAiSettingId,
        channelConnectionId: setting.channelConnectionId,
        agentId: setting.agentId,
        autoReplyEnabled: setting.autoReplyEnabled,
        enabledAtUtc: setting.enabledAtUtc,
        debounceMs: setting.debounceMs,
        humanTakeoverResumePolicy: setting.humanTakeoverResumePolicy,
      },
      warning: setting.autoReplyEnabled
        ? "سيتم الرد تلقائيًا على الرسائل الجديدة فقط."
        : null,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
