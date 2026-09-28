import { listPublicGallery, type GalleryFilters } from "@dogfood/submissions";
import { z } from "@dogfood/validation";

import { api, json, throwValidation } from "../../../../server/api/http";

const filtersSchema = z.object({
  q: z.string().trim().max(100).optional(),
  event: z.string().uuid().optional(),
  track: z.string().uuid().optional(),
  tag: z.string().trim().max(40).optional(),
});

function readGalleryFilters(request: Request): GalleryFilters {
  const params = new URL(request.url).searchParams;
  const parsed = filtersSchema.safeParse({
    q: params.get("q") || undefined,
    event: params.get("event") || undefined,
    track: params.get("track") || undefined,
    tag: params.get("tag") || undefined,
  });
  if (!parsed.success) throwValidation(parsed.error.issues);
  return parsed.data;
}

export async function GET(request: Request): Promise<Response> {
  return api(request, async () => json({ projects: await listPublicGallery(readGalleryFilters(request)) }));
}
