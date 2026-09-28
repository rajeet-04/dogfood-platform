import { DogfoodError } from "@dogfood/validation";

import { uploadProjectAsset } from "../../../../../../server/assets";
import { api, json, requireApiActor } from "../../../../../../server/api/http";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> },
): Promise<Response> {
  return api(request, async () => {
    const actor = await requireApiActor(request);
    const { eventId } = await params;
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      throw new DogfoodError("VALIDATION_FAILED", "Send an image in multipart form data");
    }
    const file = form.get("file");
    if (!(file instanceof File)) {
      throw new DogfoodError("VALIDATION_FAILED", "Choose a PNG or JPEG image", { file: "Image required" });
    }
    const asset = await uploadProjectAsset(actor, eventId, file);
    return json({ asset: {
      id: asset.id,
      eventId: asset.eventId,
      url: `/api/v1/assets/${asset.id}`,
      mimeType: asset.mimeType,
      byteSize: asset.byteSize,
      sha256: asset.sha256,
      originalName: asset.originalName,
    } }, { status: 201 });
  });
}
