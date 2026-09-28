# DOGFOOD

Self-hosted hackathon submission and judging platform. Modular monolith: Next.js + TypeScript + PostgreSQL + Drizzle.

**Docs:** see [ARCHITECTURE.md](./ARCHITECTURE.md) (components, boundaries,
security), [DATA-MODEL.md](./DATA-MODEL.md) (tables and constraints),
[JUDGING.md](./JUDGING.md) (scoring/normalization/ranking math and
"verify this yourself" isolation proofs), and
[acceptance-report.txt](./acceptance-report.txt) (pass/fail evidence).

## Stack

- **App:** Next.js 16 (App Router) + React 19 + Tailwind CSS 4
- **Database:** PostgreSQL 17 + Drizzle ORM
- **Packages:** pnpm workspaces (18 domain/db packages)
- **Tests:** Vitest (unit/integration), Playwright (acceptance)
- **Runtime contract:** Docker Compose (`web` + `db`) with no mandatory third-party cloud service

## Prerequisites

- Node 22+
- pnpm 12 (or set `packageManager` via corepack)
- Docker Compose v2, or Podman with a Compose provider

## Quick start

One command for the full stack (database + web):

```bash
podman compose up --build
# Docker users can run: docker compose up --build
```

Then open http://localhost:3000. Docker Compose starts PostgreSQL, waits for
its health check, and boots the web app. Migrations are applied before startup
is considered ready (`GET /api/ready`). Compose seeds the official fixture and
prints stable local-only fixture session credentials that match `.dogfood.toml`.
The published ports bind to loopback; use `http://localhost:3000` and do not
expose the stack on a LAN or public host. Never seed these fixture users or
credentials in production.

For local development instead:

```bash
pnpm install            # install workspace
docker compose up -d db # start postgres (or bootstrap a local PG)
pnpm db:migrate         # apply migrations
pnpm dev                # run web app at http://localhost:3000
pnpm test               # vitest (unit + integration)
pnpm test:acceptance    # playwright
pnpm typecheck          # tsc across all packages
```

Copy `.env.example` to `.env` for local development defaults.

**Migrations:** committed SQL under `packages/db/src/migrations/`; `pnpm db:migrate`
applies pending ones via Drizzle. `packages/db` also exposes a `pnpm seed` entry
(`pnpm --filter @dogfood/db seed`) that applies migrations on a fresh database
and is the fixture baseline the test suite assumes.

**No Docker?** A managed local PostgreSQL can be booted with
`powershell -File scripts/dev-db.ps1 start` (expects a portable PG install on
this machine; see the script header for paths).

## Accounts and ports

- Web app runs on **port 3000** (`PORT`), PostgreSQL on **port 5432**.
- Compose seeds local-only organizer, judge, and participant fixture accounts.
  Their role-specific session cookies are listed in `.dogfood.toml` and printed
  by the seed command; these accounts have no password-login credentials. Use
  the cookie on `localhost` only. Fixture seeding requires both
  `DOGFOOD_MODE=local` and `DOGFOOD_SEED_FIXTURES=1`; normal user accounts
  register with email and password (Argon2id).
- Test suite uses a separate database (`DATABASE_URL_TEST`, defaults to
  `dogfood_test`) so it never clobbers development data.

Organizers can create judge invitations with a one-time URL token, manually
share it, and restrict acceptance to an account with the normalized invited
email. Links expire after seven days; no email is sent, and account email
ownership is not verified. Organizers configure community-voting access and
open/close timestamps in event settings; leaving either timestamp empty
disables voting. Authenticated-account voting is the default. Optional open-link
voting uses an event-scoped HttpOnly cookie; email-gated voting uses single-use
bearer links that organizers create and share manually. No email is sent and
the address attached to an invitation is not verified. Signed-in members of a
project's team cannot vote for it in any mode. Votes are unique per account,
invitation, or open-link token, and writes are rate-limited per identity.

**Anonymous-voting limit:** open-link mode is intentionally public. A client can
omit/reset the cookie or supply a fresh valid-length token and obtain another
anonymous identity; there is no IP/global throttle. Per-token limits and
uniqueness do not stop Sybil ballot stuffing. Email invitation links are bearer
credentials and can be forwarded. Use authenticated accounts for events that
need stronger voter accountability. Tallies are restricted during active
judging and before the configured close time, subject to event-state policy.

## Repository layout

```text
apps/web/          Next.js application (app/, components/, server/)
packages/
  db/              Drizzle client, schema, migrations, seed entry
  auth/            Identity, sessions (Phase 1)
  permissions/     Event-scoped permission engine (Phase 2)
  events/          Events, state machine, memberships (Phase 2)
  teams/           Team lifecycle (Phase 3)
  submissions/     Projects + immutable revisions + deadlines (Phase 3)
  judging/         Rubrics, assignments, evaluations (Phases 4-5)
  scoring/         Pure weighted scoring engine (Task 9)
  normalization/   Pure z-score normalization engine (Task 10)
  ranking/         Pure deterministic ranking engine (Task 11)
  exports/         CSV exports over authorized read models (Task 14)
  audit/           Append-only transactional audit trail (Task 7)
  validation/      Zod boundaries + stable error catalog
  shared/          Domain-agnostic types
tests/
  unit/            Unit tests (pure engines, policies, state machines)
  integration/     DB-backed integration tests
  acceptance/      Playwright end-to-end flows
  fixtures/        Shared test fixtures
ARCHITECTURE.md    Components, boundaries, transactions, security assumptions
DATA-MODEL.md      Tables, constraints, indexes, fixture/export paths
JUDGING.md         Scoring math, normalization, ties, "verify this yourself"
acceptance-report.txt  Pass/fail evidence for the acceptance gates
```

Module boundaries are frozen in `specs/` and `phases/` of the planning pack; pure scoring/normalization/ranking packages never import framework or database code.

## Operations

- `GET /api/health` — liveness probe; returns `{ "status": "ok" }`.
- `GET /api/ready` — readiness probe; verifies the database is reachable and
  migrations are applied; returns 503 `{ "status": "unavailable" }` otherwise.
- `GET /api/v1/events/:eventId/exports/:name.csv` — organizer-only CSV exports
  (`participants`, `teams`, `projects`, `judge-assignments`, `evaluations`,
  `results`) served as `text/csv; charset=utf-8`. Results export returns 404 until
  a ranking snapshot has been published.

## Known limits

- Normalization offers `z-score` and `none` strategies only (per-judge batch).
- Pairwise judging has a tested Bradley–Terry-style estimator and an organizer
  endpoint, but no comparison collection flow, persisted judge sessions, or
  judge UI. Treat it as partial capability.
- [`openapi.yaml`](./openapi.yaml) documents 52 HTTP methods in this checkout.
  UI/server-action workflows are not all available through the REST API, so
  full UI/API parity is not complete.
- Tracks have organizer and participant UI plus server-action support; there are
  no standalone versioned REST endpoints for track management.
- Compose fixture accounts are synthetic, local-only test identities; they
  cannot sign in with passwords and their fixed cookies must never be deployed.
- The official checker, fixtures, and schema are checked in under
  `plans-dogfood/official/`; all seven checks passed against the local portal.
  The submission probe can return schema-validation HTTP 400 before exercising
  deadline enforcement, and the checker does not establish full tier completion
  or competition eligibility; see `PLAN.md` for the current verification and
  remaining caveats.
- A scoped offline verification used the built web image and a fresh internal
  Podman PostgreSQL instance with networking disabled: migrations completed,
  `/api/ready` returned 200, and the seed contained all 40 official fixture
  projects including `Glass Signal`, with no hidden-state projects. This is
  evidence for that setup; it does not resolve source eligibility or final
  submission readiness. A reviewed five-minute demo video and final
  team/contact/submission confirmations remain outstanding.
