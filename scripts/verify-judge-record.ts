/**
 * Independently verify a DOGFOOD judge participation record.
 *
 *   bun scripts/verify-judge-record.ts <record-url> [--pin <sha256-fingerprint>]...
 *
 * Fetches the record, recomputes its payload hash, checks the Ed25519 signature
 * locally, and trusts the signer only if its fingerprint is pinned with --pin
 * or published at the issuer origin's /.well-known/dogfood-judge-records.json.
 * The server's own `issuerTrusted` flag is ignored. Exit code 0 = valid.
 */
import {
  JUDGE_RECORD_KEYS_PATH,
  verifyJudgeRecordResponse,
} from "../packages/judging/src/public-record-ledger-crypto";

const args = process.argv.slice(2);
const recordUrl = args.find((arg, index) => !arg.startsWith("--") && args[index - 1] !== "--pin");
const pins = args.flatMap((arg, index) => (args[index - 1] === "--pin" ? [arg] : []));
if (!recordUrl) {
  console.error("usage: bun scripts/verify-judge-record.ts <record-url> [--pin <fingerprint>]...");
  process.exit(2);
}

const body = await (await fetch(recordUrl)).json();
let trusted = pins;
let source = "--pin";
if (!pins.length) {
  const keysUrl = new URL(JUDGE_RECORD_KEYS_PATH, recordUrl);
  const keys = (await (await fetch(keysUrl)).json()) as { trustedFingerprints?: string[] };
  trusted = keys.trustedFingerprints ?? [];
  source = keysUrl.toString();
}

const verdict = verifyJudgeRecordResponse(body, trusted);
console.log(JSON.stringify({ record: recordUrl, trustSource: source, ...verdict }, null, 2));
process.exit(verdict.status === "invalid" ? 1 : 0);
