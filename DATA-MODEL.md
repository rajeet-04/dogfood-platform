# DOGFOOD Data Model

PostgreSQL 17 + Drizzle ORM. All configuration below is generated from
`packages/db/src/schema/*` and applied by the committed migrations in
`packages/db/src/migrations`. Enums live in `packages/db/src/schema/enums.ts`.

## Tables

### identity

- **users** — `id` pk, `email`, `password_hash` (Argon2id), `display_name`,
  `is_platform_admin` (default false), `created_at`, `updated_at`.
  Unique on `lower(email)`.
- **sessions** — `id` pk, `user_id` fk→users (cascade delete), `token_hash`
  unique, `expires_at`, `created_at`, `last_seen_at`. Browser cookie holds the
  raw token; only the hash is stored.

### events

- **events** — `id` pk, `slug` unique, `name`, `description`, `timezone`,
  `state` (event_state enum, default `DRAFT`), open/close timestamps for
  registration, submissions, and judging, `published_ranking_snapshot_id`,
  `created_by` fk→users, `created_at`, `updated_at`.
- **event_memberships** — composite role row: `id` pk, `event_id` fk (restrict
  delete), `user_id` fk (restrict delete), `role` (event_role enum), `is_active`
  default true, `created_at`.
  - Unique `(event_id, user_id)`; indexes on `(user_id, event_id)`,
    `(event_id, role, is_active)`.
- **judge_invitations** — `id` pk, `event_id` fk (cascade), normalized `email`,
  `token_hash`, `created_by` fk (restrict), `created_at`, `expires_at`, nullable
  `accepted_at`, `accepted_by` fk (set null), and `revoked_at`. Token hash is
  unique; `(event_id, created_at)` is indexed. The application stores only a
  hash of the 32-byte random token, claims active invitations once
  transactionally, and checks the accepting account's normalized email. Email
  ownership itself is not verified.

### teams

- **teams** — `id` pk, `event_id` fk (cascade), `name`, `created_by` fk→users,
  timestamps. Unique `(event_id, name)`.
- **team_members** — `event_id` fk, `team_id` fk, `user_id` fk, `is_owner`
  default false, `joined_at`. PK `(team_id, user_id)`; unique
  `(event_id, user_id)`.
- **team_invites** — `id` pk, `team_id` fk (cascade), `token_hash` unique,
  `created_by`, `expires_at`, `max_uses`, `use_count`, `revoked_at`.

### submissions

- **projects** — `id` pk, `event_id` fk (restrict), `team_id` fk (cascade),
  `slug`, `state` (project_state: `DRAFT`|`SUBMITTED`, default `DRAFT`),
  `current_revision_id`, `submitted_at`, `locked_at`, `created_at`.
  - Unique `(event_id, team_id)` (one project per team per event) and
    `(event_id, slug)`; index `(event_id, state)`.
- **project_revisions** — immutable: `id` pk, `project_id` fk (cascade),
  `revision_number`, `title`, `tagline`, `description`, `repository_url`,
  `live_url`, `demo_video_url`, `thumbnail_asset_id`, `track_id`,
  `tech_tags` (jsonb `string[]`, default `[]`), `created_by`, `created_at`.
  - Unique `(project_id, revision_number)`; index `(project_id,
    revision_number desc)`. Revisions are never updated: each revision numbers
    the next, and `projects.current_revision_id` moves forward.

### judging

- **rubrics** — `id` pk, `event_id` fk (restrict), `name`, `version` (default 1),
  `active` (default false), `created_at`. Unique `(event_id, version)`.
  Rubric activation requires criterion weights to sum to exactly 100
  (`RUBRIC_WEIGHT_TARGET`).
- **rubric_criteria** — `id` pk, `rubric_id` fk (cascade), `name`,
  `description`, `weight` (numeric 10,5), `min_score`/`max_score` (numeric
  10,3), `sort_order`. Index `(rubric_id, sort_order)`.
- **judge_assignments** — `id` pk, `event_id` fk (restrict), `judge_id` fk
  (restrict), `project_id` fk (cascade), `status` (judge_assignment_state:
  `ASSIGNED`|`IN_PROGRESS`|`SUBMITTED`|`LOCKED`), `assigned_by`, `assigned_at`.
  - Unique `(event_id, judge_id, project_id)`; queues indexed by
    `(event_id, judge_id, status)` and `(event_id, project_id, status)`.
- **judge_track_scopes** — `event_id`, `judge_id`, `track_id`. PK across all
  three (reserved for track-scoped judging).
- **evaluations** — `id` pk, `assignment_id` fk (cascade) unique,
  `rubric_id` fk (restrict), `state` (evaluation_state:
  `IN_PROGRESS`|`SUBMITTED`|`LOCKED`, default `IN_PROGRESS`),
  `current_revision` (default 0), `overall_comment`, `started_at`,
  `submitted_at`, `locked_at`. One evaluation per assignment.
- **evaluation_scores** — `evaluation_id` fk (cascade), `criterion_id` fk
  (cascade), `score` (numeric 10,3), `comment`. PK `(evaluation_id,
  criterion_id)`.
- **evaluation_revisions** — immutable snapshots: `id` pk, `evaluation_id` fk
  (cascade), `revision_number`, `scores_json` (jsonb), `overall_comment`,
  `changed_by`, `created_at`. Unique `(evaluation_id, revision_number)`.

### results

- **ranking_snapshots** — `id` pk, `event_id` fk (restrict), `scoring_version`,
  `normalization_version`, `ranking_version` (each a persisted algorithm
  version string), `configuration` (jsonb), `results` (jsonb), `generated_by`,
  `generated_at`, `published_at` (null until published). Index
  `(event_id, generated_at)`. Results are never recomputed on read.

### community voting

- **voting_configs** — `event_id` pk/fk→events (cascade), `access_mode`
  (default `AUTHENTICATED`, constrained to `AUTHENTICATED`, `OPEN_LINK`, or
  `EMAIL_GATED`), nullable `opens_at` and `closes_at`, `updated_by` fk→users,
  `updated_at`.
- **voting_credentials** — `id` pk, `event_id` fk→events (cascade),
  `access_mode` (`OPEN_LINK` or `EMAIL_GATED`), unique `token_hash`, optional
  normalized `email` label, `created_by`, `created_at`, `expires_at`,
  `revoked_at`. This table stores issued email invitations and server-minted
  open-link voter tokens (no email, no creator, expiring at the voting close).
  Its active event/email index prevents duplicate active invitation labels.
  Email ownership is not verified. Ballot and vote calls reject open-link
  tokens that have no row here.
- **votes** — `id` pk, `event_id` fk→events (cascade), nullable `voter_id`
  fk→users (restrict), nullable `credential_id` fk→voting_credentials
  (restrict), nullable `voter_token_hash`, `project_id` fk→projects (cascade),
  `created_at`. A check requires exactly one voter identity. Partial unique
  indexes on `(event_id, voter_id)`, `(event_id, credential_id)`, and
  `(event_id, voter_token_hash)` enforce one vote per account, email invitation,
  or open-link token. Open-link values are SHA-256 hashes; no raw token is
  stored.
- **project_comments** — `id` pk, `event_id` fk→events (cascade), `project_id`
  fk→projects (cascade), `author_id` fk→users (restrict), `body`, `created_at`.
  Indexed by `(project_id, created_at)` and `(event_id, author_id, created_at)`.
- **voting_rate_limits** — event/account/action/window bucket with `count`.
  Unique `(event_id, actor_id, action, window_start)` supports atomic vote and
  comment counters; `count > 0` is enforced. Event/account deletion cascades.
- **voting_credential_rate_limits** — `event_id`, nullable `credential_id`,
  nullable `voter_token_hash`, `action`, minute `window_start`, and `count`.
  A check requires exactly one anonymous identity; partial unique indexes form
  per-invitation or per-token buckets. Each newly minted token gets a fresh
  bucket, so this limits repeat writes per identity, not identities.
- **voting_abuse_rate_limits** — `event_id`, `scope` (`EVENT` or `NETWORK`),
  `key_hash` (HMAC of an IPv4 `/24` or IPv6 `/64`; `event` for the event
  scope), `action` (`vote` or `mint` for open-link identity creation), hourly
  `window_start`, and `count`. These caps bound anonymous volume; they do not
  prove unique people.

### audit

- **audit_events** — `id` pk, `event_id` fk (restrict), `actor_id` fk (set
  null), `action`, `resource_type`, `resource_id`, `metadata` (jsonb),
  `created_at`. Append-only: indexes on `(event_id, created_at)` and
  `(event_id, actor_id, created_at)`. Application code exposes insert and
  scoped read only.

## Relationship rules

- Competition history uses deletion-restrictive references
  (`events`, `event_memberships`, `projects`, `judge_assignments`,
  `evaluations`, `ranking_snapshots`, `audit_events`); working data such as
  teams/members/sessions may cascade.
- Session deletion is cascade; sessions expire on their own.

## Indexes and enforcement

The unique constraints above are the primary backstop for duplicate-team,
duplicate-membership, one-project-per-team, and one-evaluation-per-assignment
rules; application services enforce the same rules transactionally for
friendlier error codes.

## Fixture / import paths

- Migrations: `packages/db/src/migrations` (committed SQL, applied via
  `pnpm db:migrate` = `pnpm --filter @dogfood/db migrate`).
- Seed entry: `packages/db/src/seed.ts` applies migrations on a fresh
  database (`pnpm db:seed`); it is the fixture baseline the test suite assumes.
- Integration fixtures: `tests/fixtures/db.ts` `resetDb()` migrates and truncates
  the test database (`dogfood_test` by default).
- Exports: authorized CSV read models in `packages/exports` (RFC4180, CRLF,
  quoted fields). See `GET /api/v1/events/:eventId/exports/:name.csv`.
