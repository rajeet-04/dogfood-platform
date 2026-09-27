import { createProject } from "@dogfood/submissions";
import { z } from "@dogfood/validation";

import {
  api,
  json,
  readJsonBody,
  requireApiActor,
  throwValidation,
} from "../../../../../../server/api/http";

const createProjectSchema = z.object({
  teamId: z.string().min(1),
  slug: z.string().min(1).max(64).optional(),
  title: z.string().min(1).max(120),
  tagline: z.string().max(280).nullable().optional(),
  description: z.string().min(1).max(4000),
  repositoryUrl: z.string().url().nullable().optional(),
  liveUrl: z.string().url().nullable().optional(),
  demoVideoUrl: z.string().url().nullable().optional(),
  techTags: z.array(z.string().max(40)).max(20).optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> },
): Promise<Response> {
  return api(request, async () => {
    const { eventId } = await params;

    const actor = await requireApiActor(request);
    const body = await readJsonBody(request);
    const parsed = createProjectSchema.safeParse(body);
    if (!parsed.success) throwValidation(parsed.error.issues);

    const project = await createProject(actor, eventId, parsed.data);
    return json({ project }, { status: 201 });
  });
}