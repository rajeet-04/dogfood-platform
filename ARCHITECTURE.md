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
  voting/          Account and bearer-token ballots, comments, rate limits
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

Community voting is bounded in `packages/voting` and defaults to
authenticated-account access. Organizers can also choose `OPEN_LINK` or
`EMAIL_GATED`. Votes are unique per account, invitation credential, or open-link
token. Signed-in project team members are rejected in every mode. Open-link GETs
validate event state and the active voting window, then return/reuse a 32-byte
token in an event-path-scoped HttpOnly cookie; issuance is stateless and stores
no database row. Votes and rate-limit buckets store only the token hash. This
avoids persistent writes from ballot reads, but open-link is intentionally
public: callers can omit/reset the cookie or submit fresh valid-length tokens,
so token-based limits do not prevent Sybil stuffing and no IP/global throttle is
implemented. Email-gated codes are 32-byte single-use bearer tokens stored as
hashes; organizers share them manually, the email is an unverified label, and
no mail is sent. Results remain restricted during active judging and until the
configured close, subject to event state.

## State machines

Event: `DRAFT → REGISTRATION → SUBMISSIONS_OPEN → SUBMISSIONS_CLOSED →
JUDGING → RESULTS_READY → PUBLISHED → ARCHIVED` (enforced by
`packages/events/src/domain.ts`).

Project: `DRAFT → SUBMITTED`; evaluation: `IN_PROGRESS → SUBMITTED → LOCKED`
with `ASSIGNED` on the judge assignment.

## Mutation invariant

Every critical mutation follows:

```text
identify actor/credential → authorize → validate → state/deadline check
→ BEGIN → mutation → audit insert → COMMIT
```

Business mutation and its audit event share one SQL transaction
(`packages/audit/src/service.ts`); a failed transaction rolls back both.

## Judging engine

Weighted scoring, normalization, and ranking are separate pure functions
pipelined by `packages/ranking/src/service.ts`. Details and math live in
`JUDGING.md`. Every generated snapshot persists scoring, normalization, and
ranking versions plus configuration; re-reading a snapshot never recomputes it.
The ranking package also contains a tested Bradley–Terry-style pairwise
estimator and an organizer API endpoint. The product lacks comparison
collection, persisted judge comparison sessions, and judge-facing pairwise UI;
this is a partial bonus implementation, not an end-to-end pairwise judging mode.

## Organizer confidentiality

Following the official role matrix, organizers and platform admins may read
every judge's raw scores at any stage (`evaluation:read` for `ORGANIZER`).
Judges can read only their own evaluations; judge-to-judge and cross-track
reads stay denied server side.

## API surface

`/api/v1` adapters stay thin: parse, authenticate, invoke application service,
map typed errors. Business rules are not duplicated between UI and API. Error
responses share the stable envelope in `apps/web/server/errors/map-error.ts`:

```json
{ "error": { "code": "EVALUATION_LOCKED", "message": "...", "requestId": "..." } }
```

`openapi.yaml` documents 52 HTTP methods. Several organizer/participant
workflows still use server actions without equivalent REST operations, so the
OpenAPI contract is useful but UI/API parity remains partial.

## Security assumptions and handled threats

- Server/database time is authoritative for deadlines; browser clocks never are.
- Sessions are opaque random tokens stored hashed server-side; cookie is
  Secure, HttpOnly, SameSite=Lax.
- Passwords are Argon2id hashes only.
- Judge-invitation URLs carry a random one-time token; only its SHA-256 hash is
  stored. Acceptance also requires an account with the normalized invited
  email, but the application does not verify email ownership. Invitations are
  shared manually and expire after seven days.
- Authenticated voting uses one account identity per event and rejects a
  signed-in project team member's vote in all modes. Open-link mode accepts any
  fresh 43-character base64url token as an anonymous identity; only its hash is
  stored with a vote/rate bucket. Resetting/omitting the cookie or supplying
  another token obtains another vote identity; there is no IP/global throttle.
  Email-gated vote codes are manual bearer credentials; their email labels are
  not verified. Neither anonymous mode provides Sybil resistance.
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
