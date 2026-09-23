import { z } from "zod";

import { requireApiBusiness } from "@/lib/api/auth-context";
import { handleApiError, jsonOk, parseJsonBody } from "@/lib/api/http";
import { updateProposalSelection } from "@/modules/knowledge-ai";

const patchSchema = z.object({
  selected: z.boolean().optional(),
  resolution: z
    .enum(["USE_NEW", "KEEP_EXISTING", "MANUAL"])
    .nullable()
    .optional(),
  proposedTitle: z.string().min(1).max(300).optional(),
  proposedContent: z.string().min(1).max(20_000).optional(),
});

type RouteContext = {
  params: Promise<{ proposalId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { businessId } = await requireApiBusiness();
    const { proposalId } = await context.params;
    const body = await parseJsonBody(request);
    const input = patchSchema.parse(body);
    const proposal = await updateProposalSelection({
      businessId,
      proposalId,
      selected: input.selected,
      resolution: input.resolution,
      proposedTitle: input.proposedTitle,
      proposedContent: input.proposedContent,
    });
    return jsonOk({
      proposal: {
        proposalId: proposal.proposalId,
        sequence: proposal.sequence,
        action: proposal.action,
        category: proposal.category,
        proposedTitle: proposal.proposedTitle,
        proposedContent: proposal.proposedContent,
        existingKnowledgeItemId: proposal.existingKnowledgeItemId,
        existingTitle: proposal.existingTitle,
        existingContent: proposal.existingContent,
        resolution: proposal.resolution,
        selected: proposal.selected,
        status: proposal.status,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
