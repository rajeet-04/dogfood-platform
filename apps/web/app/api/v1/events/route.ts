import { and, db, desc, eq, schema, sql } from "@dogfood/db";
import type { EventState } from "@dogfood/db";
import { createEvent, type EventRow } from "@dogfood/events";
import { z } from "@dogfood/validation";

import {
  api,
  json,
  readJsonBody,
  requireApiActor,
  throwValidation,
} from "../../../../server/api/http";

export type EventSummary = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  timezone: string;
  state: string;
  createdBy: string;
  createdAt: string;
};

export function toEventSummary(row: EventRow): EventSummary {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    timezone: row.timezone,
    state: row.state,
    createdBy: row.createdBy,
    createdAt: new Date(row.createdAt).toISOString(),
  };
}

const dateField = z.string().datetime().nullable().optional();

const createEventSchema = z.object({
  slug: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9-]+$/, "slug must be lowercase letters, numbers, or dashes"),
  name: z.string().min(1).max(120),
  description: z.string().max(2000).nullable().optional(),
  timezone: z.string().min(1).max(64),
  registrationOpensAt: dateField,
  registrationClosesAt: dateField,
  submissionOpensAt: dateField,
  submissionClosesAt: dateField,
  judgingOpensAt: dateField,
  judgingClosesAt: dateField,
});

function toDate(value: string | null | undefined): Date | null {
  return value ? new Date(value) : null;
}

export async function GET(request: Request): Promise<Response> {
  return api(request, async () => {
    const url = new URL(request.url);
    const q = url.searchParams.get("q");
    const state = url.searchParams.get("state");

    const conditions = [];
    if (q) conditions.push(sql`${schema.events.name} ilike ${`%${q}%`}`);
    if (state) conditions.push(eq(schema.events.state, state as EventState));

    const rows = await db
      .select()
      .from(schema.events)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(schema.events.createdAt))
      .limit(50);

    return json({ events: rows.map(toEventSummary) });
  });
}

export async function POST(request: Request): Promise<Response> {
  return api(request, async () => {
    const actor = await requireApiActor(request);
    const body = await readJsonBody(request);
    const parsed = createEventSchema.safeParse(body);
    if (!parsed.success) throwValidation(parsed.error.issues);

    const input = parsed.data;
    const event = await createEvent(actor, {
      slug: input.slug,
      name: input.name,
      description: input.description,
      timezone: input.timezone,
      registrationOpensAt: toDate(input.registrationOpensAt),
      registrationClosesAt: toDate(input.registrationClosesAt),
      submissionOpensAt: toDate(input.submissionOpensAt),
      submissionClosesAt: toDate(input.submissionClosesAt),
      judgingOpensAt: toDate(input.judgingOpensAt),
      judgingClosesAt: toDate(input.judgingClosesAt),
    });

    return json({ event: toEventSummary(event) }, { status: 201 });
  });
}