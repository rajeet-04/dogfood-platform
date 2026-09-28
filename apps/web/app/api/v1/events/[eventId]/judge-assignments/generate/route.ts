import { commitAssignmentProposal, generateAssignmentProposal } from "@dogfood/judging";
import { z } from "@dogfood/validation";

import { api, json, readJsonBody, requireApiActor, throwValidation } from "../../../../../../../server/api/http";

const generationSchema = z.object({
  strategy: z.enum(["round_robin", "balanced_by_track"]),
  reviewsPerProject: z.number().int().positive().max(100),
  judgeIds: z.array(z.string().uuid()).min(1).max(500).refine(
    (ids) => new Set(ids).size === ids.length,
    "Judge IDs must be unique",
  ),
  trackIds: z.array(z.string().uuid()).max(500).optional(),
  expectedProposal: z.array(z.object({
    judgeId: z.string().uuid(),
    projectId: z.string().uuid(),
  })).optional(),
  commit: z.boolean().default(false),
}).superRefine((input, context) => {
  if (input.commit && !input.expectedProposal) {
    context.addIssue({
      code: "custom",
      path: ["expectedProposal"],
      message: "Required when committing an assignment proposal",
    });
  }
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> },
): Promise<Response> {
  return api(request, async () => {
    const { eventId } = await params;
    const actor = await requireApiActor(request);
    const parsed = generationSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) throwValidation(parsed.error.issues);
    const { commit, ...input } = parsed.data;
    const result = commit
      ? await commitAssignmentProposal(actor, eventId, {
          ...input,
          expectedProposal: input.expectedProposal!,
        })
      : await generateAssignmentProposal(actor, eventId, input);
    return json(result);
  });
}
