import { db, eq, schema } from "@dogfood/db";
import { DogfoodError } from "@dogfood/validation";
import {
  getEvaluation,
  getJudgeQueue,
  getJudgeQueueItem,
  type JudgeQueueItem,
} from "@dogfood/judging";
import type { Actor } from "@dogfood/shared";

type EventRow = typeof schema.events.$inferSelect;

export type JudgeAssignmentDetail = {
  item: JudgeQueueItem;
  evaluation: Awaited<ReturnType<typeof getEvaluation>> | null;
  event: {
    id: string;
    state: EventRow["state"];
  };
};

export type JudgeHome = {
  event: {
    id: string;
    slug: string;
    name: string;
    state: EventRow["state"];
  };
  queue: JudgeQueueItem[];
  pendingCount: number;
  completedCount: number;
};

export async function getJudgeHome(
  actor: Actor,
  eventId: string,
): Promise<JudgeHome> {
  const eventRows = await db
    .select()
    .from(schema.events)
    .where(eq(schema.events.id, eventId))
    .limit(1);
  const event = eventRows[0];
  if (!event) throw new DogfoodError("NOT_FOUND", "Event not found");

  const queue = await getJudgeQueue(actor, eventId);
  const completed = queue.filter(
    (item) => item.status === "SUBMITTED" || item.status === "LOCKED",
  );

  return {
    event: {
      id: event.id,
      slug: event.slug,
      name: event.name,
      state: event.state,
    },
    queue,
    pendingCount: queue.length - completed.length,
    completedCount: completed.length,
  };
}

export async function getJudgeAssignmentDetail(
  actor: Actor,
  eventId: string,
  assignmentId: string,
): Promise<JudgeAssignmentDetail> {
  const item = await getJudgeQueueItem(actor, eventId, assignmentId);
  let evaluation: JudgeAssignmentDetail["evaluation"] = null;
  try {
    evaluation = await getEvaluation(actor, eventId, assignmentId);
  } catch {
    evaluation = null;
  }
  const eventRows = await db
    .select({ id: schema.events.id, state: schema.events.state })
    .from(schema.events)
    .where(eq(schema.events.id, eventId))
    .limit(1);
  const event = eventRows[0];
  if (!event) throw new DogfoodError("NOT_FOUND", "Event not found");
  return { item, evaluation, event };
}