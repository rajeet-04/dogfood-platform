export {
  createProject,
  reviseProject,
  submitProject,
  withdrawProject,
  lockProject,
  lockAllProjects,
  assertSubmissionWindow,
  assertProjectUnlocked,
  validateSubmissionCompleteness,
} from "./service";
export type {
  CreateProjectInput,
  ProjectDetail,
  RevisionInput,
} from "./service";