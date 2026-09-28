# Phase 6: Ranking, Results, CSV Export & Audit

## Goal

Turn completed judging into reproducible published results and make every operational dataset portable.

## Database

### ranking_snapshots
- id
- event_id
- scoring_version
- normalization_version
- ranking_version
- configuration JSONB
- results JSONB
- generated_by
- generated_at
- published_at

### audit_events
- id
- event_id
- actor_id
- action
- resource_type
- resource_id
- metadata JSONB
- created_at

Append-only from application perspective.

## Endpoints

Ranking:
- `POST /api/v1/events/:eventId/rankings`
- `GET /api/v1/events/:eventId/rankings`
- `GET /api/v1/events/:eventId/rankings/:snapshotId`
- `POST /api/v1/events/:eventId/rankings/:snapshotId/publish`
- `GET /api/v1/events/:eventId/results`

Exports:
- `GET /api/v1/events/:eventId/exports/participants.csv`
- `GET /api/v1/events/:eventId/exports/teams.csv`
- `GET /api/v1/events/:eventId/exports/projects.csv`
- `GET /api/v1/events/:eventId/exports/judge-assignments.csv`
- `GET /api/v1/events/:eventId/exports/evaluations.csv`
- `GET /api/v1/events/:eventId/exports/results.csv`

Audit:
- `GET /api/v1/events/:eventId/audit`
- `GET /api/v1/events/:eventId/audit/:auditEventId`

## Ranking pipeline

```text
submitted evaluations
→ weighted score
→ normalization
→ per-project aggregation
→ configured tie policy
→ immutable RankingSnapshot
→ organizer review
→ publish
```

Stable project ID may be used only as deterministic display order after competitive tie rules, not as a meaningful tiebreak.

## Export engineering

- RFC4180-compatible escaping.
- UTF-8.
- stable documented headers.
- deterministic column order.
- explicit empty export behavior.
- sensitive exports audited.
- never bypass read authorization.

## Audit transactions

Critical actions:
- event transition;
- team join/remove;
- project submit/revise/withdraw;
- judge assignment/reassignment;
- evaluation submit/lock;
- ranking generation/publication;
- sensitive export;
- privileged raw evaluation read after lock.

## Tests

- snapshot never recomputes on read;
- identical input generates identical result content;
- publishing wrong-event snapshot denied;
- CSV comma/quote/newline handling;
- rollback leaves neither mutation nor phantom audit;
- audit cannot be updated/deleted through application services;
- results hidden before publication.

## UI

Organizer:
- ranking preview;
- diagnostics;
- publish action;
- export center;
- searchable audit log.

Public:
- results page after publication.

## Exit gate

T2 lifecycle completes end-to-end and all official export requirements pass.
