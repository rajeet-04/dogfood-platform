import { db, eq, schema } from "@dogfood/db";
import { grantEventMembership } from "@dogfood/events";
import { DogfoodError, z } from "@dogfood/validation";

import {
  api,
  json,
  readJsonBody,
  requireApiActor,
  throwValidation,
} from "../../../../../../server/api/http";

const createMemberSchema = z.object({
  email: z.string().trim().email().max(320),
  role: z.enum(["JUDGE", "ORGANIZER"]),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> },
): Promise<Response> {
  return api(request, async () => {
    const { eventId } = await params;
    const actor = await requireApiActor(request);
    const parsed = createMemberSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) throwValidation(parsed.error.issues);

    const [user] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.email, parsed.data.email))
      .limit(1);
    if (!user) {
      throw new DogfoodError("NOT_FOUND", "No account found with that email");
    }

    const membership = await grantEventMembership(
      actor,
      eventId,
      user.id,
      parsed.data.role,
    );
    return json({ membership }, { status: 201 });
  });
}
