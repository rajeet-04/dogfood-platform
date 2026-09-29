# DOGFOOD

Self-hosted hackathon submission and judging platform. Modular monolith: Next.js + TypeScript + PostgreSQL + Drizzle.

**Docs:** see [ARCHITECTURE.md](./ARCHITECTURE.md) (components, boundaries,
security), [DATA-MODEL.md](./DATA-MODEL.md) (tables and constraints),
[JUDGING.md](./JUDGING.md) (scoring/normalization/ranking math and
"verify this yourself" isolation proofs), and
[acceptance-report.txt](./acceptance-report.txt) (pass/fail evidence).

## Team

Rajeet Ash, Deepali Singh, Ayushman Pyne (team of 3). Submitted through the
DOGFOOD Tally form.

## Tier status

The official checker only probes T1 and T2; T3 and T4 evidence is listed here
so it can be checked by hand.

- **T1 Core, T2 Judging:** official checker 7/7
  ([acceptance-report.txt](./acceptance-report.txt)), plus Vitest integration
  tests and Playwright flows.
- **T3 Public:** voting with authenticated (default), open-link, or
  email-invitation access; comments; tallies hidden from all but organizers
  while voting is open; randomized ballot order; one vote per identity;
  self-vote denial; per-identity, per-event, and per-network rate limits;
  server-minted open-link tokens with capped identity minting; duplicate and
  rate-limit attempts in a readable voting audit log. Not built: the optional
  quadratic mode. Accepted limits are in [THREAT-MODEL.md](./THREAT-MODEL.md).
  Tests: `tests/integration/voting.test.ts`, `tests/acceptance/voting.spec.ts`.
- **T4 Stretch:** REST API with a twin for every UI action and an OpenAPI
  contract ([openapi.yaml](./openapi.yaml)); signed webhooks for every
  mutation ([plans-dogfood/WEBHOOKS.md](./plans-dogfood/WEBHOOKS.md));
  certificates; Ed25519-signed judge participation records with a
  `/.well-known` key document and a standalone verifier; an embeddable gallery
  at `/embed/gallery`; JSON/CSV project archive export and import. Parity is
  enforced by `tests/unit/web/api-parity.test.ts`; limits are in
  [plans-dogfood/API-PARITY.md](./plans-dogfood/API-PARITY.md).

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

**Anonymous-voting limit:** open-link mode is intentionally public. Open-link
voter tokens are minted and stored (as hashes) by the server, so a client cannot
invent identities: a forged or unknown cookie is refused and replaced. Minting a
new identity is capped per event (default 5,000/hour) and, behind a trusted
proxy, per network prefix (default 200/hour); the first refusal in each window
is audited. Votes also have event-wide and per-network hourly caps. A client
that clears its cookie can still get another identity inside those caps, so
this is volume control, not proof of a unique person. Email invitation links
are bearer credentials and can be forwarded. Use authenticated accounts for events that
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
- `GET /embed/gallery` — standalone, iframe-friendly public project gallery.
  It supports the same `q`, `event`, `track`, and `tag` filters as
  `/api/v1/gallery` and only renders the anonymous API's submitted public work.
  Example embed (replace the origin with your deployment):

  ```html
  <iframe
    src="https://dogfood.example/embed/gallery?tag=TypeScript"
    title="DOGFOOD project gallery"
    width="100%"
    height="720"
    loading="lazy"
    referrerpolicy="no-referrer"
    style="border: 0"
  ></iframe>
  ```

- `GET /api/v1/events/:eventId/exports/:name.csv` — organizer-only CSV exports
  (`participants`, `teams`, `projects`, `judge-assignments`, `evaluations`,
  `results`) served as `text/csv; charset=utf-8`. Results export returns 404 until
  a ranking snapshot has been published.
- `GET /api/v1/events/:eventId/bulk/projects` — organizer-only project archive
  export as JSON; add `?format=csv` for a CSV archive. `POST` imports JSON or CSV
  project/revision archives in create-only mode. The archive references teams,
  tracks, and image assets already present in the same event; it does not import
  events, teams, or binary assets. Imports are limited to 10 MiB, 1,000 projects,
  and 5,000 revisions, and fail if project IDs already exist.
- `GET /api/v1/events/:eventId` includes registration opening and closing times.
- `PUT /api/v1/events/:eventId/registration-window` lets organizers replace
  both timestamps (ISO 8601 strings or `null`).
- `POST /api/v1/events/:eventId/transition` lets organizers request the next
  lifecycle state, for example `{ "toState": "REGISTRATION" }`; invalid
  transitions are rejected by the event state machine.

## Known limits

- Normalization offers `z-score` and `none` strategies only (per-judge batch).
- Pairwise judging now has a judge UI, authenticated assigned-project comparison
  API, persisted latest choices, and an organizer calculation endpoint using
  either those choices or explicit comparisons. Organizers can create persisted
  snapshots, review drafts, and publish a snapshot; publication is serialized
  per event and the public results endpoint serves the latest published result.
- Public judge participation records are issued as immutable signed ledger rows
  after results are published. Organizers use
  `POST /api/v1/events/:eventId/judge-records` with `issue`, `reissue`, or
  `revoke`; `reissue` revokes and links the prior issuance. Event reads list only
  published, non-revoked records. `GET /api/v1/judge-records/:recordId` verifies
  active payloads and returns a signed revocation receipt with HTTP 410 after
  revocation, without disclosing the revoked payload. Issuance and revocation
  require `JUDGE_RECORD_SIGNING_PRIVATE_KEY` as an Ed25519 PKCS#8 PEM.
- Clients can check signature integrity from the record's public key and
  `keyFingerprint`. Issuer identity is trusted only when the fingerprint matches
  an independently provisioned entry in `JUDGE_RECORD_TRUSTED_KEY_FINGERPRINTS`
  (a comma-separated list of SHA-256 SPKI fingerprints). Without a configured
  trust pin, responses explicitly report `untrusted-key`; the signature alone
  does not prove who issued it. Key rotation requires an out-of-band trust update.
  The issuer's active key and pins are published at
  `/.well-known/dogfood-judge-records.json`, and
  `bun scripts/verify-judge-record.ts <record-url> [--pin <fingerprint>]`
  verifies a record independently (see [JUDGING.md](./JUDGING.md)).
- [`openapi.yaml`](./openapi.yaml) documents 117 HTTP operations. Every UI
  Server Action has a REST twin, OpenAPI matches the implemented routes
  exactly, and every domain mutation emits an audit event (and so a webhook);
  `tests/unit/web/api-parity.test.ts` enforces all three. Response bodies still
  use permissive schemas, and bulk import creates projects only (no events,
  teams, or binary assets). See
  [plans-dogfood/API-PARITY.md](./plans-dogfood/API-PARITY.md).
- Compose fixture accounts are synthetic, local-only test identities; they
  cannot sign in with passwords and their fixed cookies must never be deployed.
- The official checker, fixtures, and schema are checked in under
  `plans-dogfood/official/`; all seven checks passed against the local portal.
  The submission probe can return schema-validation HTTP 400 before exercising
  deadline enforcement, and the checker does not establish full tier completion
  or competition eligibility; see `PLAN.md` for the current verification and
  remaining caveats.
- A scoped offline verification used the built web image and a fresh internal
  Podman PostgreSQL instance with networking disabled on fresh HEAD: migration
  `0019` applied, `/api/ready` returned 200, and the unchanged official checker
  passed 7/7. The seed contained all 40 official fixture projects including
  `Glass Signal`, with zero non-submitted fixtures. This is evidence for that
  setup; it does not resolve source eligibility or final submission readiness.
  The lifecycle demo (`demo/artifacts/lifecycle.webm`) is recorded against the
  production container image; narration review and the Tally submission remain
  outstanding.
