import { approveJudgeApplication, rejectJudgeApplication } from "@dogfood/applications";
import { z } from "@dogfood/validation";

import { api, json, readJsonBody, requireApiActor, throwValidation } from "../../../../../../../server/api/http";

const decisionSchema = z.object({ decision: z.enum(["approve", "reject"]) });

export async function PATCH(request: Request, { params }: { params: Promise<{ eventId: string; applicationId: string }> }): Promise<Response> {
  return api(request, async () => {
    const { eventId, applicationId } = await params;
    const actor = await requireApiActor(request);
    const parsed = decisionSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) throwValidation(parsed.error.issues);
    const application = parsed.data.decision === "approve"
      ? await approveJudgeApplication(actor, eventId, applicationId)
      : await rejectJudgeApplication(actor, eventId, applicationId);
    return json({ application });
  });
}
