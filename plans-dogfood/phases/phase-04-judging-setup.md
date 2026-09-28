# Phase 4: Judging Setup

## Goal

Organizers can invite judges, define weighted rubrics, and assign projects manually or algorithmically without violating track isolation.

## Database

### rubrics
Event, name, version, active, timestamps.

### rubric_criteria
Rubric, name, description, weight, min/max, sort order.

### judge_track_scopes
`event_id,judge_id,track_id`
Used when judges are restricted to tracks.

### judge_assignments
`id,event_id,judge_id,project_id,status,assigned_by,assigned_at`
Unique: `(event_id,judge_id,project_id)`.

### judge_recusals
`event_id,judge_id,project_id,reason,created_by,created_at`
Unique: `(event_id,judge_id,project_id)`. Organizer-declared or judge self-declared. Checked as a hard exclusion before any assignment strategy runs.

## Endpoints

Rubrics:
- `GET /api/v1/events/:eventId/rubrics`
- `POST /api/v1/events/:eventId/rubrics`
- `POST /api/v1/events/:eventId/rubrics/:rubricId/criteria`
- `PATCH /api/v1/events/:eventId/rubrics/:rubricId/criteria/:criterionId`
- `DELETE /api/v1/events/:eventId/rubrics/:rubricId/criteria/:criterionId`
- `POST /api/v1/events/:eventId/rubrics/:rubricId/activate`

Assignments:
- `POST /api/v1/events/:eventId/judge-assignments`
- `POST /api/v1/events/:eventId/judge-assignments/generate`
- `GET /api/v1/events/:eventId/judge-assignments`
- `DELETE /api/v1/events/:eventId/judge-assignments/:assignmentId`
- `GET /api/v1/events/:eventId/judge-queue`
- `GET /api/v1/events/:eventId/judge-queue/:assignmentId`

Recusals:
- `POST /api/v1/events/:eventId/judge-recusals`
- `GET /api/v1/events/:eventId/judge-recusals`
- `DELETE /api/v1/events/:eventId/judge-recusals/:recusalId`

## Assignment algorithms

Required baseline:
- manual;
- round-robin batch assignment;
- balanced-by-track assignment.

Recusals are a hard constraint: no strategy may assign a judge to a project they are recused from. Checked before track scope, for both manual and generated assignments.

Generator must support dry-run before commit.

Inputs:
`judgeIds,trackIds,reviewsPerProject,strategy`. Recusals are read from `judge_recusals`, not passed as a generator input — organizers manage them separately as standing exclusions.

Output:
proposal + coverage diagnostics.

## Rubric rules

- positive weights;
- max > min;
- active rubric non-empty;
- total weight exactly normalized target (1.0 or 100 according to official spec);
- incompatible edits after judging starts create a new version or are rejected.

## Isolation rules

- judge queue only contains current judge assignments;
- assignment route returns only safe project fields;
- track-scoped judge cannot receive another track;
- recused judge never appears in generated or manual assignments for that project, regardless of strategy;
- no peer evaluation data is joined into judge queries.

## Tests

- generated coverage count;
- balanced assignment determinism;
- no judge assigned outside track scope;
- recused judge excluded from generated assignments under every strategy;
- manual assignment attempt against an existing recusal is rejected;
- unassigned project access denied;
- invalid rubric rejected;
- rubric mutation after judging start rejected/versioned;
- assignment removal after evaluation activity rejected.

## UI

Organizer:
- judge invitation/status;
- rubric builder;
- assignment table;
- recusal list/management;
- dry-run assignment preview;
- coverage warnings.

Judge:
- queue shell with no scores yet.

## Exit gate

Every project has required assignment coverage, judge queue isolation passes negative tests, and rubric is frozen for active judging.
