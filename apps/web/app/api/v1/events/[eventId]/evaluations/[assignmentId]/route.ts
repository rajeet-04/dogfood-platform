import {
  getEvaluation,
  saveEvaluationDraft,
  submitEvaluation,
} from "@dogfood/judging";
import { z } from "@dogfood/validation";

import {
  api,
  json,
  readJsonBody,
  requireApiActor,
  throwValidation,
} from "../../../../../../../server/api/http";

const evaluationScoreSchema = z.object({
  criterionId: z.string().min(1),
  score: z.number(),
  comment: z.string().nullable().optional(),
});

const evaluationBodySchema = z.object({
  scores: z.array(evaluationScoreSchema).max(200).optional(),
  overallComment: z.string().max(2000).nullable().optional(),
});

async function resolveParams(
  params: Promise<{ eventId: string; assignmentId: string }>,
): Promise<{ eventId: string; assignmentId: string }> {
  return params;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ eventId: string; assignmentId: string }> },
): Promise<Response> {
  return api(request, async () => {
    const { eventId, assignmentId } = await resolveParams(params);

    const actor = await requireApiActor(request);
    const evaluation = await getEvaluation(actor, eventId, assignmentId);
    return json({ evaluation });
  });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ eventId: string; assignmentId: string }> },
): Promise<Response> {
  return api(request, async () => {
    const { eventId, assignmentId } = await resolveParams(params);

    const actor = await requireApiActor(request);
    const body = await readJsonBody(request);
    const parsed = evaluationBodySchema.safeParse(body);
    if (!parsed.success) throwValidation(parsed.error.issues);

    const evaluation = await saveEvaluationDraft(actor, eventId, assignmentId, parsed.data);
    return json({ evaluation });
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ eventId: string; assignmentId: string }> },
): Promise<Response> {
  return api(request, async () => {
    const { eventId, assignmentId } = await resolveParams(params);

    const actor = await requireApiActor(request);
    const body = await readJsonBody(request);
    const parsed = evaluationBodySchema.safeParse(body);
    if (!parsed.success) throwValidation(parsed.error.issues);

    const evaluation = await submitEvaluation(actor, eventId, assignmentId, parsed.data);
    return json({ evaluation });
  });
}