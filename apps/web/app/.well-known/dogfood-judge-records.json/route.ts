import { judgeRecordIssuerKeys } from "@dogfood/judging/public-record-ledger-crypto";

export const dynamic = "force-dynamic";

/** Published trust anchor for signed judge participation records. */
export function GET(request: Request): Response {
  const issuer = process.env.APP_URL ?? new URL(request.url).origin;
  return Response.json(judgeRecordIssuerKeys(issuer), {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=300",
    },
  });
}
