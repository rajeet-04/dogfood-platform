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
  title: z.string().max(120).optional(),
  tagline: z.string().max(280).nullable().optional(),
  description: z.string().max(4000).optional(),
  repositoryUrl: z.string().url().nullable().optional(),
  liveUrl: z.string().url().nullable().optional(),
  demoVideoUrl: z.string().url().nullable().optional(),
  techTags: z.array(z.string().max(40)).max(20).optional(),
  trackId: z.string().uuid().nullable().optional(),
  thumbnailAssetId: z.string().uuid().nullable().optional(),
  imageAssetIds: z.array(z.string().uuid()).max(10).optional(),
  customAnswers: z.record(z.string().uuid(), z.string().max(4_000)).optional(),
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

    const project = await createProject(actor, eventId, {
      ...parsed.data,
      title: parsed.data.title ?? "",
      description: parsed.data.description ?? "",
    });
    return json({ project }, { status: 201 });
  });
}
