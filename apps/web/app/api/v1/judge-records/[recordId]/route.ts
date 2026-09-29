import { getPublicJudgeRecordStatus } from "@dogfood/judging/public-record-ledger";

import { api, json } from "../../../../../server/api/http";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ recordId: string }> },
): Promise<Response> {
  return api(request, async () => {
    const { recordId } = await params;
    const result = await getPublicJudgeRecordStatus(recordId);
    if (result.status === "revoked") {
      return json(
        {
          status: result.status,
          revocationReceipt: result.receipt,
          trustStatus: result.receipt.issuerTrusted ? "trusted" : "untrusted-key",
        },
        { status: 410 },
      );
    }
    return json({
      status: result.status,
      record: result.record,
      trustStatus: result.record.issuerTrusted ? "trusted" : "untrusted-key",
    });
  });
}
