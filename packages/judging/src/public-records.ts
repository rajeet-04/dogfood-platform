import { createHash, createPublicKey, sign } from "node:crypto";

import { and, db, eq, schema } from "@dogfood/db";
import { DogfoodError } from "@dogfood/validation";

export type PublicJudgeRecord = {
  version: "dogfood.judge-participation.v1";
  recordId: string;
  eventSlug: string;
  eventName: string;
  judgeDisplayName: string;
  lockedEvaluations: number;
  firstLockedAt: string;
  lastLockedAt: string;
};

export type EligibleJudgeRecord = {
  judgeId: string;
  payload: PublicJudgeRecord;
};

export function signPublicJudgeRecord<T extends object>(
  payload: T,
  privateKeyPem: string,
): { algorithm: "Ed25519"; publicKey: string; signature: string } {
  const privateKey = privateKeyPem.replace(/\\n/g, "\n");
  const publicKey = createPublicKey(privateKey);
  if (publicKey.asymmetricKeyType !== "ed25519") {
    throw new Error("Judge record signing key must be Ed25519");
  }
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();
  return {
    algorithm: "Ed25519",
    publicKey: publicKeyPem,
    signature: sign(null, Buffer.from(JSON.stringify(payload)), privateKey).toString(
      "base64url",
    ),
  };
}

export async function listEligiblePublicJudgeRecords(
  eventId: string,
): Promise<EligibleJudgeRecord[]> {
  const [event] = await db
    .select({
      slug: schema.events.slug,
      name: schema.events.name,
      state: schema.events.state,
      publishedRankingSnapshotId: schema.events.publishedRankingSnapshotId,
    })
    .from(schema.events)
    .where(eq(schema.events.id, eventId))
    .limit(1);

  if (!event) throw new DogfoodError("NOT_FOUND", "Event not found");
  if (
    !["PUBLISHED", "ARCHIVED"].includes(event.state) ||
    !event.publishedRankingSnapshotId
  ) {
    throw new DogfoodError("NOT_FOUND", "Published judge records not found");
  }

  const [snapshot] = await db
    .select({
      id: schema.rankingSnapshots.id,
      publishedAt: schema.rankingSnapshots.publishedAt,
    })
    .from(schema.rankingSnapshots)
    .where(
      and(
        eq(schema.rankingSnapshots.id, event.publishedRankingSnapshotId),
        eq(schema.rankingSnapshots.eventId, eventId),
      ),
    )
    .limit(1);
  if (!snapshot?.publishedAt) {
    throw new DogfoodError("NOT_FOUND", "Published judge records not found");
  }

  const evaluations = await db
    .select({
      judgeId: schema.judgeAssignments.judgeId,
      displayName: schema.users.displayName,
      lockedAt: schema.evaluations.lockedAt,
    })
    .from(schema.judgeAssignments)
    .innerJoin(
      schema.evaluations,
      and(
        eq(schema.evaluations.assignmentId, schema.judgeAssignments.id),
        eq(schema.evaluations.state, "LOCKED"),
      ),
    )
    .innerJoin(schema.users, eq(schema.users.id, schema.judgeAssignments.judgeId))
    .where(eq(schema.judgeAssignments.eventId, eventId));

  const byJudge = new Map<
    string,
    { displayName: string; lockedAt: Date[] }
  >();
  for (const row of evaluations) {
    if (!row.lockedAt) continue;
    const current = byJudge.get(row.judgeId) ?? {
      displayName: row.displayName,
      lockedAt: [],
    };
    current.lockedAt.push(row.lockedAt);
    byJudge.set(row.judgeId, current);
  }

  return [...byJudge.entries()]
    .map(([judgeId, judge]) => {
      const dates = judge.lockedAt.sort((a, b) => a.getTime() - b.getTime());
      return {
        judgeId,
        payload: {
          version: "dogfood.judge-participation.v1" as const,
          recordId: createHash("sha256")
            .update(`${eventId}:${judgeId}`)
            .digest("hex"),
          eventSlug: event.slug,
          eventName: event.name,
          judgeDisplayName: judge.displayName,
          lockedEvaluations: dates.length,
          firstLockedAt: dates[0]!.toISOString(),
          lastLockedAt: dates.at(-1)!.toISOString(),
        },
      };
    })
    .sort((a, b) => a.payload.judgeDisplayName.localeCompare(b.payload.judgeDisplayName));
}

export async function listPublicJudgeRecords(
  eventId: string,
): Promise<PublicJudgeRecord[]> {
  return (await listEligiblePublicJudgeRecords(eventId)).map((entry) => entry.payload);
}
