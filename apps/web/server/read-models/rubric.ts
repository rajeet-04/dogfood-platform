import { and, db, eq, schema } from "@dogfood/db";

export type PublicRubric = {
  name: string;
  version: number;
  weightSum: number;
  criteria: Array<{
    name: string;
    description: string | null;
    weight: number;
    minScore: number;
    maxScore: number;
    optional: boolean;
  }>;
};

export async function getPublicRubric(
  eventId: string,
): Promise<PublicRubric | null> {
  const rows = await db
    .select()
    .from(schema.rubrics)
    .where(and(eq(schema.rubrics.eventId, eventId), eq(schema.rubrics.active, true)))
    .limit(1);
  const rubric = rows[0];
  if (!rubric) return null;

  const criteria = await db
    .select()
    .from(schema.rubricCriteria)
    .where(eq(schema.rubricCriteria.rubricId, rubric.id))
    .orderBy(schema.rubricCriteria.sortOrder);

  return {
    name: rubric.name,
    version: rubric.version,
    weightSum: criteria.reduce((sum, c) => sum + Number(c.weight), 0),
    criteria: criteria.map((criterion) => ({
      name: criterion.name,
      description: criterion.description,
      weight: Number(criterion.weight),
      minScore: Number(criterion.minScore),
      maxScore: Number(criterion.maxScore),
      optional: criterion.isOptional,
    })),
  };
}
