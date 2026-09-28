# DOGFOOD Detailed API Contracts

**Status:** Pre-spec. Request names are frozen for planning, but official `spec.md` wins.

## Common rules

All JSON routes use `Content-Type: application/json`. IDs are UUID strings. Unsafe cookie-authenticated operations require CSRF protection. Every response includes `X-Request-Id`. Validation errors return field paths.

Error envelope:

```json
{"error":{"code":"VALIDATION_FAILED","message":"...","requestId":"...","fields":{"title":"Required"}}}
```

## Auth

### POST /api/v1/auth/register
Auth: public  
Body: `{email:string,password:string,displayName:string}`  
201: `{user:{id,email,displayName}}` + session cookie  
Errors: VALIDATION_FAILED, CONFLICT.

### POST /api/v1/auth/login
Auth: public  
Body: `{email,password}`  
200: `{user:{id,email,displayName}}` + session cookie  
Errors: UNAUTHENTICATED only, no email enumeration.

### POST /api/v1/auth/logout
Auth: session  
204, revokes current session.

### GET /api/v1/auth/session
Auth: optional  
200: `{authenticated:boolean,user:null|UserSummary,memberships:MembershipSummary[]}`.

## Events

### GET /api/v1/events
Auth: optional  
Query: `q?,state?,cursor?,limit?`  
200: `{items:EventSummary[],nextCursor:null|string}`.

### POST /api/v1/events
Auth: authenticated organizer-capable/admin  
Body: event basics + timezone + date windows.  
201: EventDetail in DRAFT.  
Errors: FORBIDDEN, VALIDATION_FAILED, CONFLICT.

### GET /api/v1/events/:eventId
Auth: optional  
200: public-safe EventDetail plus actor capabilities when authenticated.

### PATCH /api/v1/events/:eventId
Auth: organizer/admin  
Body: partial mutable config.  
Rules: state-dependent fields cannot be silently changed after dependent activity.  
200: EventDetail.

### POST /api/v1/events/:eventId/transitions
Auth: organizer/admin  
Body: `{toState:EventState}`  
200: `{event,state,transitionedAt}`  
Errors: EVENT_STATE_INVALID, JUDGING_INCOMPLETE where applicable.

## Tracks

### GET /api/v1/events/:eventId/tracks
200: `{items:Track[]}`.

### POST /api/v1/events/:eventId/tracks
Auth: organizer/admin  
Body: `{name,slug,description?,capacity?,sortOrder?}`  
201: Track.

### PATCH /api/v1/events/:eventId/tracks/:trackId
Auth: organizer/admin  
Body: mutable track fields.  
Errors: CONFLICT if incompatible with existing submissions.

### DELETE /api/v1/events/:eventId/tracks/:trackId
Auth: organizer/admin  
204 only when safe; otherwise CONFLICT. Prefer deactivate once referenced.

## Prizes

### GET /api/v1/events/:eventId/prizes
200: prize list.

### POST /api/v1/events/:eventId/prizes
Auth: organizer/admin  
Body: `{name,description?,trackId?,amount?,currency?,sortOrder?}`  
201: Prize.

### PATCH /api/v1/events/:eventId/prizes/:prizeId
Auth: organizer/admin.

### DELETE /api/v1/events/:eventId/prizes/:prizeId
Auth: organizer/admin; reject after publication dependency.

## Submission questions

### GET /api/v1/events/:eventId/submission-questions
Auth: optional according to event visibility  
200: ordered active questions.

### POST /api/v1/events/:eventId/submission-questions
Auth: organizer/admin  
Body: `{label,helpText?,type,required,options?,sortOrder}`.

### PATCH /api/v1/events/:eventId/submission-questions/:questionId
Auth: organizer/admin  
Rules: no incompatible type change after answers exist.

### DELETE /api/v1/events/:eventId/submission-questions/:questionId
Auth: organizer/admin  
Behavior: hard delete only if unreferenced; otherwise deactivate.

## Event membership/invitations

### GET /api/v1/events/:eventId/members
Auth: organizer/admin  
Query: `role?,q?,cursor?,limit?`  
200: member summaries.

### POST /api/v1/events/:eventId/invitations
Auth: organizer/admin  
Body: `{email,role:"JUDGE"|"ORGANIZER",trackIds?:string[],expiresAt?}`  
201: invitation summary, raw token returned only at creation if needed for offline delivery.  
Errors: ROLE_CONFLICT, CONFLICT.

### POST /api/v1/events/:eventId/invitations/:token/accept
Auth: authenticated  
Body: empty  
200: membership.  
Errors: INVITATION_INVALID, ROLE_CONFLICT.

### DELETE /api/v1/events/:eventId/members/:userId
Auth: organizer/admin  
204 for safe deactivation/removal. Preserve historical references.

## Teams

### POST /api/v1/events/:eventId/teams
Auth: participant  
Body: `{name}`  
201: TeamDetail.

### GET /api/v1/events/:eventId/teams/:teamId
Auth: team member/organizer/admin  
200: TeamDetail.

### PATCH /api/v1/events/:eventId/teams/:teamId
Auth: authorized team member  
Body: `{name}`.

### POST /api/v1/events/:eventId/teams/:teamId/invites
Auth: team member with permission  
Body: `{expiresAt?,maxUses?}`  
201: `{inviteUrl,expiresAt,maxUses}`.

### POST /api/v1/events/:eventId/team-invites/:token/join
Auth: participant  
200: TeamDetail.  
Errors: INVITATION_INVALID, TEAM_RULE_VIOLATION.

### POST /api/v1/events/:eventId/teams/:teamId/leave
Auth: member  
204. Reject if it violates ownership/submission rules.

### DELETE /api/v1/events/:eventId/teams/:teamId/members/:userId
Auth: owner/organizer/admin according to official policy.

## Assets

### POST /api/v1/events/:eventId/assets
Auth: event member  
Multipart: `file`, `purpose`  
201: `{id,url,mimeType,byteSize,sha256}`  
Errors: VALIDATION_FAILED for size/MIME.

### GET /api/v1/assets/:assetId
Auth: public if attached to public content, otherwise authorized  
Returns file with safe content headers.

### DELETE /api/v1/events/:eventId/assets/:assetId
Auth: owner/organizer  
204 if unreferenced/unlocked.

## Projects

### POST /api/v1/events/:eventId/projects
Auth: participant on team  
Body:
```json
{
  "teamId":"uuid","title":"...","tagline":"...","description":"...",
  "thumbnailAssetId":null,"galleryAssetIds":[],
  "demoVideoUrl":null,"repositoryUrl":null,"liveUrl":null,
  "techTags":[],"trackId":null,
  "answers":[{"questionId":"uuid","value":"..."}]
}
```
201: `{project,revision}`.

### GET /api/v1/events/:eventId/projects/:projectId
Auth: team/organizer/admin. Judge must use assignment route.  
200: private ProjectDetail.

### POST /api/v1/events/:eventId/projects/:projectId/revisions
Auth: authorized team member  
Body: full new revision payload.  
201: immutable ProjectRevision.

### GET /api/v1/events/:eventId/projects/:projectId/revisions
Auth: team/organizer/admin  
200: revision summaries.

### POST /api/v1/events/:eventId/projects/:projectId/submit
Auth: team member  
200: submitted project.  
Errors: DEADLINE_PASSED, SUBMISSION_INCOMPLETE, EVENT_STATE_INVALID.

### POST /api/v1/events/:eventId/projects/:projectId/withdraw
Auth: team/organizer according to state  
200: withdrawn project.

## Gallery

### GET /api/v1/events/:eventId/gallery
Auth: public  
Query: `q?,track?,tag?,sort?,cursor?,limit?`  
200: only public/submitted ProjectCard fields.

### GET /api/v1/events/:eventId/gallery/:projectId
Auth: public  
200: public project revision, team display info, track, permitted comments/voting metadata only.

## Rubrics

### GET /api/v1/events/:eventId/rubrics
Auth: organizer/admin  
200: versions.

### POST /api/v1/events/:eventId/rubrics
Auth: organizer/admin  
Body: `{name}`  
201.

### POST /api/v1/events/:eventId/rubrics/:rubricId/criteria
Auth: organizer/admin  
Body: `{name,description?,weight,minScore,maxScore,sortOrder}`.

### PATCH /api/v1/events/:eventId/rubrics/:rubricId/criteria/:criterionId
Auth: organizer/admin  
Errors: CONFLICT after judging activity unless versioning workflow.

### DELETE /api/v1/events/:eventId/rubrics/:rubricId/criteria/:criterionId
Auth: organizer/admin before use.

### POST /api/v1/events/:eventId/rubrics/:rubricId/activate
Auth: organizer/admin  
200: active rubric.  
Errors: RUBRIC_INCOMPLETE.

## Judge assignments

### POST /api/v1/events/:eventId/judge-assignments
Auth: organizer/admin  
Body: `{judgeId,projectId}` or `{assignments:[...]}`  
201: assignment(s).

### POST /api/v1/events/:eventId/judge-assignments/generate
Auth: organizer/admin  
Body: `{strategy,reviewsPerProject,judgeIds,trackIds?,commit:false}`  
200: `{proposal,coverage,warnings}`.  
With `commit:true`, creates assignments atomically.

### GET /api/v1/events/:eventId/judge-assignments
Auth: organizer/admin  
Filters: judge/project/track/status.

### DELETE /api/v1/events/:eventId/judge-assignments/:assignmentId
Auth: organizer/admin  
204 only before evaluation activity.

### GET /api/v1/events/:eventId/judge-queue
Auth: judge  
200: current judge assignments only.

### GET /api/v1/events/:eventId/judge-queue/:assignmentId
Auth: assigned judge  
200: project-safe detail + active rubric + own evaluation state. Never peer scores.

## Evaluations

### GET /api/v1/events/:eventId/evaluations/:assignmentId
Auth: assigned judge; organizer/admin only according to locked-state policy  
200: caller-permitted evaluation.

### PUT /api/v1/events/:eventId/evaluations/:assignmentId
Auth: assigned judge  
Body: `{scores:[{criterionId,score,comment?}],overallComment?}`  
200: draft evaluation + save version.

### POST /api/v1/events/:eventId/evaluations/:assignmentId/submit
Auth: assigned judge  
Body: optional final payload or empty if saved draft is canonical  
200: submitted evaluation.  
Errors: INVALID_SCORE, EVALUATION_LOCKED, DEADLINE_PASSED.

### POST /api/v1/events/:eventId/evaluations/:assignmentId/lock
Auth: organizer/admin/system transition  
200: locked evaluation.

## Judging progress

### GET /api/v1/events/:eventId/judging/progress
Auth: organizer/admin  
200: assignment totals, per-judge completion, per-track completion. Active raw scores omitted.

### GET /api/v1/events/:eventId/judging/diagnostics
Auth: organizer/admin  
200: coverage, normalization eligibility, zero-variance diagnostics. Raw ballots omitted while policy requires confidentiality.

## Rankings/results

### POST /api/v1/events/:eventId/rankings
Auth: organizer/admin  
Body: `{normalizationStrategy,minimumBatchSize,tieBreakers}`  
201: immutable snapshot.

### GET /api/v1/events/:eventId/rankings
Auth: organizer/admin  
200: snapshot summaries.

### GET /api/v1/events/:eventId/rankings/:snapshotId
Auth: organizer/admin or public when published  
200: persisted snapshot.

### POST /api/v1/events/:eventId/rankings/:snapshotId/publish
Auth: organizer/admin  
200: published result metadata + event state.

### GET /api/v1/events/:eventId/results
Auth: public only after publication  
200: published placements/prizes.

## Exports

Every export: organizer/admin, `text/csv; charset=utf-8`, stable headers, RFC4180 escaping.

- GET /api/v1/events/:eventId/exports/participants.csv
- GET /api/v1/events/:eventId/exports/teams.csv
- GET /api/v1/events/:eventId/exports/projects.csv
- GET /api/v1/events/:eventId/exports/judge-assignments.csv
- GET /api/v1/events/:eventId/exports/evaluations.csv
- GET /api/v1/events/:eventId/exports/results.csv

## Audit

### GET /api/v1/events/:eventId/audit
Auth: organizer/admin  
Filters: actor/action/resource/date/cursor.

### GET /api/v1/events/:eventId/audit/:auditEventId
Auth: organizer/admin.

## Operations

### GET /api/health
Liveness only, 200 if process runs.

### GET /api/ready
Readiness, verifies database and required migrations/seed readiness.
