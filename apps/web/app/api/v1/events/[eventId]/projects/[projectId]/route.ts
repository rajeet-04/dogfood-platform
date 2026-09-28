import { reviseProject } from "@dogfood/submissions";
import { z } from "@dogfood/validation";

import { api, json, readJsonBody, requireApiActor, throwValidation } from "../../../../../../../server/api/http";

const revisionSchema = z.object({
  expectedCurrentRevisionId: z.string().uuid(),
  title: z.string().max(120),
  tagline: z.string().max(280).nullable().optional(),
  description: z.string().max(4_000),
  repositoryUrl: z.string().url().nullable().optional(),
  liveUrl: z.string().url().nullable().optional(),
  demoVideoUrl: z.string().url().nullable().optional(),
  techTags: z.array(z.string().max(40)).max(20).optional(),
  trackId: z.string().uuid().nullable().optional(),
  thumbnailAssetId: z.string().uuid().nullable().optional(),
  imageAssetIds: z.array(z.string().uuid()).max(10).optional(),
  customAnswers: z.record(z.string().uuid(), z.string().max(4_000)).optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ eventId: string; projectId: string }> },
): Promise<Response> {
  return api(request, async () => {
    const { eventId, projectId } = await params;
    const actor = await requireApiActor(request);
    const parsed = revisionSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) throwValidation(parsed.error.issues);
    const project = await reviseProject(actor, eventId, projectId, parsed.data);
    return json({ project });
  });
}
