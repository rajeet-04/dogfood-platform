import { createPublicKey, generateKeyPairSync } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { db, eq, schema, sqlState } from "@dogfood/db";
import { transitionEvent } from "@dogfood/events";
import { lockEvaluation } from "@dogfood/judging";
import {
  generateRankingSnapshot,
  publishRankingSnapshot,
} from "@dogfood/ranking";
import {
  getPublishedPublicJudgeRecord,
  issuePublicJudgeRecords,
  listPublishedPublicJudgeRecords,
  reissuePublicJudgeRecord,
  revokePublicJudgeRecord,
} from "../../packages/judging/src/public-record-ledger";
import {
  publicKeyFingerprint,
  verifyLedgerJudgeRecord,
} from "../../packages/judging/src/public-record-ledger-crypto";
import { GET as getEventRecords } from "../../apps/web/app/api/v1/events/[eventId]/judge-records/route";
import { GET as verifyPublicRecord } from "../../apps/web/app/api/v1/judge-records/[recordId]/route";
import { resetDb } from "../fixtures/db";
import {
  rankingScenario,
  RANKING_CONFIG,
  submitBoth,
} from "../fixtures/ranking-scenario";

function signingKey(): string {
  return generateKeyPairSync("ed25519").privateKey
    .export({ type: "pkcs8", format: "pem" })
    .toString();
}

async function publishedScenario() {
  const scenario = await rankingScenario();
  for (const judge of [scenario.judgeA, scenario.judgeB]) {
    await submitBoth(
      judge,
      scenario.event.id,
      { projectA: 9, projectB: 4 },
      scenario.assignments,
      judge.userId,
      scenario.projectAId,
      scenario.projectBId,
    );
    for (const projectId of [scenario.projectAId, scenario.projectBId]) {
      await lockEvaluation(
        scenario.organizer,
        scenario.event.id,
        scenario.assignments[`${judge.userId}-${projectId}`]!,
      );
    }
  }
  const snapshot = await generateRankingSnapshot(
    scenario.organizer,
    scenario.event.id,
    RANKING_CONFIG,
  );
  await publishRankingSnapshot(scenario.organizer, scenario.event.id, snapshot.id);
  await transitionEvent(scenario.organizer, scenario.event.id, "PUBLISHED");
  return scenario;
}

describe("public judge participation record ledger", () => {
  let previousTrustPins: string | undefined;

  beforeEach(async () => {
    previousTrustPins = process.env.JUDGE_RECORD_TRUSTED_KEY_FINGERPRINTS;
    delete process.env.JUDGE_RECORD_TRUSTED_KEY_FINGERPRINTS;
    await resetDb();
  });

  afterEach(() => {
    if (previousTrustPins === undefined) {
      delete process.env.JUDGE_RECORD_TRUSTED_KEY_FINGERPRINTS;
    } else {
      process.env.JUDGE_RECORD_TRUSTED_KEY_FINGERPRINTS = previousTrustPins;
    }
  });

  it("stores signed issuance rows once and makes reissues supersede their predecessor", async () => {
    const scenario = await publishedScenario();
    const firstKey = signingKey();
    const rotatedKey = signingKey();

    const issued = await issuePublicJudgeRecords(
      scenario.organizer,
      scenario.event.id,
      firstKey,
    );
    expect(issued.issued).toHaveLength(2);
    expect(issued.skipped).toHaveLength(0);
    expect(
      await issuePublicJudgeRecords(scenario.organizer, scenario.event.id, firstKey),
    ).toMatchObject({ issued: [], skipped: [scenario.judgeA.userId, scenario.judgeB.userId] });

    const initialRecords = await listPublishedPublicJudgeRecords(scenario.event.id);
    expect(initialRecords).toHaveLength(2);
    expect(initialRecords.every((record) => record.keyFingerprint.length === 64)).toBe(true);
    expect(initialRecords.every((record) => record.signatureValid)).toBe(true);
    expect(initialRecords.every((record) => !record.issuerTrusted)).toBe(true);
    expect(initialRecords.every((record) => record.payload.lockedEvaluations === 2)).toBe(true);
    const firstKeyFingerprint = publicKeyFingerprint(createPublicKey(firstKey));
    process.env.JUDGE_RECORD_TRUSTED_KEY_FINGERPRINTS = firstKeyFingerprint;
    expect(
      (await listPublishedPublicJudgeRecords(scenario.event.id)).every(
        (record) => record.issuerTrusted,
      ),
    ).toBe(true);
    const publicListResponse = await getEventRecords(new Request("http://localhost"), {
      params: Promise.resolve({ eventId: scenario.event.id }),
    });
    expect(publicListResponse.status).toBe(200);
    expect((await publicListResponse.json()).records).toHaveLength(2);

    const previous = initialRecords.find(
      (record) => record.payload.judgeDisplayName === "Judge A",
    )!;
    const reissued = await reissuePublicJudgeRecord(
      scenario.organizer,
      scenario.event.id,
      scenario.judgeA.userId,
      rotatedKey,
    );
    expect(reissued.id).not.toBe(previous.id);
    expect(reissued.keyFingerprint).not.toBe(previous.keyFingerprint);
    expect(reissued.issuerTrusted).toBe(false);
    process.env.JUDGE_RECORD_TRUSTED_KEY_FINGERPRINTS =
      `${firstKeyFingerprint},${publicKeyFingerprint(createPublicKey(rotatedKey))}`;

    const [storedReissue] = await db
      .select()
      .from(schema.judgeParticipationRecords)
      .where(eq(schema.judgeParticipationRecords.id, reissued.id));
    expect(storedReissue?.supersedesRecordId).toBe(previous.id);
    await expect(getPublishedPublicJudgeRecord(previous.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    const revokedVerifyResponse = await verifyPublicRecord(
      new Request("http://localhost"),
      { params: Promise.resolve({ recordId: previous.id }) },
    );
    expect(revokedVerifyResponse.status).toBe(410);
    const publicRevocation = await revokedVerifyResponse.json();
    expect(publicRevocation.status).toBe("revoked");
    expect(publicRevocation.revocationReceipt.signatureValid).toBe(true);
    expect(publicRevocation.revocationReceipt.issuerTrusted).toBe(true);
    expect(
      verifyLedgerJudgeRecord({
        payload: publicRevocation.revocationReceipt.payload,
        algorithm: publicRevocation.revocationReceipt.algorithm,
        keyFingerprint: publicRevocation.revocationReceipt.keyFingerprint,
        publicKey: publicRevocation.revocationReceipt.publicKey,
        signature: publicRevocation.revocationReceipt.signature,
      }),
    ).toBe(true);
    expect(publicRevocation).not.toHaveProperty("record");
    const currentVerifyResponse = await verifyPublicRecord(
      new Request("http://localhost"),
      { params: Promise.resolve({ recordId: reissued.id }) },
    );
    expect(currentVerifyResponse.status).toBe(200);
    const currentVerification = await currentVerifyResponse.json();
    expect(currentVerification.status).toBe("published");
    expect(currentVerification.record.signatureValid).toBe(true);
    expect(currentVerification.record.issuerTrusted).toBe(true);
    expect(await listPublishedPublicJudgeRecords(scenario.event.id)).toHaveLength(2);

    const audit = await db
      .select({ action: schema.auditEvents.action })
      .from(schema.auditEvents)
      .where(eq(schema.auditEvents.resourceType, "judge_participation_record"));
    expect(audit.map(({ action }) => action)).toEqual(
      expect.arrayContaining([
        "judge_record.issue",
        "judge_record.reissue",
        "judge_record.revoke",
      ]),
    );
  });

  it("revokes records without deleting their immutable payload or signature", async () => {
    const scenario = await publishedScenario();
    const issued = await issuePublicJudgeRecords(
      scenario.organizer,
      scenario.event.id,
      signingKey(),
    );
    const recordId = issued.issued[0]!;
    const [before] = await db
      .select()
      .from(schema.judgeParticipationRecords)
      .where(eq(schema.judgeParticipationRecords.id, recordId));

    await revokePublicJudgeRecord(
      scenario.organizer,
      scenario.event.id,
      recordId,
      "Judge requested withdrawal",
      signingKey(),
    );

    expect(await listPublishedPublicJudgeRecords(scenario.event.id)).toHaveLength(1);
    await expect(getPublishedPublicJudgeRecord(recordId)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    const revocationResponse = await verifyPublicRecord(
      new Request("http://localhost"),
      { params: Promise.resolve({ recordId }) },
    );
    expect(revocationResponse.status).toBe(410);
    const revocationStatus = await revocationResponse.json();
    expect(revocationStatus.status).toBe("revoked");
    expect(revocationStatus.revocationReceipt.signatureValid).toBe(true);
    expect(revocationStatus.revocationReceipt.issuerTrusted).toBe(false);
    expect(revocationStatus.revocationReceipt.payload.recordId).toBe(recordId);
    expect(
      verifyLedgerJudgeRecord({
        payload: revocationStatus.revocationReceipt.payload,
        algorithm: revocationStatus.revocationReceipt.algorithm,
        keyFingerprint: revocationStatus.revocationReceipt.keyFingerprint,
        publicKey: revocationStatus.revocationReceipt.publicKey,
        signature: revocationStatus.revocationReceipt.signature,
      }),
    ).toBe(true);
    expect(revocationStatus).not.toHaveProperty("record");
    const [after] = await db
      .select()
      .from(schema.judgeParticipationRecords)
      .where(eq(schema.judgeParticipationRecords.id, recordId));
    expect(after?.payload).toEqual(before?.payload);
    expect(after?.signature).toBe(before?.signature);
    let mutationError: unknown;
    try {
      await db
        .update(schema.judgeParticipationRecords)
        .set({ signature: "tampered" })
        .where(eq(schema.judgeParticipationRecords.id, recordId));
    } catch (error) {
      mutationError = error;
    }
    expect(sqlState(mutationError)).toBe("55000");
    const [revocation] = await db
      .select()
      .from(schema.judgeParticipationRecordRevocations)
      .where(eq(schema.judgeParticipationRecordRevocations.recordId, recordId));
    expect(revocation?.reason).toBe("Judge requested withdrawal");
    let revocationMutationError: unknown;
    try {
      await db
        .update(schema.judgeParticipationRecordRevocations)
        .set({ reason: "rewritten" })
        .where(eq(schema.judgeParticipationRecordRevocations.recordId, recordId));
    } catch (error) {
      revocationMutationError = error;
    }
    expect(sqlState(revocationMutationError)).toBe("55000");
  });

  it("requires organizer authority for issuance and revocation", async () => {
    const scenario = await publishedScenario();
    await expect(
      issuePublicJudgeRecords(scenario.participantA, scenario.event.id, signingKey()),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
