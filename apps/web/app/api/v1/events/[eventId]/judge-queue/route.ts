import { getJudgeQueue } from "@dogfood/judging";

import {
  api,
  json,
  requireApiActor,
} from "../../../../../../server/api/http";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> },
): Promise<Response> {
  return api(request, async () => {
    const { eventId } = await params;

    const actor = await requireApiActor(request);
    const items = await getJudgeQueue(actor, eventId);
    return json({ items });
  });
}