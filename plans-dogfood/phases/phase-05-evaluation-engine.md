# Phase 5: Evaluation & Judging Engine

## Goal

Judges evaluate assigned projects with a deterministic scoring pipeline and documented cross-judge normalization.

## Database

### evaluations
Assignment ID unique, rubric ID, state, current revision number, started/submitted/locked timestamps, overall comment.

### evaluation_scores
`evaluation_id,criterion_id,score,comment`
PK: `(evaluation_id,criterion_id)`.

### evaluation_revisions
Immutable snapshot:
`evaluation_id,revision_number,scores_json,overall_comment,changed_by,created_at`.

### judging_diagnostics
Optional persisted diagnostics per snapshot/run if official spec needs historical proof.

## Endpoints

- `GET /api/v1/events/:eventId/evaluations/:assignmentId`
- `PUT /api/v1/events/:eventId/evaluations/:assignmentId`
- `POST /api/v1/events/:eventId/evaluations/:assignmentId/submit`
- `POST /api/v1/events/:eventId/evaluations/:assignmentId/lock`
- `GET /api/v1/events/:eventId/judging/progress`
- `GET /api/v1/events/:eventId/judging/diagnostics`

## Services

- `startEvaluation`
- `saveEvaluationDraft`
- `submitEvaluation`
- `lockEvaluation`
- `calculateWeightedScore`
- `normalizeJudgeBatch`
- `calculateCoverageDiagnostics`

## Evaluation state

`ASSIGNED → IN_PROGRESS → SUBMITTED → LOCKED`

## Scoring

For criterion k:
`weighted = score * weight`

Evaluation score:
`S_i = Σ(weight_k × score_ik)`.

## Normalization baseline

Per judge z-score:
`z_ij = (x_ij - mean_j) / sd_j`.

Policy:
- zero variance: neutral normalized contribution + diagnostic;
- batch smaller than minimum: normalization-ineligible;
- missing evaluation remains missing, never becomes zero;
- all behavior deterministic;
- method/version documented in `JUDGING.md`.

## Organizer confidentiality

During JUDGING, progress endpoint returns:
- total assignment count;
- not started;
- in progress;
- submitted;
- per-judge completion;
- per-track completion;
- diagnostics without raw ballot values.

The current plan withholds raw judge scores from organizers until judging lock. The official site role matrix, however, marks organizers as permitted to read own/peer/other-track/aggregate scores and audit data, without stating a lock-time restriction. The official seven-check suite tests judge-vs-judge isolation but does not test organizer score timing. Resolve this conflict against the main-site role matrix in Phase 0 before asserting compliance; never weaken judge-to-judge or judge-to-track isolation.

The official shared fixtures intentionally include a judge who assigns the same score to every project and incomplete review batches. Normalize deterministically, avoid zero-variance division, expose a meaningful diagnostic, and keep missing evaluations absent rather than treating them as zero.

## Tests

- score bounds;
- required criteria completeness;
- locked evaluation immutable;
- peer ballot invisible;
- raw response serialization excludes peer data;
- zero variance;
- minimum batch;
- missing evaluation;
- strict/lenient judge fixture;
- repeated run deterministic.

## UI

Judge:
- queue;
- project detail;
- rubric form;
- autosave/manual save status;
- submit confirmation;
- locked read-only state.

Organizer:
- progress dashboard;
- coverage and normalization diagnostics.

## Exit gate

Three independent judge fixtures can score assigned projects, peer ballots remain isolated, normalization tests are green, and progress is operational.
