# Testing DOGFOOD

Everything you need to verify the build works — automated suites plus a manual
demo you can drive yourself. Current evidence: `acceptance-report.txt`.

## 1. Prerequisites

- Node 22+, pnpm 12 (`packageManager` in root `package.json`).
- PostgreSQL 17 reachable with credentials `dogfood/dogfood`.
  - Docker: `docker compose up -d db`
  - No Docker: `powershell -File scripts/dev-db.ps1 start` (portable PG paths
    are in the script header).
- Copy `.env.example` to `.env` and adjust if your Postgres differs.
- `pnpm install`, then `pnpm db:migrate` once.

There are **no seeded demo users** — you register in the UI, and the test
suites create their own users. Tests use a separate database
(`DATABASE_URL_TEST`, default `dogfood_test`) so they never touch your dev data.

## 2. Automated suites (recommended first pass)

```bash
pnpm test               # vitest: unit + integration (21 files, ~137 tests)
pnpm test:unit          # pure engines, policies, state machines only
pnpm test:integration   # DB-backed flows only
pnpm test:acceptance    # Playwright: three full browser journeys
pnpm test:all           # everything, one command
pnpm typecheck          # tsc across all 15 packages
```

The Playwright suite is the best "does the product work" check: it boots the
real app on port 3000, provisions a database, and exercises real users in a
browser.

```bash
# watch a single journey live (headful), then press Enter to close it:
pnpm exec playwright test tests/acceptance/core-flows.spec.ts --headed

# responsive sweep across 1440/1280/1024/768/390 (opt-in, writes screenshots
# to test-results/visual/ and fails on overflow, tiny tap targets, duplicate
# landmarks, missing h1s or console errors):
VISUAL_QA=1 pnpm test:acceptance visual-qa
VISUAL_DARK=1 VISUAL_QA=1 pnpm test:acceptance visual-qa
```

## 3. Manual demo (click-through, ~5 minutes)

Boot: `docker compose up` (or `pnpm dev` with a local Postgres) and open
http://localhost:3000.

### Part A — organizer

1. **Register** an organizer account (email + password ≥ 8 chars).
2. **Create an event** (slug like `hack-summer`), then advance it:
   Registration → Submissions Open → Submissions Closed → Judging
   (each step is gated; the UI shows the current state).
3. Make **rubrics**: add 2+ criteria whose weights sum to 100
   (e.g. Quality 40 / Impact 30 / Feasibility 30), then **activate**.
4. Later, in Judging: **assign** judges to submitted projects and watch the
   assignment queue.

### Part B — participant (second browser/incognito)

1. **Register** a participant account.
2. On `/{event}/participant` **create a team**, then **create a project**,
   submit a revision (a second submission bumps the revision), and **submit**.
   The project flips DRAFT → SUBMITTED. Submitting after
   `submission_closes_at` is rejected with `DEADLINE_PASSED`.

### Part C — judge (third account)

1. **Register** a judge; only *your assigned* projects are visible — the
   unassigned ones are not, even if you know their URL.
2. Score each criterion within the rub range, add a comment, **submit**.
3. The organizer then **locks** evaluations. Before the lock, the organizer
   sees progress only (no raw numbers).

### Part D — results and exports

1. Organizer: **Generate ranking** (snapshot persists version + config), then
   **Publish**.
2. Download CSVs from the exports UI, or directly:

```bash
curl -i -H "Cookie: dogfood_session=<your-session-cookie>" \
  http://localhost:3000/api/v1/events/<eventId>/exports/results.csv
```

`participants`, `teams`, `projects`, `judge-assignments`, `evaluations`,
`results` are available; `results` 404s until a snapshot is published. Files
are RFC4180/CRLF and open cleanly in Excel or `pnpm exec csv-parse`.

## 4. API-level checks (permission isolation, no UI needed)

Guidance and exact curl commands are in `JUDGING.md` under "Verify this
yourself". The gist, all backend-enforced:

| Probe | Expected |
|---|---|
| Judge fetches another judge's evaluation | `403 FORBIDDEN` |
| Participant POSTs `/rankings` | `403 FORBIDDEN` |
| Organizer reads raw scores while judging | `200` before and after lock (official role matrix) |
| Submit after deadline (any client) | `409 DEADLINE_PASSED` |
| Anonymous exports | `401` |

Errors always use the envelope
`{ "error": { "code": "...", "message": "...", "requestId": "..." } }`.

## 5. Health probes

```bash
curl -i http://localhost:3000/api/health   # 200 {"status":"ok"}
curl -i http://localhost:3000/api/ready    # 200 ... until DB goes away -> 503
```

`/api/ready` checks the database connection and that migrations are applied
(`drizzle.__drizzle_migrations` exists).

## 6. Troubleshooting

- **Port already in use** — change `PORT` in `.env` (dev) or the compose ports
  block.
- **Tests fail on a dirty DB** — the suites reset their own database; if you
  pointed `DATABASE_URL_TEST` at your dev DB, move it back to a scratch
  database.
- **Docker build slow / fails on network** — the Dockerfile freezes the
  lockfile; ensure `corepack`/`pnpm` setup and that `pnpm install` worked
  locally first.
- **`argon2` build errors on Windows** — prebuilt binaries are used when
  pnpm's build allow-list is satisfied (`allowBuilds: argon2` is committed in
  `pnpm-workspace.yaml`); otherwise install node-gyp prerequisites.

## 7. Where the logic lives

- Math: `packages/scoring`, `packages/normalization`, `packages/ranking`
  (pure; `JUDGING.md`).
- Permissions: `packages/permissions` (`ARCHITECTURE.md`).
- Data: `packages/db/src/schema` + `DATA-MODEL.md`.
- Exports: `packages/exports`.