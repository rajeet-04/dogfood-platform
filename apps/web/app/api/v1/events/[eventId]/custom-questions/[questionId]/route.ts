import { listCustomQuestions, removeCustomQuestion, updateCustomQuestion } from "@dogfood/events";
import { z } from "@dogfood/validation";

import { api, json, readJsonBody, requireApiActor, throwValidation } from "../../../../../../../server/api/http";

const questionSchema = z.object({
  prompt: z.string().trim().min(1).max(300),
  required: z.boolean(),
  visibility: z.enum(["PUBLIC", "ORGANIZER_ONLY"]),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ eventId: string; questionId: string }> }): Promise<Response> {
  return api(request, async () => {
    const { eventId, questionId } = await params;
    const actor = await requireApiActor(request);
    const parsed = questionSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) throwValidation(parsed.error.issues);
    await updateCustomQuestion(actor, eventId, questionId, parsed.data);
    const questions = await listCustomQuestions(actor, eventId);
    return json({ question: questions.find((question) => question.id === questionId) });
  });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ eventId: string; questionId: string }> }): Promise<Response> {
  return api(request, async () => {
    const { eventId, questionId } = await params;
    const actor = await requireApiActor(request);
    await removeCustomQuestion(actor, eventId, questionId);
    return json({ deleted: true });
  });
}
