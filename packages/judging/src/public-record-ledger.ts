import { createHash, randomUUID } from "node:crypto";

import {
  and,
  db,
  eq,
  inArray,
  isNotNull,
  schema,
  sql,
} from "@dogfood/db";
import { appendAuditEvent } from "@dogfood/audit";
import { ACTION, requirePermission } from "@dogfood/permissions";
import type { Actor } from "@dogfood/shared";
import { DogfoodError } from "@dogfood/validation";

import {
  canonicalJson,
  isTrustedSignerFingerprint,
  publicLedgerRecordIsVisible,
  signLedgerJudgeRecord,
  verifyLedgerJudgeRecord,
} from "./public-record-ledger-crypto";
import {
  listEligiblePublicJudgeRecords,
  type PublicJudgeRecord,
} from "./public-records";

type Issuance = typeof schema.judgeParticipationRecords.$inferSelect;
type Revocation = typeof schema.judgeParticipationRecordRevocations.$inferSelect;

export type PublicJudgeRecordIssuance = {
  id: string;
  payload: PublicJudgeRecord;
  algorithm: "Ed25519";
  keyFingerprint: string;
  publicKey: string;
  signature: string;
  payloadHash: string;
  issuedAt: string;
  signatureValid: true;
  issuerTrusted: boolean;
};

export type PublicJudgeRecordRevocationReceipt = {
  payload: Record<string, unknown>;
  payloadHash: string;
  algorithm: "Ed25519";
  keyFingerprint: string;
  publicKey: string;
  signature: string;
  revokedAt: string;
  signatureValid: true;
  issuerTrusted: boolean;
};

export type PublicJudgeRecordStatus =
  | { status: "published"; record: PublicJudgeRecordIssuance }
  | { status: "revoked"; receipt: PublicJudgeRecordRevocationReceipt };

export type IssueJudgeRecordsResult = {
  issued: string[];
  skipped: string[];
};

function assertSigningKey(privateKey: string | undefined): string {
  if (!privateKey) {
    throw new DogfoodError(
      "EVENT_STATE_INVALID",
      "Judge record signing is not configured",
    );
  }
  return privateKey;
}

async function requireIssuer(actor: Actor, eventId: string): Promise<void> {
  const [event] = await db
    .select({ id: schema.events.id, state: schema.events.state })
    .from(schema.events)
    .where(eq(schema.events.id, eventId))
    .limit(1);
  if (!event) throw new DogfoodError("NOT_FOUND", "Event not found");

  const memberships = await db
    .select({ role: schema.eventMemberships.role })
    .from(schema.eventMemberships)
    .where(
      and(
        eq(schema.eventMemberships.eventId, eventId),
        eq(schema.eventMemberships.userId, actor.userId),
        eq(schema.eventMemberships.isActive, true),
      ),
    );
  requirePermission(actor, ACTION.EVENT_CONFIGURE, {
    eventId,
    resourceEventId: eventId,
    roles: memberships.map(({ role }) => role),
    eventState: event.state,
  });
}

async function withJudgeLock(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  eventId: string,
  judgeId: string,
): Promise<void> {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`${eventId}:${judgeId}`}, 0))`,
  );
}

async function getJudgeHistory(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  eventId: string,
  judgeId: string,
): Promise<{ records: Issuance[]; revokedIds: Set<string> }> {
  const records = await tx
    .select()
    .from(schema.judgeParticipationRecords)
    .where(
      and(
        eq(schema.judgeParticipationRecords.eventId, eventId),
        eq(schema.judgeParticipationRecords.judgeId, judgeId),
      ),
    )
    .orderBy(schema.judgeParticipationRecords.issuedAt);
  if (!records.length) return { records, revokedIds: new Set() };
  const revocations = await tx
    .select({ recordId: schema.judgeParticipationRecordRevocations.recordId })
    .from(schema.judgeParticipationRecordRevocations)
    .where(
      inArray(
        schema.judgeParticipationRecordRevocations.recordId,
        records.map((record) => record.id),
      ),
    );
  return {
    records,
    revokedIds: new Set(revocations.map(({ recordId }) => recordId)),
  };
}

function toPublicRecord(row: Issuance): PublicJudgeRecordIssuance {
  const payload = row.payload as PublicJudgeRecord;
  const signed = {
    payload,
    algorithm: row.algorithm as "Ed25519",
    keyFingerprint: row.keyFingerprint,
    publicKey: row.publicKey,
    signature: row.signature,
  };
  const actualHash = createHash("sha256")
    .update(canonicalJson(payload))
    .digest("hex");
  if (
    actualHash !== row.payloadHash ||
    !verifyLedgerJudgeRecord(signed)
  ) {
    throw new Error(`Stored judge participation record ${row.id} failed verification`);
  }
  return {
    id: row.id,
    payload,
    algorithm: "Ed25519",
    keyFingerprint: row.keyFingerprint,
    publicKey: row.publicKey,
    signature: row.signature,
    payloadHash: row.payloadHash,
    issuedAt: row.issuedAt.toISOString(),
    signatureValid: true,
    issuerTrusted: isTrustedSignerFingerprint(row.keyFingerprint),
  };
}

function buildRevocationReceipt(
  recordId: string,
  eventSlug: string,
  revokedAt: Date,
  privateKey: string,
) {
  const payload = {
    version: "dogfood.judge-participation-revocation.v1",
    recordId,
    eventSlug,
    status: "revoked" as const,
    revokedAt: revokedAt.toISOString(),
  };
  const signed = signLedgerJudgeRecord(payload, privateKey);
  return {
    payload: signed.payload,
    payloadHash: createHash("sha256")
      .update(canonicalJson(signed.payload))
      .digest("hex"),
    algorithm: signed.algorithm,
    publicKey: signed.publicKey,
    keyFingerprint: signed.keyFingerprint,
    signature: signed.signature,
  };
}

function toPublicRevocationReceipt(
  row: Revocation,
): PublicJudgeRecordRevocationReceipt {
  const payload = row.payload as Record<string, unknown>;
  const signed = {
    payload,
    algorithm: row.algorithm as "Ed25519",
    keyFingerprint: row.keyFingerprint,
    publicKey: row.publicKey,
    signature: row.signature,
  };
  const payloadHash = createHash("sha256")
    .update(canonicalJson(payload))
    .digest("hex");
  if (
    payloadHash !== row.payloadHash ||
    payload.version !== "dogfood.judge-participation-revocation.v1" ||
    payload.recordId !== row.recordId ||
    payload.status !== "revoked" ||
    payload.revokedAt !== row.revokedAt.toISOString() ||
    !verifyLedgerJudgeRecord(signed)
  ) {
    throw new Error(`Stored judge record revocation ${row.recordId} failed verification`);
  }
  return {
    payload,
    payloadHash: row.payloadHash,
    algorithm: "Ed25519",
    keyFingerprint: row.keyFingerprint,
    publicKey: row.publicKey,
    signature: row.signature,
    revokedAt: row.revokedAt.toISOString(),
    signatureValid: true,
    issuerTrusted: isTrustedSignerFingerprint(row.keyFingerprint),
  };
}

async function insertIssuance(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  actor: Actor,
  eventId: string,
  judgeId: string,
  sourcePayload: PublicJudgeRecord,
  privateKey: string,
  supersedesRecordId: string | null,
): Promise<Issuance> {
  const recordId = randomUUID();
  const payload = { ...sourcePayload, recordId };
  const signed = signLedgerJudgeRecord(payload, privateKey);
  const payloadHash = createHash("sha256")
    .update(canonicalJson(signed.payload))
    .digest("hex");
  const [row] = await tx
    .insert(schema.judgeParticipationRecords)
    .values({
      id: recordId,
      eventId,
      judgeId,
      payload: signed.payload,
      payloadHash,
      algorithm: signed.algorithm,
      publicKey: signed.publicKey,
      keyFingerprint: signed.keyFingerprint,
      signature: signed.signature,
      issuedBy: actor.userId,
      publishedAt: new Date(),
      supersedesRecordId,
    })
    .returning();
  if (!row) throw new Error("Judge record issuance was not stored");
  return row;
}

export async function issuePublicJudgeRecords(
  actor: Actor,
  eventId: string,
  signingPrivateKey: string | undefined,
): Promise<IssueJudgeRecordsResult> {
  const privateKey = assertSigningKey(signingPrivateKey);
  await requireIssuer(actor, eventId);
  const candidates = await listEligiblePublicJudgeRecords(eventId);
  const result: IssueJudgeRecordsResult = { issued: [], skipped: [] };

  await db.transaction(async (tx) => {
    for (const candidate of candidates) {
      await withJudgeLock(tx, eventId, candidate.judgeId);
      const history = await getJudgeHistory(tx, eventId, candidate.judgeId);
      if (history.records.length > 0) {
        result.skipped.push(candidate.judgeId);
        continue;
      }
      const row = await insertIssuance(
        tx,
        actor,
        eventId,
        candidate.judgeId,
        candidate.payload,
        privateKey,
        null,
      );
      await appendAuditEvent(tx, {
        eventId,
        actorId: actor.userId,
        action: "judge_record.issue",
        resourceType: "judge_participation_record",
        resourceId: row.id,
        metadata: {
          judgeId: candidate.judgeId,
          payloadHash: row.payloadHash,
          keyFingerprint: row.keyFingerprint,
        },
      });
      result.issued.push(row.id);
    }
  });
  return result;
}

export async function reissuePublicJudgeRecord(
  actor: Actor,
  eventId: string,
  judgeId: string,
  signingPrivateKey: string | undefined,
): Promise<PublicJudgeRecordIssuance> {
  const privateKey = assertSigningKey(signingPrivateKey);
  await requireIssuer(actor, eventId);
  const candidate = (await listEligiblePublicJudgeRecords(eventId)).find(
    (entry) => entry.judgeId === judgeId,
  );
  if (!candidate) {
    throw new DogfoodError("NOT_FOUND", "Eligible judge participation record not found");
  }

  return db.transaction(async (tx) => {
    await withJudgeLock(tx, eventId, judgeId);
    const history = await getJudgeHistory(tx, eventId, judgeId);
    const active = history.records.filter(
      (record) => !history.revokedIds.has(record.id),
    );
    if (active.length > 1 || history.records.length === 0) {
      throw new DogfoodError(
        "CONFLICT",
        active.length > 1
          ? "Multiple active judge records require manual review"
          : "No judge record exists to reissue",
      );
    }
    const previous = active[0] ?? history.records.at(-1)!;
    const row = await insertIssuance(
      tx,
      actor,
      eventId,
      judgeId,
      candidate.payload,
      privateKey,
      previous.id,
    );
    const reason = `Superseded by reissue ${row.id}`;
    if (!history.revokedIds.has(previous.id)) {
      const revokedAt = new Date();
      const receipt = buildRevocationReceipt(
        previous.id,
        candidate.payload.eventSlug,
        revokedAt,
        privateKey,
      );
      await tx.insert(schema.judgeParticipationRecordRevocations).values({
        recordId: previous.id,
        eventId,
        revokedBy: actor.userId,
        reason,
        revokedAt,
        payload: receipt.payload,
        payloadHash: receipt.payloadHash,
        algorithm: receipt.algorithm,
        publicKey: receipt.publicKey,
        keyFingerprint: receipt.keyFingerprint,
        signature: receipt.signature,
      });
    }
    await appendAuditEvent(tx, {
      eventId,
      actorId: actor.userId,
      action: "judge_record.reissue",
      resourceType: "judge_participation_record",
      resourceId: row.id,
      metadata: {
        judgeId,
        supersedesRecordId: previous.id,
        payloadHash: row.payloadHash,
        keyFingerprint: row.keyFingerprint,
      },
    });
    if (!history.revokedIds.has(previous.id)) {
      await appendAuditEvent(tx, {
        eventId,
        actorId: actor.userId,
        action: "judge_record.revoke",
        resourceType: "judge_participation_record",
        resourceId: previous.id,
        metadata: { judgeId, reason, supersededByRecordId: row.id },
      });
    }
    return toPublicRecord(row);
  });
}

export async function revokePublicJudgeRecord(
  actor: Actor,
  eventId: string,
  recordId: string,
  reason: string,
  signingPrivateKey: string | undefined,
): Promise<Revocation> {
  const privateKey = assertSigningKey(signingPrivateKey);
  await requireIssuer(actor, eventId);
  return db.transaction(async (tx) => {
    const [record] = await tx
      .select()
      .from(schema.judgeParticipationRecords)
      .where(
        and(
          eq(schema.judgeParticipationRecords.id, recordId),
          eq(schema.judgeParticipationRecords.eventId, eventId),
        ),
      )
      .limit(1);
    if (!record) throw new DogfoodError("NOT_FOUND", "Judge record not found");
    const [existing] = await tx
      .select({ recordId: schema.judgeParticipationRecordRevocations.recordId })
      .from(schema.judgeParticipationRecordRevocations)
      .where(eq(schema.judgeParticipationRecordRevocations.recordId, recordId))
      .limit(1);
    if (existing) throw new DogfoodError("CONFLICT", "Judge record is already revoked");

    const [event] = await tx
      .select({ slug: schema.events.slug })
      .from(schema.events)
      .where(eq(schema.events.id, eventId))
      .limit(1);
    if (!event) throw new DogfoodError("NOT_FOUND", "Event not found");
    const revokedAt = new Date();
    const receipt = buildRevocationReceipt(recordId, event.slug, revokedAt, privateKey);
    const [revocation] = await tx
      .insert(schema.judgeParticipationRecordRevocations)
      .values({
        recordId,
        eventId,
        revokedBy: actor.userId,
        reason,
        revokedAt,
        payload: receipt.payload,
        payloadHash: receipt.payloadHash,
        algorithm: receipt.algorithm,
        publicKey: receipt.publicKey,
        keyFingerprint: receipt.keyFingerprint,
        signature: receipt.signature,
      })
      .returning();
    if (!revocation) throw new Error("Judge record revocation was not stored");
    await appendAuditEvent(tx, {
      eventId,
      actorId: actor.userId,
      action: "judge_record.revoke",
      resourceType: "judge_participation_record",
      resourceId: recordId,
      metadata: {
        judgeId: record.judgeId,
        reason,
        payloadHash: record.payloadHash,
        keyFingerprint: record.keyFingerprint,
      },
    });
    return revocation;
  });
}

function isVisible(row: Issuance, revokedIds: Set<string>): boolean {
  return publicLedgerRecordIsVisible({
    publishedAt: row.publishedAt,
    revokedAt: revokedIds.has(row.id) ? new Date(0) : null,
  });
}

async function loadPublicRecords(
  predicate: ReturnType<typeof eq>,
): Promise<PublicJudgeRecordIssuance[]> {
  const rows = await db
    .select()
    .from(schema.judgeParticipationRecords)
    .where(predicate)
    .orderBy(schema.judgeParticipationRecords.issuedAt);
  if (!rows.length) return [];
  const revocations = await db
    .select({ recordId: schema.judgeParticipationRecordRevocations.recordId })
    .from(schema.judgeParticipationRecordRevocations)
    .where(inArray(schema.judgeParticipationRecordRevocations.recordId, rows.map((row) => row.id)));
  const revokedIds = new Set(revocations.map(({ recordId }) => recordId));
  return rows.filter((row) => isVisible(row, revokedIds)).map(toPublicRecord);
}

export async function listPublishedPublicJudgeRecords(
  eventId: string,
): Promise<PublicJudgeRecordIssuance[]> {
  const [event] = await db
    .select({ id: schema.events.id })
    .from(schema.events)
    .where(eq(schema.events.id, eventId))
    .limit(1);
  if (!event) throw new DogfoodError("NOT_FOUND", "Event not found");
  return loadPublicRecords(eq(schema.judgeParticipationRecords.eventId, eventId));
}

export async function getPublishedPublicJudgeRecord(
  recordId: string,
): Promise<PublicJudgeRecordIssuance> {
  const rows = await loadPublicRecords(eq(schema.judgeParticipationRecords.id, recordId));
  const [record] = rows;
  if (!record) throw new DogfoodError("NOT_FOUND", "Published judge record not found");
  return record;
}

export async function getPublicJudgeRecordStatus(
  recordId: string,
): Promise<PublicJudgeRecordStatus> {
  const [record] = await db
    .select()
    .from(schema.judgeParticipationRecords)
    .where(
      and(
        eq(schema.judgeParticipationRecords.id, recordId),
        isNotNull(schema.judgeParticipationRecords.publishedAt),
      ),
    )
    .limit(1);
  if (!record) throw new DogfoodError("NOT_FOUND", "Published judge record not found");
  const [revocation] = await db
    .select()
    .from(schema.judgeParticipationRecordRevocations)
    .where(eq(schema.judgeParticipationRecordRevocations.recordId, recordId))
    .limit(1);
  if (revocation) {
    return { status: "revoked", receipt: toPublicRevocationReceipt(revocation) };
  }
  return { status: "published", record: toPublicRecord(record) };
}
