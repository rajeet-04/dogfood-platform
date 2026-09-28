import { createJudgeRecusal, listJudgeRecusals } from "@dogfood/judging";
import { z } from "@dogfood/validation";

import { api, json, readJsonBody, requireApiActor, throwValidation } from "../../../../../../server/api/http";

const recusalSchema = z.object({
  judgeId: z.string().uuid(),
  projectId: z.string().uuid(),
  reason: z.string().trim().min(1).max(1000),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> },
): Promise<Response> {
  return api(request, async () => {
    const { eventId } = await params;
    const actor = await requireApiActor(request);
    const recusals = await listJudgeRecusals(actor, eventId);
    return json({ recusals });
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> },
): Promise<Response> {
  return api(request, async () => {
    const { eventId } = await params;
    const actor = await requireApiActor(request);
    const parsed = recusalSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) throwValidation(parsed.error.issues);
    const recusal = await createJudgeRecusal(actor, eventId, parsed.data);
    return json({ recusal }, { status: 201 });
  });
}
