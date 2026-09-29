import { createHash, generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  isTrustedSignerFingerprint,
  judgeRecordIssuerKeys,
  verifyJudgeRecordResponse,
  publicLedgerRecordIsVisible,
  canonicalJson,
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
    const payload = { version: "dogfood.judge-participation.v1", count: 3, judge: "Ada" };
    const signed = signLedgerJudgeRecord(payload, privateKey);
    const reordered = signLedgerJudgeRecord(
      { judge: "Ada", version: "dogfood.judge-participation.v1", count: 3 },
      privateKey,
    );

    expect(verifyLedgerJudgeRecord(signed)).toBe(true);
    expect(signed.signature).toBe(reordered.signature);
    payload.count = 8;
    expect(signed.payload.count).toBe(3);
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

  it("trusts only fingerprints supplied through the independent pin configuration", () => {
    expect(isTrustedSignerFingerprint("aabb", "AABB, ccdd")).toBe(true);
    expect(isTrustedSignerFingerprint("aabb", undefined)).toBe(false);
  });

  it("exposes only published records whose revocation timestamp is absent", () => {
    const publishedAt = new Date("2026-09-29T10:00:00.000Z");

    expect(publicLedgerRecordIsVisible({ publishedAt, revokedAt: null })).toBe(true);
    expect(publicLedgerRecordIsVisible({ publishedAt: null, revokedAt: null })).toBe(false);
    expect(publicLedgerRecordIsVisible({ publishedAt, revokedAt: new Date() })).toBe(false);
  });

  it("publishes the active signer as the trust anchor and verifies records independently", () => {
    const issuer = keyPair();
    const rogue = keyPair();
    const keys = judgeRecordIssuerKeys("https://dogfood.example", issuer.privateKey, "AB,  cd");
    const fingerprint = publicKeyFingerprint(issuer.publicKey);
    expect(keys.activeKey?.keyFingerprint).toBe(fingerprint);
    expect(keys.trustedFingerprints).toEqual(["ab", "cd", fingerprint].sort());
    expect(judgeRecordIssuerKeys("https://x", "", "").activeKey).toBeNull();

    const response = (privateKey: string, payload: Record<string, unknown>) => {
      const signed = signLedgerJudgeRecord(payload, privateKey);
      return {
        status: "published",
        record: {
          ...signed,
          payloadHash: createHash("sha256").update(canonicalJson(signed.payload)).digest("hex"),
          issuerTrusted: true,
        },
      };
    };
    const payload = { version: "dogfood.judge-participation.v1", recordId: "r1", lockedEvaluations: 2 };

    expect(verifyJudgeRecordResponse(response(issuer.privateKey, payload), keys.trustedFingerprints))
      .toMatchObject({ status: "valid", signatureValid: true, issuerTrusted: true });

    // A server claiming issuerTrusted cannot vouch for a key the verifier does not trust.
    expect(verifyJudgeRecordResponse(response(rogue.privateKey, payload), keys.trustedFingerprints))
      .toMatchObject({ status: "invalid", signatureValid: true, issuerTrusted: false });

    const tampered = response(issuer.privateKey, payload);
    tampered.record.payload = { ...tampered.record.payload, lockedEvaluations: 9 };
    expect(verifyJudgeRecordResponse(tampered, keys.trustedFingerprints))
      .toMatchObject({ status: "invalid", signatureValid: false });

    const revocation = signLedgerJudgeRecord(
      { version: "dogfood.judge-participation-revocation.v1", recordId: "r1", status: "revoked" },
      issuer.privateKey,
    );
    expect(verifyJudgeRecordResponse({
      status: "revoked",
      revocationReceipt: {
        ...revocation,
        payloadHash: createHash("sha256").update(canonicalJson(revocation.payload)).digest("hex"),
      },
    }, keys.trustedFingerprints)).toMatchObject({ status: "revoked", issuerTrusted: true });
  });
});
