import {
  issuePublicJudgeRecords,
  listPublishedPublicJudgeRecords,
  reissuePublicJudgeRecord,
  revokePublicJudgeRecord,
} from "@dogfood/judging/public-record-ledger";
import { DogfoodError, z } from "@dogfood/validation";

import {
  api,
  json,
  readJsonBody,
  requireApiActor,
  throwValidation,
} from "../../../../../../server/api/http";

const ledgerActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("issue") }),
  z.object({ action: z.literal("reissue"), judgeId: z.string().uuid() }),
  z.object({
    action: z.literal("revoke"),
    recordId: z.string().uuid(),
    reason: z.string().trim().min(3).max(500),
  }),
]);

export async function GET(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> },
): Promise<Response> {
  return api(request, async () => {
    const { eventId } = await params;
    const records = await listPublishedPublicJudgeRecords(eventId);
    return json({ records });
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> },
): Promise<Response> {
  return api(request, async () => {
    const { eventId } = await params;
    const actor = await requireApiActor(request);
    const parsed = ledgerActionSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) throwValidation(parsed.error.issues);

    if (parsed.data.action === "issue") {
      if (!process.env.JUDGE_RECORD_SIGNING_PRIVATE_KEY) {
        return json(
          { error: "Judge record signing is not configured" },
          { status: 503 },
        );
      }
      const result = await issuePublicJudgeRecords(
        actor,
        eventId,
        process.env.JUDGE_RECORD_SIGNING_PRIVATE_KEY,
      );
      return json(result, { status: 201 });
    }
    if (parsed.data.action === "reissue") {
      if (!process.env.JUDGE_RECORD_SIGNING_PRIVATE_KEY) {
        return json(
          { error: "Judge record signing is not configured" },
          { status: 503 },
        );
      }
      const record = await reissuePublicJudgeRecord(
        actor,
        eventId,
        parsed.data.judgeId,
        process.env.JUDGE_RECORD_SIGNING_PRIVATE_KEY,
      );
      return json({ record }, { status: 201 });
    }
    if (parsed.data.action === "revoke") {
      if (!process.env.JUDGE_RECORD_SIGNING_PRIVATE_KEY) {
        return json(
          { error: "Judge record signing is not configured" },
          { status: 503 },
        );
      }
      const revocation = await revokePublicJudgeRecord(
        actor,
        eventId,
        parsed.data.recordId,
        parsed.data.reason,
        process.env.JUDGE_RECORD_SIGNING_PRIVATE_KEY,
      );
      return json({ revocation });
    }
    throw new DogfoodError("VALIDATION_FAILED", "Unknown judge record action");
  });
}
