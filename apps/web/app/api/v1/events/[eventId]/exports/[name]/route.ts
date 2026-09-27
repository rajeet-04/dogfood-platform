import { EXPORTS } from "@dogfood/exports";
import { DogfoodError } from "@dogfood/validation";

import {
  api,
  requireApiActor,
} from "../../../../../../../server/api/http";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ eventId: string; name: string }> },
): Promise<Response> {
  return api(request, async () => {
    const { eventId, name: rawName } = await params;
    const name = rawName.replace(/\.csv$/i, "");

    const actor = await requireApiActor(request);
    const builder = EXPORTS[name];
    if (!builder) {
      throw new DogfoodError("NOT_FOUND", "Unknown export");
    }

    const csv = await builder(actor, eventId);
    return new Response(csv.content, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${csv.filename}"`,
      },
    });
  });
}