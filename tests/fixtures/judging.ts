import type { JudgeScore } from "@dogfood/normalization";

export const strictJudgeBatch: JudgeScore[] = [
  { projectId: "proj-a", score: 3 },
  { projectId: "proj-b", score: 5 },
  { projectId: "proj-c", score: 1 },
];

export const lenientJudgeBatch: JudgeScore[] = [
  { projectId: "proj-a", score: 9 },
  { projectId: "proj-b", score: 7 },
  { projectId: "proj-c", score: 8 },
];

export const zeroVarianceBatch: JudgeScore[] = [
  { projectId: "proj-a", score: 7 },
  { projectId: "proj-b", score: 7 },
  { projectId: "proj-c", score: 7 },
  { projectId: "proj-d", score: 7 },
];

export const partialBatch: JudgeScore[] = [
  { projectId: "proj-a", score: 6 },
  { projectId: "proj-b", score: 4 },
];