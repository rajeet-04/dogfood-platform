import { assignJudge, assignJudges, getJudgeAssignments } from "@dogfood/judging";
import { z } from "@dogfood/validation";

import { api, json, readJsonBody, requireApiActor, throwValidation } from "../../../../../../server/api/http";

const assignmentSchema = z.object({
  judgeId: z.string().uuid(),
  projectId: z.string().uuid(),
});
const assignmentBodySchema = z.union([
  assignmentSchema,
  z.object({ assignments: z.array(assignmentSchema).min(1).max(500) }),
]);
const filterSchema = z.object({
  judgeId: z.string().uuid().optional(),
  projectId: z.string().uuid().optional(),
  trackId: z.string().uuid().optional(),
  status: z.enum(["ASSIGNED", "IN_PROGRESS", "SUBMITTED", "LOCKED"]).optional(),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> },
): Promise<Response> {
  return api(request, async () => {
    const { eventId } = await params;
    const actor = await requireApiActor(request);
    const raw = Object.fromEntries(new URL(request.url).searchParams.entries());
    const parsed = filterSchema.safeParse(raw);
    if (!parsed.success) throwValidation(parsed.error.issues);
    const assignments = await getJudgeAssignments(actor, eventId, parsed.data);
    return json({ assignments });
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> },
): Promise<Response> {
  return api(request, async () => {
    const { eventId } = await params;
    const actor = await requireApiActor(request);
    const parsed = assignmentBodySchema.safeParse(await readJsonBody(request));
    if (!parsed.success) throwValidation(parsed.error.issues);
    if ("assignments" in parsed.data) {
      const assignments = await assignJudges(actor, eventId, parsed.data.assignments);
      return json({ assignments }, { status: 201 });
    }
    const assignment = await assignJudge(actor, eventId, parsed.data);
    return json({ assignment }, { status: 201 });
  });
}
