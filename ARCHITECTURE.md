# DOGFOOD Architecture

Self-hosted hackathon submission and judging platform. A modular monolith: one
Next.js application with bounded domain packages, PostgreSQL, and Drizzle.
Versioned against the approved planning pack (`01-architecture-v1.md`).

## Runtime topology

```text
Browser
  │
  ▼
Next.js (apps/web)
  ├─ Presentation        App Router pages + Server Actions
  ├─ REST API            thin /api/v1 + /api/health + /api/ready adapters
  ├─ Application services packages/events, teams, submissions, judging,
  │                       ranking, audit, exports
  ├─ Domain/pure engines packages/scoring, normalization, ranking
  │                       permissions, validation, shared
  └─ Infrastructure      PostgreSQL 17 via Drizzle ORM (packages/db)
```

Runtime services (Docker Compose):

```text
docker compose up
├── db   postgres:17   (port 5432)
└── web  Next.js 16    (port 3000)
```

No mandatory third-party cloud service is used on the required path. Health
and readiness endpoints are provided at `/api/health` and `/api/ready`.

## Repository layout

```text
apps/web/          Next.js app: app/, components/, server/ (sessions, actions, api)
packages/
  db/              Drizzle client, schema, migrations, seed entry
  auth/            Password hashing (Argon2id) and opaque session tokens
  permissions/     Event-scoped action policy engine (can / requirePermission)
  events/          Events, lifecycle state machine, memberships
  teams/           Team lifecycle and membership
  submissions/     Projects with immutable revisions, deadlines
  judging/         Rubrics, judge assignments, evaluations, revision history
  audit/           Append-only transactional audit trail
  exports/         CSV exports over authorized read models
  scoring/         Pure weighted scoring (no db/framework imports)
  normalization/   Pure z-score/none normalization (no db/framework imports)
  ranking/         Pure deterministic ranking + snapshot service
  validation/      Zod boundaries + stable typed error catalog
  shared/          Domain-agnostic types
tests/             unit / integration / acceptance / fixtures
```

Boundary rule: `scoring`, `normalization`, and pure `ranking` never import
framework or database code.

## Role model and authorization

Global role: platform admin (`isPlatformAdmin`). Per-event roles: ORGANIZER,
JUDGE, PARTICIPANT. A user cannot be both ORGANIZER and JUDGE in the same event.

Permissions are evaluated as `can(actor, action, context)` where context
carries `eventId`, `resourceEventId`, roles, event state, and ownership flags.
Every protected object is event-scoped; presenting an ID from another event
returns denied-typed errors and never another event's payload. Judges reach a
project only through an explicit `JudgeAssignment`. No route or component
inlines role checks for protected business actions.

## State machines

Event: `DRAFT → REGISTRATION → SUBMISSIONS_OPEN → SUBMISSIONS_CLOSED →
JUDGING → RESULTS_READY → PUBLISHED → ARCHIVED` (enforced by
`packages/events/src/domain.ts`).

Project: `DRAFT → SUBMITTED`; evaluation: `IN_PROGRESS → SUBMITTED → LOCKED`
with `ASSIGNED` on the judge assignment.

## Mutation invariant

Every critical mutation follows:

```text
authenticate → authorize → validate → state/deadline check
→ BEGIN → mutation → audit insert → COMMIT
```

Business mutation and its audit event share one SQL transaction
(`packages/audit/src/service.ts`); a failed transaction rolls back both.

## Judging engine

Weighted scoring, normalization, and ranking are separate pure functions
pipelined by `packages/ranking/src/service.ts`. Details and math live in
`JUDGING.md`. Every generated snapshot persists scoring, normalization, and
ranking versions plus configuration; re-reading a snapshot never recomputes it.

## Organizer confidentiality

During active judging an organizer sees completion/progress only. Individual
raw judge scores are withheld until the evaluation is locked (enforced server
side; organizer `evaluation:read` requires `judgingLocked === true`).

## API surface

`/api/v1` adapters stay thin: parse, authenticate, invoke application service,
map typed errors. Business rules are not duplicated between UI and API. Error
responses share the stable envelope in `apps/web/server/errors/map-error.ts`:

```json
{ "error": { "code": "EVALUATION_LOCKED", "message": "...", "requestId": "..." } }
```

## Security assumptions and handled threats

- Server/database time is authoritative for deadlines; browser clocks never are.
- Sessions are opaque random tokens stored hashed server-side; cookie is
  Secure, HttpOnly, SameSite=Lax.
- Passwords are Argon2id hashes only.
- Addressed threats: role escalation, IDOR, cross-event access, judge score
  leakage, deadline bypass, invalid rubric/score submission, audit bypass,
  ranking configuration tampering, session compromise.
- Audit events have no update/delete API; application code can only insert/read.

## Deployment and operations

- `docker compose up` boots database + web; PostgreSQL health gate precedes app.
- Start from empty database: `pnpm db:migrate` applies committed SQL under
  `packages/db/src/migrations`; readiness confirms the migrations table exists.
- `.env.example` documents every required variable. No secret is committed.
- Local asset storage: demo-video/repository URLs are stored as text; assets
  are external links (no cloud object storage dependency).

See `DATA-MODEL.md` for the relational model and `README.md` for run commands.