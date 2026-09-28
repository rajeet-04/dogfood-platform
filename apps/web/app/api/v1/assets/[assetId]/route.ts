import { readProjectAsset } from "../../../../../server/assets";
import { api, getActorFromRequest } from "../../../../../server/api/http";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ assetId: string }> },
): Promise<Response> {
  return api(request, async () => {
    const { assetId } = await params;
    const { asset, bytes } = await readProjectAsset(assetId, await getActorFromRequest(request));
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": asset.mimeType,
        "Content-Length": String(bytes.byteLength),
        "Content-Disposition": "inline",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  });
}
