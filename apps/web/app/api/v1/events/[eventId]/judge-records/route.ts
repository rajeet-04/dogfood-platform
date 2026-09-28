import { createHash, createPublicKey } from "node:crypto";

import {
  listPublicJudgeRecords,
  signPublicJudgeRecord,
} from "@dogfood/judging/public-records";

import { api, json } from "../../../../../../server/api/http";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> },
): Promise<Response> {
  const privateKey = process.env.JUDGE_RECORD_SIGNING_PRIVATE_KEY;
  return api(request, async () => {
    if (!privateKey) {
      return json(
        { error: "Judge record signing is not configured" },
        { status: 503 },
      );
    }
    const { eventId } = await params;
    const records = await listPublicJudgeRecords(eventId);
    const signedRecords = records.map((payload) => ({
      payload,
      signature: signPublicJudgeRecord(payload, privateKey).signature,
    }));
    const publicKey = createPublicKey(privateKey.replace(/\\n/g, "\n"))
      .export({ type: "spki", format: "pem" })
      .toString();

    return json({
      algorithm: "Ed25519",
      keyId: createHash("sha256").update(publicKey).digest("hex").slice(0, 24),
      publicKey,
      records: signedRecords,
    });
  });
}
