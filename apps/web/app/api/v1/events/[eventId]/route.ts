import { and, db, eq, schema } from "@dogfood/db";
import { updateEventDetails } from "@dogfood/events";
import { DogfoodError, z } from "@dogfood/validation";

import {
  api,
  getActorFromRequest,
  json,
  readJsonBody,
  requireApiActor,
  throwValidation,
} from "../../../../../server/api/http";
import { toEventSummary, type EventSummary } from "../route";

type EventDetail = EventSummary & {
  myRoles: string[];
  registrationOpensAt: string | null;
  registrationClosesAt: string | null;
};

const eventDetailsSchema = z.object({
  description: z.string().max(5000).nullable(),
  websiteUrl: z.string().max(500).nullable(),
  prizeInfo: z.string().max(2000).nullable(),
  timeline: z.string().max(2000).nullable(),
  schedule: z.string().max(2000).nullable(),
  rules: z.string().max(5000).nullable(),
  maxTeamSize: z.number().int().min(2).max(100).nullable(),
});

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

    const detail: EventDetail = {
      ...toEventSummary(event),
      registrationOpensAt: event.registrationOpensAt?.toISOString() ?? null,
      registrationClosesAt: event.registrationClosesAt?.toISOString() ?? null,
      myRoles,
    };
    return json({ event: detail });
  });
}

function toEventSettings(row: Awaited<ReturnType<typeof updateEventDetails>>) {
  return {
    ...toEventSummary(row),
    websiteUrl: row.websiteUrl,
    prizeInfo: row.prizeInfo,
    timeline: row.timeline,
    schedule: row.schedule,
    rules: row.rules,
    maxTeamSize: row.maxTeamSize,
  };
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> },
): Promise<Response> {
  return api(request, async () => {
    const { eventId } = await params;
    const actor = await requireApiActor(request);
    const parsed = eventDetailsSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) throwValidation(parsed.error.issues);
    const event = await updateEventDetails(actor, eventId, parsed.data);
    return json({ event: toEventSettings(event) });
  });
}
