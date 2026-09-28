import { getPublicGalleryProject } from "@dogfood/submissions";
import { DogfoodError, z } from "@dogfood/validation";

import { api, json } from "../../../../../../../server/api/http";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ eventId: string; projectId: string }> },
): Promise<Response> {
  return api(request, async () => {
    const { eventId, projectId } = await params;
    if (!z.string().uuid().safeParse(eventId).success || !z.string().uuid().safeParse(projectId).success) {
      throw new DogfoodError("NOT_FOUND", "Project not found");
    }
    const project = await getPublicGalleryProject(projectId, eventId);
    if (!project) throw new DogfoodError("NOT_FOUND", "Project not found");
    return json({ project });
  });
}
