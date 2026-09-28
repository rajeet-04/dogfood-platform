# T1 Gallery, Assets, Questions, and Fixture Seed Design

## Goal

Make submitted DOGFOOD projects browsable without authentication, while giving participants the complete image and custom-answer submission flow required by T1. A local `docker compose up` should load the published DOGFOOD fixture so the gallery contains recognizable projects on first boot.

## Source and starting state

- The published [DOGFOOD spec](https://dogfoodhack.com/spec/) requires an unauthenticated gallery response containing a known fixture project. Its fixture download has 8 tracks, 30 judges, 40 teams, **41 project rows** (one deliberate duplicate for `tm_07`), and 126 score rows. This design uses the downloaded `fixtures.json` at the repository root.
- Before this implementation, the schema had immutable project revisions, submission states, URLs, tech tags, a nullable thumbnail UUID, and a nullable track UUID, but no asset table, ordered images, event tracks, custom question definitions, or public gallery read model.
- Existing participant forms and JSON project creation must continue to use the same submission service and server-enforced deadline.

## Data model

1. `event_tracks` stores event-owned track ID, name, and display order. `project_revisions.track_id` references it. Organizer management is scoped to the event.
2. `assets` stores event ID, uploader ID, storage key, original name, detected MIME type, byte size, SHA-256, and creation time. Only PNG and JPEG, up to 5 MiB per file, are accepted for project images. The existing local `.uploads` directory is used, and Compose persists it in a volume.
3. `project_revision_images` stores ordered asset IDs for each revision, with a unique `(revision_id, position)` and `(revision_id, asset_id)`. A revision has at most 10 gallery images. `thumbnail_asset_id` references an `assets` row.
4. `events.custom_questions` is JSONB containing stable question IDs, prompt, `required`, display order, and visibility (`PUBLIC` or `ORGANIZER_ONLY`). New questions default to `ORGANIZER_ONLY`. Only free-text answers are supported.
5. `project_revisions.custom_answers` is JSONB keyed by question ID; `question_snapshot` records the question wording and visibility seen when the revision was saved. This keeps edits immutable. Answer text is capped at 4,000 characters.
6. Official fixture identity is recorded separately from generated UUIDs. `fixture_import_anomalies` records the duplicate source project (`prj_41`), its four scores, and the canonical source ID (`prj_07`). The normal `projects` table keeps its one-project-per-team constraint, so the 40 canonical source projects become live projects and the duplicate cannot become a second public gallery card.

## Commands and validation

- Organizer event settings can create, edit, order, and remove tracks and questions. Question IDs remain stable across wording edits. Removing a question prevents new answers; existing revision snapshots remain intact.
- Participant create and revise flows accept a track, thumbnail asset ID, ordered image asset IDs, and answers in addition to current fields. Every selected asset and track must belong to the event. The user must belong to the project team. Every edit creates a revision.
- Draft saves may contain partial answers. Submit validates the current event questions: every required question has a nonblank answer and no unknown question ID is accepted. Existing title and description validation and server deadline remain in force.
- Upload authenticates the actor, checks event membership and submission access, verifies file bytes against PNG/JPEG signatures, writes under the event's local asset directory, and records metadata. Failed metadata writes remove the file. The image endpoint streams the file with the stored MIME type and `nosniff`.
- An authenticated team member or organizer may read an event asset while editing. Anonymous access succeeds only when that asset is referenced by the current revision of a `SUBMITTED` or `LOCKED` project in a public event. Unlinked assets, draft images, and assets from `DRAFT` or `ARCHIVED` events return 404.

## Public gallery

- A single read service powers both `GET /api/v1/gallery` and the `/projects` page. It accepts `q`, `event`, `track`, and `tag`, applies the same normalization and matching to both surfaces, and returns a stable order with a bounded page size.
- Event-specific `GET /api/v1/events/:eventId/gallery` and a project detail endpoint reuse this service. Public cards expose title, tagline/summary, team, event, track, tech tags, thumbnail URL, submitted time, and project link. Detail adds description, ordered image URLs, demo/repository/live URLs, and public custom answers.
- Only projects with state `SUBMITTED` or `LOCKED` in events other than `DRAFT` or `ARCHIVED` appear. The duplicate fixture row is excluded. Organizer-only answers and drafts are omitted at the query and serialization boundary. A question answer is public only while both its saved snapshot and the current question definition say `PUBLIC`.
- The public page offers search, event, track, and tech-tag filters and a project detail view with thumbnail and image gallery. The navigation includes a Projects link.

## Official fixture startup

- `fixtures.json` is versioned in the repo. An idempotent seed command imports the event, tracks, users, teams, 40 canonical projects, 30 judges, rubric criteria, assignments, and 122 canonical score rows. It records the deliberately duplicated source project and its four score rows in `fixture_import_anomalies`; the versioned file retains all 41 project and 126 score records. Missing scores stay missing.
- The seed preserves the fixture's closed submission date and prints usable organizer, judge A, judge B, and participant headers for the official checker. Repeated starts must not duplicate records or overwrite user edits.
- The repository Compose configuration opts into the fixture seed during startup. Ordinary production deployments omit that explicit opt-in. The Docker image includes `fixtures.json` and the local upload volume is configured. Compose startup and network-disconnected behavior have not been verified.

## Acceptance

- Local seed/import smoke returned HTTP 200 from `/api/health`, `/projects`, and `/api/v1/gallery?q=Glass%20Signal`; the gallery response included `Glass Signal`. Focused tests cover gallery filters and public visibility. The official checker has not been run.
- Draft projects, projects in `DRAFT`/`ARCHIVED` events, the duplicate fixture project, private answers, and their image bytes are absent from anonymous reads.
- Required custom answers block submit when blank; optional answers may be blank. Unknown question IDs, foreign-event tracks/assets, invalid image bytes, oversize images, and attempts after the deadline are rejected by the server.
- The seed is idempotent and records the duplicate and its four score rows. `run.py` and `spec.md` are absent from this checkout, and `.dogfood.toml` does not match the official shape described in the runbook (`[portal]`, `[tiers]`, `[auth]`, `[routes]`); official acceptance remains pending. Existing T2 score and export checks must retain their own authorization.

## Verification status

Current local evidence is recorded in `PLAN.md`: 23 passing tests across six focused integration files, passing typechecks for DB/events/submissions/web, a passing production web build, and the seeded API/page smoke above. These checks do not establish full T1 completion, competition eligibility, Compose offline readiness, or official acceptance.

## Scope boundary

This slice implements T1 gallery, image, track, question, and fixture paths, with the local verification limits stated above. It does not add T3 community voting or T4 embeddable galleries and webhooks. `PLAN.md` remains the source for their unfinished status and for the other official acceptance gates.
