import { and, db, eq, schema } from "@dogfood/db";
import { DogfoodError } from "@dogfood/validation";

import {
  api,
  getActorFromRequest,
  json,
} from "../../../../../server/api/http";
import { toEventSummary, type EventSummary } from "../route";

type EventDetail = EventSummary & {
  myRoles: string[];
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> },
): Promise<Response> {
  return api(request, async () => {
    const { eventId } = await params;

    const [event] = await db
      .select()
      .from(schema.events)
      .where(eq(schema.events.id, eventId))
      .limit(1);
    if (!event) {
      throw new DogfoodError("NOT_FOUND", "Event not found");
    }

    const actor = await getActorFromRequest(request);
    let myRoles: string[] = [];
    if (actor) {
      const memberships = await db
        .select({ role: schema.eventMemberships.role })
        .from(schema.eventMemberships)
        .where(
          and(
            eq(schema.eventMemberships.eventId, eventId),
            eq(schema.eventMemberships.userId, actor.userId),
          ),
        );
      myRoles = memberships.map((m) => m.role);
    }

    const detail: EventDetail = { ...toEventSummary(event), myRoles };
    return json({ event: detail });
  });
}