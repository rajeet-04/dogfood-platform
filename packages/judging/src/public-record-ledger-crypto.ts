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
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError("Payload objects must be plain JSON objects");
    }
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, child]) => child !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
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

export function isTrustedSignerFingerprint(
  fingerprint: string,
  configuredFingerprints = process.env.JUDGE_RECORD_TRUSTED_KEY_FINGERPRINTS,
): boolean {
  const trusted = new Set(
    (configuredFingerprints ?? "")
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean),
  );
  return trusted.has(fingerprint.toLowerCase());
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
  const immutablePayload = JSON.parse(canonicalPayload) as T;
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
    payload: immutablePayload,
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

export const JUDGE_RECORD_KEYS_PATH = "/.well-known/dogfood-judge-records.json";

export type JudgeRecordIssuerKeys = {
  version: "dogfood.judge-record-keys.v1";
  issuer: string;
  activeKey: { algorithm: "Ed25519"; keyFingerprint: string; publicKey: string } | null;
  /** Current key plus independently pinned (for example retired) fingerprints. */
  trustedFingerprints: string[];
};

/**
 * The issuer's published trust anchor, served at JUDGE_RECORD_KEYS_PATH on the
 * deployment's own origin. Verifiers trust a record when its fingerprint is
 * listed here (fetched over HTTPS from the issuer origin) or pinned locally.
 */
export function judgeRecordIssuerKeys(
  issuer: string,
  privateKeyPem = process.env.JUDGE_RECORD_SIGNING_PRIVATE_KEY,
  configuredFingerprints = process.env.JUDGE_RECORD_TRUSTED_KEY_FINGERPRINTS,
): JudgeRecordIssuerKeys {
  const activeKey = privateKeyPem
    ? (() => {
        const key = createPublicKey(privateKeyPem.replace(/\\n/g, "\n"));
        return {
          algorithm: "Ed25519" as const,
          keyFingerprint: publicKeyFingerprint(key),
          publicKey: key.export({ type: "spki", format: "pem" }).toString(),
        };
      })()
    : null;
  const trusted = new Set(
    (configuredFingerprints ?? "")
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean),
  );
  if (activeKey) trusted.add(activeKey.keyFingerprint);
  return {
    version: "dogfood.judge-record-keys.v1",
    issuer,
    activeKey,
    trustedFingerprints: [...trusted].sort(),
  };
}

export type JudgeRecordVerdict = {
  status: "valid" | "revoked" | "invalid";
  signatureValid: boolean;
  issuerTrusted: boolean;
  keyFingerprint: string | null;
  reason?: string;
};

/**
 * Checks a `GET /api/v1/judge-records/{id}` response body without trusting the
 * server that returned it: recomputes the payload hash, verifies the Ed25519
 * signature, and compares the signer against the caller's trusted fingerprints.
 */
export function verifyJudgeRecordResponse(
  body: unknown,
  trustedFingerprints: Iterable<string>,
): JudgeRecordVerdict {
  const response = body as {
    status?: string;
    record?: Record<string, unknown>;
    revocationReceipt?: Record<string, unknown>;
  };
  const revoked = response?.status === "revoked";
  const signed = revoked ? response.revocationReceipt : response?.record;
  if (!signed || typeof signed !== "object") {
    return { status: "invalid", signatureValid: false, issuerTrusted: false, keyFingerprint: null, reason: "No signed record in response" };
  }
  const keyFingerprint = typeof signed.keyFingerprint === "string" ? signed.keyFingerprint.toLowerCase() : null;
  let hashMatches = false;
  try {
    hashMatches = createHash("sha256").update(canonicalJson(signed.payload)).digest("hex") === signed.payloadHash;
  } catch {
    hashMatches = false;
  }
  const signatureValid = hashMatches && verifyLedgerJudgeRecord(signed as unknown as SignedPublicJudgeRecord);
  const trusted = new Set([...trustedFingerprints].map((entry) => entry.trim().toLowerCase()));
  const issuerTrusted = keyFingerprint !== null && trusted.has(keyFingerprint);
  const payload = signed.payload as Record<string, unknown> | undefined;
  const expectedVersion = revoked
    ? "dogfood.judge-participation-revocation.v1"
    : "dogfood.judge-participation.v1";
  if (!signatureValid || payload?.version !== expectedVersion) {
    return { status: "invalid", signatureValid: false, issuerTrusted, keyFingerprint, reason: "Signature or payload hash does not verify" };
  }
  if (!issuerTrusted) {
    return { status: "invalid", signatureValid, issuerTrusted, keyFingerprint, reason: "Signer key is not in the trusted fingerprints" };
  }
  return { status: revoked ? "revoked" : "valid", signatureValid, issuerTrusted, keyFingerprint };
}
