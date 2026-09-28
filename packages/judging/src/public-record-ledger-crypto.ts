import {
  createHash,
  createPublicKey,
  sign,
  verify,
  type KeyObject,
} from "node:crypto";

export type SignedPublicJudgeRecord<T extends object = Record<string, unknown>> = {
  algorithm: "Ed25519";
  keyFingerprint: string;
  publicKey: string;
  signature: string;
  payload: T;
};

const SIGNING_CONTEXT = "dogfood.judge-participation.v1\n";

/** Stable JSON encoding used for signatures and payload hashes. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Payload numbers must be finite");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, child]) => child !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries
      .map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`)
      .join(",")}}`;
  }
  throw new TypeError("Payload must contain only JSON values");
}

export function publicKeyFingerprint(publicKey: string | KeyObject): string {
  const key =
    typeof publicKey === "string"
      ? createPublicKey(publicKey.replace(/\\n/g, "\n"))
      : publicKey;
  if (key.asymmetricKeyType !== "ed25519") {
    throw new TypeError("Judge record signing key must be Ed25519");
  }
  const der = key.export({ type: "spki", format: "der" });
  return createHash("sha256").update(der).digest("hex");
}

export function signLedgerJudgeRecord<T extends object>(
  payload: T,
  privateKeyPem: string,
): SignedPublicJudgeRecord<T> {
  const normalizedPrivateKey = privateKeyPem.replace(/\\n/g, "\n");
  const publicKeyObject = createPublicKey(normalizedPrivateKey);
  const publicKey = publicKeyObject
    .export({ type: "spki", format: "pem" })
    .toString();
  const canonicalPayload = canonicalJson(payload);
  const signature = sign(
    null,
    Buffer.from(`${SIGNING_CONTEXT}${canonicalPayload}`),
    normalizedPrivateKey,
  ).toString("base64url");

  return {
    algorithm: "Ed25519",
    keyFingerprint: publicKeyFingerprint(publicKeyObject),
    publicKey,
    signature,
    payload,
  };
}

export function verifyLedgerJudgeRecord<T extends object>(
  record: SignedPublicJudgeRecord<T>,
): boolean {
  try {
    const publicKey = createPublicKey(record.publicKey);
    if (
      record.algorithm !== "Ed25519" ||
      publicKeyFingerprint(publicKey) !== record.keyFingerprint
    ) {
      return false;
    }
    return verify(
      null,
      Buffer.from(`${SIGNING_CONTEXT}${canonicalJson(record.payload)}`),
      publicKey,
      Buffer.from(record.signature, "base64url"),
    );
  } catch {
    return false;
  }
}

export function publicLedgerRecordIsVisible(record: {
  publishedAt: Date | null;
  revokedAt: Date | null;
}): boolean {
  return record.publishedAt !== null && record.revokedAt === null;
}
