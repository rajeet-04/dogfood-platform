# DOGFOOD Service Interface Catalog

Signatures are planning contracts and may be refined by official spec, but naming stays consistent across route and test planning.

## auth
- `registerUser(input): Promise<User>`
- `authenticateCredentials(input): Promise<User>`
- `createSession(userId): Promise<SessionToken>`
- `resolveSession(rawToken): Promise<Actor|null>`
- `revokeSession(sessionId): Promise<void>`

## permissions
- `can(actor, action, context): boolean`
- `requirePermission(actor, action, context): void`

## events
- `createEvent(actor,input): Promise<Event>`
- `updateEventConfiguration(actor,eventId,input): Promise<Event>`
- `transitionEvent(actor,eventId,toState): Promise<Event>`
- `createTrack/updateTrack/deactivateTrack`
- `createPrize/updatePrize/deletePrize`
- `createSubmissionQuestion/updateSubmissionQuestion/deactivateSubmissionQuestion`
- `inviteEventMember/acceptEventInvitation/deactivateEventMember`

## teams
- `createTeam(actor,eventId,input)`
- `updateTeam(actor,teamId,input)`
- `createTeamInvite(actor,teamId,input)`
- `joinTeam(actor,eventId,rawInviteToken)`
- `leaveTeam(actor,teamId)`
- `removeTeamMember(actor,teamId,userId)`

## assets
- `storeAsset(actor,eventId,file,purpose)`
- `resolveAsset(actorOrVisitor,assetId)`
- `deleteAsset(actor,eventId,assetId)`

## submissions
- `createProject(actor,eventId,input)`
- `reviseProject(actor,eventId,projectId,input)`
- `submitProject(actor,eventId,projectId)`
- `withdrawProject(actor,eventId,projectId)`
- `validateSubmissionCompleteness(event,revision)`

## gallery
- `searchGallery(eventId,filters): Promise<CursorPage<ProjectCard>>`
- `getPublicProject(eventId,projectId): Promise<PublicProjectDetail>`

## rubrics
- `createRubric(actor,eventId,input)`
- `addCriterion(actor,rubricId,input)`
- `updateCriterion(actor,criterionId,input)`
- `removeCriterion(actor,criterionId)`
- `activateRubric(actor,eventId,rubricId)`

## assignment
- `assignJudge(actor,eventId,input)`
- `generateAssignmentProposal(actor,eventId,config)`
- `commitAssignmentProposal(actor,eventId,proposal)`
- `removeAssignment(actor,eventId,assignmentId)`
- `getJudgeQueue(actor,eventId)`

## judging
- `startEvaluation(actor,eventId,assignmentId)`
- `saveEvaluationDraft(actor,eventId,assignmentId,input)`
- `submitEvaluation(actor,eventId,assignmentId,input?)`
- `lockEvaluation(actor,eventId,assignmentId)`
- `getJudgingProgress(actor,eventId)`
- `getJudgingDiagnostics(actor,eventId)`

## scoring
- `calculateWeightedScore(scores): WeightedScoreResult`

## normalization
- `normalizeJudgeBatch(scores,config): NormalizedBatch`

## ranking
- `rankProjects(input,config): RankingResult`
- `generateRankingSnapshot(actor,eventId,config): Promise<RankingSnapshot>`
- `publishRankingSnapshot(actor,eventId,snapshotId): Promise<PublishedResults>`

## exports
- `exportParticipantsCsv(actor,eventId)`
- `exportTeamsCsv(actor,eventId)`
- `exportProjectsCsv(actor,eventId)`
- `exportJudgeAssignmentsCsv(actor,eventId)`
- `exportEvaluationsCsv(actor,eventId)`
- `exportResultsCsv(actor,eventId)`

## audit
- `appendAuditEvent(tx,event): Promise<void>`
- `queryAudit(actor,eventId,filters)`

## Dependency direction

Delivery layer may depend on services. Services may depend on domain policy and repository interfaces. Pure scoring/normalization/ranking functions do not import application, HTTP, React, or database modules.
