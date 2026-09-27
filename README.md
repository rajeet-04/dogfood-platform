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
- **Packages:** pnpm workspaces (15 domain/db packages)
- **Tests:** Vitest (unit/integration), Playwright (acceptance)
- **Runtime contract:** Docker Compose (`web` + `db`) with no mandatory third-party cloud service

## Prerequisites

- Node 22+
- pnpm 12 (or set `packageManager` via corepack)
- Docker with Compose v2

## Quick start

One command for the full stack (database + web):

```bash
docker compose up
```

Then open http://localhost:3000. Docker Compose starts PostgreSQL, waits for
its health check, and boots the web app. Migrations are applied before startup
is considered ready (`GET /api/ready`).

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
- There are no built-in fixture accounts: the organizer registers through the
  UI, creates an event, and invites/granted members act as participants and
  judges. Every user authenticates with an email + password (Argon2id).
- Test suite uses a separate database (`DATABASE_URL_TEST`, defaults to
  `dogfood_test`) so it never clobbers development data.

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
- Track features are out of scope for T1/T2 (schema rows exist for scoped
  judging; no track UI/API).
- No built-in fixture users; organizers/signups create their own accounts.
- The official released acceptance suite and `.dogfood.toml` schema are
  expected from the hackathon release; when they arrive, run them against this
  commit and reconcile the tier claim file.