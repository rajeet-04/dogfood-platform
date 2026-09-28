import { createPrivateKey, generateKeyPairSync, verify } from "node:crypto";
import { describe, expect, it } from "vitest";

import { signPublicJudgeRecord } from "../../packages/judging/src/public-records";

describe("public judge record signatures", () => {
  it("signs canonical payloads with a publicly verifiable Ed25519 key", () => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const payload = { version: "dogfood.judge-participation.v1", judge: "Ada", count: 3 };

    const signed = signPublicJudgeRecord(payload, privateKeyPem);

    expect(signed.algorithm).toBe("Ed25519");
    expect(
      verify(
        null,
        Buffer.from(JSON.stringify(payload)),
        signed.publicKey,
        Buffer.from(signed.signature, "base64url"),
      ),
    ).toBe(true);
    expect(signed.publicKey).toContain("BEGIN PUBLIC KEY");
    expect(
      verify(
        null,
        Buffer.from(JSON.stringify({ ...payload, count: 4 })),
        signed.publicKey,
        Buffer.from(signed.signature, "base64url"),
      ),
    ).toBe(false);
    expect(createPrivateKey(privateKeyPem).asymmetricKeyType).toBe("ed25519");
  });
});
