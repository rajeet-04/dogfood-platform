import {
  generatePairwiseRankingSnapshot,
  getPairwiseRankingSnapshot,
} from "@dogfood/ranking";
import { DogfoodError, z } from "@dogfood/validation";

import { api, json, readJsonBody, requireApiActor, throwValidation } from "../../../../../../server/api/http";

const inputSchema = z.object({
  projectIds: z.array(z.string().uuid()).min(2).max(500).optional(),
  maxIterations: z.number().int().min(1).max(100_000).optional(),
  tolerance: z.number().positive().max(0.01).optional(),
  priorWins: z.number().positive().max(10).optional(),
});

/** Persist a deterministic ranking from each judge's latest saved choice. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> },
): Promise<Response> {
  return api(request, async () => {
    const { eventId } = await params;
    const actor = await requireApiActor(request);
    const parsed = inputSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) throwValidation(parsed.error.issues);
    const { projectIds, ...options } = parsed.data;
    const snapshot = await generatePairwiseRankingSnapshot(actor, eventId, projectIds, options);
    return json({ snapshot, ranking: snapshot.results }, { status: 201 });
  });
}

/** Read an exact persisted snapshot; unpublished snapshots remain organizer-only. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> },
): Promise<Response> {
  return api(request, async () => {
    const { eventId } = await params;
    const actor = await requireApiActor(request);
    const snapshotId = new URL(request.url).searchParams.get("snapshotId");
    if (!snapshotId) throw new DogfoodError("VALIDATION_FAILED", "snapshotId is required");
    const snapshot = await getPairwiseRankingSnapshot(actor, eventId, snapshotId);
    return json({ snapshot });
  });
}
