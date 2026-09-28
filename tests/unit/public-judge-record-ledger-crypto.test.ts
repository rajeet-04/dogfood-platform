import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  publicLedgerRecordIsVisible,
  publicKeyFingerprint,
  signLedgerJudgeRecord,
  verifyLedgerJudgeRecord,
} from "../../packages/judging/src/public-record-ledger-crypto";

function keyPair() {
  const pair = generateKeyPairSync("ed25519");
  return {
    privateKey: pair.privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    publicKey: pair.publicKey.export({ type: "spki", format: "pem" }).toString(),
  };
}

describe("public judge record ledger crypto", () => {
  it("verifies immutable canonical payloads and rejects tampering", () => {
    const { privateKey } = keyPair();
    const signed = signLedgerJudgeRecord(
      { version: "dogfood.judge-participation.v1", count: 3, judge: "Ada" },
      privateKey,
    );

    expect(verifyLedgerJudgeRecord(signed)).toBe(true);
    expect(
      verifyLedgerJudgeRecord({
        ...signed,
        payload: { ...signed.payload, count: 4 },
      }),
    ).toBe(false);
    expect(
      verifyLedgerJudgeRecord({
        ...signed,
        keyFingerprint: "0".repeat(64),
      }),
    ).toBe(false);
  });

  it("uses the same fingerprint across PEM formatting and changes it on rotation", () => {
    const first = keyPair();
    const rotated = keyPair();
    const wrappedPem = first.publicKey.replace(/\n/g, "\\n");

    expect(publicKeyFingerprint(wrappedPem)).toBe(publicKeyFingerprint(first.publicKey));
    expect(publicKeyFingerprint(rotated.publicKey)).not.toBe(
      publicKeyFingerprint(first.publicKey),
    );
  });

  it("exposes only published records whose revocation timestamp is absent", () => {
    const publishedAt = new Date("2026-09-29T10:00:00.000Z");

    expect(publicLedgerRecordIsVisible({ publishedAt, revokedAt: null })).toBe(true);
    expect(publicLedgerRecordIsVisible({ publishedAt: null, revokedAt: null })).toBe(false);
    expect(publicLedgerRecordIsVisible({ publishedAt, revokedAt: new Date() })).toBe(false);
  });
});
