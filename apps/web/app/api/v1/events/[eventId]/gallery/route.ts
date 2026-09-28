import { listPublicGallery } from "@dogfood/submissions";
import { z } from "@dogfood/validation";

import { api, json, throwValidation } from "../../../../../../server/api/http";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> },
): Promise<Response> {
  return api(request, async () => {
    const { eventId } = await params;
    const query = new URL(request.url).searchParams;
    const parsed = z.object({
      event: z.string().uuid(),
      q: z.string().trim().max(100).optional(),
      track: z.string().uuid().optional(),
      tag: z.string().trim().max(40).optional(),
    }).safeParse({
      event: eventId,
      q: query.get("q") || undefined,
      track: query.get("track") || undefined,
      tag: query.get("tag") || undefined,
    });
    if (!parsed.success) throwValidation(parsed.error.issues);
    return json({ projects: await listPublicGallery(parsed.data) });
  });
}
