# DOGFOOD Architecture v1

**Status:** Approved  
**Architecture style:** Modular monolith

**Competition conformance note:** The event site's official role matrix grants organizers access to scores, peer scores, other-track data, aggregates, and audit. The organizer raw-score lock rule below is a stricter pre-event project policy and is not verified by the seven-check suite. Phase 0 must resolve this policy against the published event-site matrix before claiming exact conformance.

## High-level topology

```text
Browser
  │
  ▼
Next.js
  ├─ Presentation
  ├─ Server Actions / REST API
  ├─ Application Services
  │   ├─ Events
  │   ├─ Teams
  │   ├─ Submissions
  │   ├─ Judging
  │   ├─ Rankings
  │   ├─ Audit
  │   └─ Exports
  ├─ Domain
  │   ├─ Permission Policy
  │   ├─ Deadline Policy
  │   ├─ Scoring Engine
  │   ├─ Normalization Engine
  │   └─ Ranking Engine
  └─ Infrastructure
      ├─ PostgreSQL
      ├─ Drizzle
      └─ Local persistent storage
```

## Runtime

```text
docker compose
├── web
└── postgres
```

No mandatory third-party runtime dependency is permitted for the required competition path.

## Planned repository structure

```text
apps/
  web/
    app/
    components/
    server/

packages/
  db/
  auth/
  permissions/
  events/
  teams/
  submissions/
  judging/
  scoring/
  normalization/
  ranking/
  audit/
  validation/
  shared/

tests/
  unit/
  integration/
  acceptance/
  fixtures/
```

## Role model

Global:
- PLATFORM_ADMIN

Per event:
- ORGANIZER
- JUDGE
- PARTICIPANT

Invariant: a user cannot be both ORGANIZER and JUDGE within the same event.

## Authorization

Permissions are evaluated against action + resource context, not role alone.

Example:

```ts
can(actor, "evaluation.submit", {
  eventId,
  assignmentId,
  projectId,
  eventState,
})
```

A judge reaches a project through an explicit JudgeAssignment. Knowing the project ID never grants evaluation access.

## Core entities

- User
- Session
- Event
- EventMembership
- Team
- TeamMember
- Project
- ProjectRevision
- Rubric
- RubricCriterion
- JudgeAssignment
- Evaluation
- EvaluationScore
- EvaluationRevision
- RankingSnapshot
- AuditEvent

## Critical relational constraints

```text
UNIQUE(event_id, user_id)                EventMembership
UNIQUE(team_id, user_id)                 TeamMember
UNIQUE(event_id, team_id)                Project
UNIQUE(event_id, project_slug)           Project
UNIQUE(event_id, judge_id, project_id)   JudgeAssignment
UNIQUE(evaluation_id, criterion_id)      EvaluationScore
UNIQUE(project_id, revision_number)      ProjectRevision
UNIQUE(evaluation_id, revision_number)   EvaluationRevision
```

Competition history uses deletion-restrictive relationships. Sessions may expire/delete normally.

## State machines

### Event

```text
DRAFT
→ REGISTRATION
→ SUBMISSIONS_OPEN
→ SUBMISSIONS_CLOSED
→ JUDGING
→ RESULTS_READY
→ PUBLISHED
→ ARCHIVED
```

### Project

```text
DRAFT → SUBMITTED → LOCKED
```

### Evaluation

```text
ASSIGNED → IN_PROGRESS → SUBMITTED → LOCKED
```

## Mutation invariant

```text
authenticate
→ authorize
→ validate
→ check state/deadline
→ BEGIN
→ mutation
→ audit
→ COMMIT
```

Business mutation and corresponding audit insertion are part of the same transaction.

## Judging engine

The judging workflow, scoring, normalization, and ranking are separate concerns.

Weighted score:

```text
S_i = Σ(w_k × x_ik)
```

Initial normalization strategy:

```text
z_ij = (x_ij - μ_j) / σ_j
```

Rules:
- Zero variance yields neutral normalized contribution and `ZERO_VARIANCE_BATCH` diagnostic.
- Batches smaller than the configured minimum are normalization-ineligible.
- Missing evaluations are missing data, never implicit zero.
- Ranking output is deterministic.
- Algorithm versions are persisted with every ranking snapshot.

Persist:
- SCORING_VERSION
- NORMALIZATION_VERSION
- RANKING_VERSION

## Organizer visibility

During active judging:
- Organizer sees completion/progress metrics.
- Organizer does not see individual raw judge scores.

After judging lock:
- Organizer may inspect raw evaluations.
- Sensitive reads may emit audit events.

## API boundary

```text
Server Actions ─┐
                ├─ Application Services → Domain → Repositories
REST /api/v1 ───┘
```

Handlers remain thin. Business rules are not duplicated across UI and API.

## Security threats explicitly handled

- Role/permission escalation
- IDOR
- Cross-event resource access
- Judge score leakage
- Deadline bypass
- Invalid rubric/score submission
- Audit bypass
- Ranking configuration tampering
- Session compromise

## Testing posture

Unit tests focus on permissions, state transitions, deadlines, scoring, normalization, ranking, and ties.

Integration tests focus on database constraints, transactionality, event isolation, judge isolation, sessions, immutable revisions, and audit writes.

Acceptance tests cover participant, judge, and organizer workflows end-to-end.
