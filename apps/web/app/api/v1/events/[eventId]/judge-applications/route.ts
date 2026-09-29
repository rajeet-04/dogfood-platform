import {
  applyAsJudge,
  getMyJudgeApplication,
  listJudgeApplications,
  withdrawJudgeApplication,
} from "@dogfood/applications";
import { DogfoodError } from "@dogfood/validation";
import { z } from "@dogfood/validation";

import { api, json, readJsonBody, requireApiActor, throwValidation } from "../../../../../../server/api/http";

const applySchema = z.object({
  rationale: z.string().max(2000).optional(),
});

export async function GET(request: Request, { params }: { params: Promise<{ eventId: string }> }): Promise<Response> {
  return api(request, async () => {
    const { eventId } = await params;
    const actor = await requireApiActor(request);
    const current = await getMyJudgeApplication(actor, eventId);
    if (current) {
      return json({ application: {
        id: current.id,
        eventId: current.eventId,
        userId: current.userId,
        rationale: current.rationale,
        status: current.status,
        createdAt: current.createdAt,
        decidedAt: current.decidedAt,
        attachmentName: current.attachmentName,
        attachmentSize: current.attachmentSize,
        attachmentContentType: current.attachmentContentType,
      } });
    }
    try {
      return json({ application: null, applications: await listJudgeApplications(actor, eventId) });
    } catch (err) {
      if (err instanceof DogfoodError && err.code === "FORBIDDEN") {
        return json({ application: null });
      }
      throw err;
    }
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ eventId: string }> }): Promise<Response> {
  return api(request, async () => {
    const { eventId } = await params;
    const actor = await requireApiActor(request);
    const parsed = applySchema.safeParse(await readJsonBody(request));
    if (!parsed.success) throwValidation(parsed.error.issues);
    const application = await applyAsJudge(actor, eventId, parsed.data);
    return json({ application }, { status: 201 });
  });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ eventId: string }> }): Promise<Response> {
  return api(request, async () => {
    const { eventId } = await params;
    const actor = await requireApiActor(request);
    await withdrawJudgeApplication(actor, eventId);
    return json({ withdrawn: true });
  });
}
