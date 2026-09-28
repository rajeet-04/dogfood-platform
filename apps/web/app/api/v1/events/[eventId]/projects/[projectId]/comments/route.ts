import { createProjectComment, listProjectComments } from "@dogfood/voting";
import { z } from "@dogfood/validation";

import { api, json, readJsonBody, requireApiActor, throwValidation } from "../../../../../../../../server/api/http";

export async function GET(request: Request, { params }: { params: Promise<{ eventId: string; projectId: string }> }): Promise<Response> {
  return api(request, async () => {
    const { eventId, projectId } = await params;
    const actor = await requireApiActor(request);
    return json({ comments: await listProjectComments(actor, eventId, projectId) });
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ eventId: string; projectId: string }> }): Promise<Response> {
  return api(request, async () => {
    const { eventId, projectId } = await params;
    const actor = await requireApiActor(request);
    const parsed = z.object({ body: z.string().trim().min(1).max(2000) }).safeParse(await readJsonBody(request));
    if (!parsed.success) throwValidation(parsed.error.issues);
    return json({ comment: await createProjectComment(actor, eventId, projectId, parsed.data.body) }, { status: 201 });
  });
}
