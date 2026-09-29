import { addCriterion } from "@dogfood/judging";
import { db, eq, schema } from "@dogfood/db";
import { DogfoodError, z } from "@dogfood/validation";

import { api, json, readJsonBody, requireApiActor, throwValidation } from "../../../../../../../../server/api/http";

const criterionSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().optional(),
  weight: z.number().finite(),
  minScore: z.number().finite(),
  maxScore: z.number().finite(),
  optional: z.boolean().optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ eventId: string; rubricId: string }> }): Promise<Response> {
  return api(request, async () => {
    const { eventId, rubricId } = await params;
    const actor = await requireApiActor(request);
    const parsed = criterionSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) throwValidation(parsed.error.issues);
    const [rubric] = await db.select({ eventId: schema.rubrics.eventId }).from(schema.rubrics).where(eq(schema.rubrics.id, rubricId)).limit(1);
    if (!rubric || rubric.eventId !== eventId) {
      throw new DogfoodError("NOT_FOUND", "Rubric not found");
    }
    const criterion = await addCriterion(actor, rubricId, parsed.data);
    return json({ criterion }, { status: 201 });
  });
}
