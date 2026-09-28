import { addCustomQuestion, listCustomQuestions } from "@dogfood/events";
import { z } from "@dogfood/validation";

import { api, json, readJsonBody, requireApiActor, throwValidation } from "../../../../../../server/api/http";

const questionSchema = z.object({
  prompt: z.string().trim().min(1).max(300),
  required: z.boolean().default(false),
  visibility: z.enum(["PUBLIC", "ORGANIZER_ONLY"]).optional(),
});

export async function GET(request: Request, { params }: { params: Promise<{ eventId: string }> }): Promise<Response> {
  return api(request, async () => {
    const { eventId } = await params;
    const actor = await requireApiActor(request);
    return json({ questions: await listCustomQuestions(actor, eventId) });
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ eventId: string }> }): Promise<Response> {
  return api(request, async () => {
    const { eventId } = await params;
    const actor = await requireApiActor(request);
    const parsed = questionSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) throwValidation(parsed.error.issues);
    const question = await addCustomQuestion(actor, eventId, parsed.data);
    return json({ question }, { status: 201 });
  });
}
