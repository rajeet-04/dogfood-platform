# T1 Gallery, Assets, Questions, and Fixture Seed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a public project gallery backed by real submissions, with local image uploads, organizer questions, and the official fixture on local startup.

**Architecture:** Keep project writes in `@dogfood/submissions`, add event-owned assets and tracks in PostgreSQL, and use one public read service for the API and page. Import the fixture with stable source IDs into the current relational model, preserving its deliberate duplicate as an anomaly.

**Tech Stack:** Next.js 16, React 19, TypeScript, Drizzle/PostgreSQL, pnpm, Vitest, Playwright, Compose.

**Spec:** `docs/superpowers/specs/2026-09-28-t1-gallery-assets-questions-design.md`

## Global Constraints

- Current repository package manager: `pnpm@12.5.1`.
- Image allowlist: PNG and JPEG, maximum 5 MiB each, maximum 10 gallery images per revision.
- Custom questions: free text only, maximum 4,000 characters, required or optional, visibility `PUBLIC` or `ORGANIZER_ONLY`; default is `ORGANIZER_ONLY`.
- Public project states: `SUBMITTED` or `LOCKED`; public event states exclude `DRAFT` and `ARCHIVED`.
- Fixture import is explicitly enabled for local Compose startup and omitted from ordinary production deployment.
- Existing immutable revision, event permission, and deadline checks remain the write authority.

## Review Focus

1. An asset ID from another event is rejected on project save even if the actor can upload in both events (Task 2 test).
2. Changing a question from `PUBLIC` to `ORGANIZER_ONLY` immediately removes its old answer from anonymous detail (Task 4 test).
3. Two image uploads with the same filename get different storage keys and neither can escape `.uploads` (Task 3 test).
4. Repeated fixture startup retains 40 canonical public projects and one recorded duplicate with four score rows (Task 5 test).
5. A direct anonymous image request for an uploaded but unlinked asset returns 404 (Task 3 test).

---

### Task 1: Storage and submission domain

**Files:**
- Modify: `packages/db/src/schema/events.ts`, `packages/db/src/schema/projects.ts`, `packages/db/src/schema/index.ts`
- Create: `packages/db/src/schema/assets.ts`, `packages/db/src/schema/fixtureImports.ts`
- Generate: `packages/db/src/migrations/0012_*.sql`, migration metadata
- Modify: `packages/submissions/src/domain.ts`
- Test: `tests/unit/submissions/custom-questions.test.ts`

**Interfaces:**
- `CustomQuestion = { id: string; prompt: string; required: boolean; visibility: "PUBLIC" | "ORGANIZER_ONLY"; order: number }`
- `validateRequiredAnswers(questions: CustomQuestion[], answers: Record<string,string>): void` throws `SUBMISSION_INCOMPLETE` for blank required answers.
- Schema exports `eventTracks`, `assets`, `projectRevisionImages`, and `fixtureImportAnomalies`.

- [ ] **Step 1: Write a failing domain test.** Assert that blank required text throws, optional blank text passes, and unknown question IDs are rejected. Use a stable question ID and explicit answer object.
- [ ] **Step 2: Run `pnpm exec vitest run tests/unit/submissions/custom-questions.test.ts` and observe the failure.**
- [x] **Step 3: Add the domain function and Drizzle tables/columns.** Use `events.customQuestions` JSONB and `projectRevisions.customAnswers`/`questionSnapshot` JSONB. Add a foreign key from thumbnail to assets and an ordered image table; add event-owned track table and anomaly table.
- [ ] **Step 4: Run the focused test, generate the Drizzle migration with `pnpm db:generate`, then inspect the generated SQL for foreign keys, indexes, and safe defaults.** The migration was applied by the PostgreSQL integration run and the migration/schema were reviewed, but the standalone unit test named in this step was not part of the six-file verification command.
- [x] **Step 5: Commit this independently usable schema/domain change.** Schema/domain work is committed in the feature branch history.

### Task 2: Event configuration and immutable project edits

**Files:**
- Modify: `packages/events/src/service.ts`, `packages/events/src/index.ts`
- Modify: `packages/submissions/src/service.ts`, `packages/submissions/src/repository.ts`
- Modify: `apps/web/server/actions/project.ts`, `apps/web/server/read-models/participant.ts`
- Modify: `apps/web/app/events/[eventId]/participant/page.tsx`, `apps/web/app/events/[eventId]/organizer/page.tsx`
- Create: `apps/web/server/actions/submission-settings.ts`
- Test: `tests/integration/submission-questions.test.ts`

**Interfaces:**
- `saveSubmissionSettings(actor,eventId,{ tracks, questions })` requires `EVENT_CONFIGURE` and validates unique IDs/order.
- `CreateProjectInput` and `RevisionInput` gain `trackId`, `thumbnailAssetId`, `imageAssetIds`, and `customAnswers`.
- `createProject`, `reviseProject`, and `submitProject` retain their existing signatures and enforce event ownership inside the service.

- [ ] **Step 1: Write a failing integration test.** Save a required question; create a draft without an answer; assert submit fails; revise with an answer; assert submit succeeds; then reject a foreign-event asset and track.
- [ ] **Step 2: Run `pnpm exec vitest run tests/integration/submission-questions.test.ts` and observe the failure.**
- [x] **Step 3: Implement the settings command, versioned answers/images, asset/track ownership checks, and submit validation.** Serialize answers as question-ID keys, use immutable revision rows, and reject unknown IDs.
- [x] **Step 4: Extend the organizer settings panel and participant project form with track choice, required markers, answer inputs, and current answers.** Reuse the existing `Field`, `Input`, `Select`, `Textarea`, `Button`, and form-state components.
- [x] **Step 5: Run the focused integration test and typecheck affected packages; commit the command and form change.** The six-file integration run and four package typechecks pass; the implementation is committed in the feature branch history.

### Task 3: Local image assets and participant image flow

**Files:**
- Modify: `apps/web/lib/uploads.ts`, `docker-compose.yml`, `Dockerfile`
- Create: `apps/web/server/assets.ts`
- Create: `apps/web/app/api/v1/events/[eventId]/assets/route.ts`
- Create: `apps/web/app/api/v1/assets/[assetId]/route.ts`
- Create: `apps/web/components/project-image-picker.tsx`
- Modify: `apps/web/app/events/[eventId]/participant/page.tsx`, `apps/web/server/actions/project.ts`
- Test: `tests/integration/project-assets.test.ts`

**Interfaces:**
- `storeProjectImage(actor,eventId,file): Promise<Asset>` validates role, size, detected content type, and event ownership.
- `getReadableAsset(actorOrNull,assetId)` returns metadata only when the actor can edit or the current public revision links it.
- Upload route returns `{ asset: { id, url, name, size, contentType } }`; read route streams image bytes with `X-Content-Type-Options: nosniff`.

- [ ] **Step 1: Write failing tests for PNG/JPEG signatures, oversize/invalid files, unique storage keys, foreign event attachment, unlinked anonymous access, draft image privacy, and public linked access.**
- [ ] **Step 2: Run `pnpm exec vitest run tests/integration/project-assets.test.ts` and observe the failure.**
- [x] **Step 3: Implement metadata and file storage using the existing local upload helper, with event-scoped storage keys and cleanup on DB failure.** Add the Compose upload volume and image endpoint.
- [x] **Step 4: Build the participant image picker: upload, thumbnail selection, ordered gallery, remove from current draft revision, progress/error text, and keyboard-operable controls.** The form submits asset IDs, not base64 data.
- [x] **Step 5: Run the focused test and web typecheck; commit the image flow.** Focused asset/gallery integration coverage, web typecheck/build, and feature commits are confirmed.

### Task 4: Anonymous gallery API and page

**Files:**
- Create: `packages/submissions/src/gallery.ts`
- Modify: `packages/submissions/src/index.ts`
- Create: `apps/web/app/api/v1/gallery/route.ts`
- Create: `apps/web/app/api/v1/events/[eventId]/gallery/route.ts`
- Create: `apps/web/app/api/v1/events/[eventId]/gallery/[projectId]/route.ts`
- Create: `apps/web/app/projects/page.tsx`, `apps/web/app/projects/[projectId]/page.tsx`
- Modify: `apps/web/components/header.tsx`
- Test: `tests/integration/public-gallery.test.ts`

**Interfaces:**
- `listPublicProjects({ q, event, track, tag, limit, cursor })` returns public cards and filter facets.
- `getPublicProject(eventId,projectId)` returns detail with ordered images and only currently public question answers.
- API and page both call these functions; neither has a separate visibility or filter implementation.

- [ ] **Step 1: Write failing integration checks for anonymous 200, known seeded title, exact filter parity, draft exclusion, private-event exclusion, and old answer removal when question visibility changes.**
- [ ] **Step 2: Run `pnpm exec vitest run tests/integration/public-gallery.test.ts` and observe the failure.**
- [x] **Step 3: Implement a bounded, stable gallery query and public serializer.** Filter event/project state in SQL, join current revisions/tracks/teams, and make detail return 404 for every private object.
- [x] **Step 4: Build the public list and detail pages in the existing design system.** Show real project imagery when available, clear empty states, search/event/track/tag filters, external links, and an ordered image gallery; add Projects to public/mobile navigation.
- [x] **Step 5: Run focused tests and web typecheck; commit the public gallery.** The six-file integration run, four package typechecks, web build, local gallery smoke, and feature commits are confirmed.

### Task 5: Official fixture seed, Compose startup, and acceptance record

**Files:**
- Add: `fixtures.json` from `https://dogfoodhack.com/spec/fixtures.json`
- Create: `packages/db/src/fixture-seed.ts`
- Modify: `packages/db/src/seed.ts`, `packages/db/package.json`, `Dockerfile`, `docker-compose.yml`
- Modify: `PLAN.md`, `README.md`
- Test: `tests/integration/fixture-seed.test.ts`

**Interfaces:**
- `seedOfficialFixtures(db, fixture)` returns `{ projects: 40, judges: 30, scores: 122, anomalies: 1 }` on first and repeated runs.
- `DOGFOOD_SEED_FIXTURES=1` makes local Compose run migration and seed before the web server starts.
- The seed emits organizer, judge A, judge B, and participant authentication headers for `.dogfood.toml`.

- [ ] **Step 1: Write a failing fixture integration test using the versioned file.** Check exact counts, `Glass Signal` in public reads, preserved `prj_41` with four anomaly scores, closed fixture deadline, and a second no-op run.
- [ ] **Step 2: Run `pnpm exec vitest run tests/integration/fixture-seed.test.ts` and observe the failure.**
- [x] **Step 3: Map source IDs to stable UUIDs, seed relational records idempotently, preserve missing scores, and record the duplicate.** Generate only the credentials needed for the official checker and print their headers on local startup.
- [x] **Step 4: Wire the explicit Compose seed flag, copy the fixture into the image, keep uploaded files on a volume, and update `PLAN.md` with the exact implementation and verification status.** Compose/offline acceptance itself remains unverified.
- [ ] **Step 5: Run the focused test and the official `run.py` against a booted local portal when available; record its literal result.** The focused tests and local seed/API smoke pass, but official `run.py` and `spec.md` are absent and the `.dogfood.toml` shape mismatches the official contract. Do not claim official acceptance. Use `graphify update .` and `graphify cluster-only .` after code settles, then commit the seed and status changes.

## Completion gate

Review the whole branch for privacy, ownership, fixture idempotency, broken image links, and UI flow consistency. Current focused evidence: 23 passing tests across six integration files, four package typechecks, a successful production web build, and local seed/API smoke with HTTP 200 from `/api/health`, `/projects`, and `/api/v1/gallery?q=Glass%20Signal` including the fixture title. Compose offline behavior and official acceptance remain unverified; `run.py` and `spec.md` are absent and `.dogfood.toml` has the wrong shape. Do not label T1 complete until the official checker and full contract support that claim.
