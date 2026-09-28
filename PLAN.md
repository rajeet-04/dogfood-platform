# DOGFOOD Build Status and Remaining Work

**Status date:** 2026-09-28  
**Official source:** [DOGFOOD requirements crosswalk](plans-dogfood/00-official-requirements.md), based on the event site and published spec.  
**Event code window:** 2026-09-26 18:00 UTC to 2026-09-29 18:00 UTC.  
**Purpose:** Track implementation present in this checkout separately from requirements still to complete or verify.

> **Eligibility warning:** The existing local acceptance report cites implementation commit `ec8eeb3` dated 2026-09-26, before the official coding window opened. The event rules prohibit pre-existing project code. Treat the implementation below as code present in the repository, not as eligible competition work, until its provenance and eligibility are resolved. Do not make an entry claim based only on this checkout or on retimestamped history.

## Status key

- **Implemented in checkout** means code or artifacts are present. It does not mean the feature passed the current official checker or was written in the allowed event window.
- **Verified locally** means a command and result are recorded in the current verification checkpoint below. Older evidence is identified by its source revision and is not current-HEAD evidence.
- **Officially accepted** requires the published `run.py` report and evidence for advertised features the seven checks do not cover.
- A checked task box records implementation present in this checkout only. It does not establish event eligibility, full local verification, or official acceptance; those statuses are stated separately.

## Current local verification checkpoint — 2026-09-28

The gallery/assets/custom-question/fixture slice was verified against a disposable local PostgreSQL 17 container (`dogfood_test`). These commands exited 0:

- `bun run --cwd packages/db typecheck`, `bun run --cwd packages/events typecheck`, `bun run --cwd packages/submissions typecheck`, and `bun run --cwd apps/web typecheck` — all four passed.
- `DATABASE_URL=postgresql://dogfood:dogfood@127.0.0.1:5432/dogfood_test bun run vitest run tests/integration/fixture-seed.test.ts tests/integration/submissions.test.ts tests/integration/submissions-lock.test.ts tests/integration/submission-settings.test.ts tests/integration/project-assets.test.ts tests/integration/public-gallery.test.ts` — 6 files, 23 tests passed.
- `DATABASE_URL=postgresql://dogfood:dogfood@127.0.0.1:5432/dogfood_test bun run --cwd apps/web build` — production build passed.
- Local seed/import smoke used `DATABASE_URL=postgresql://dogfood:dogfood@127.0.0.1:5432/dogfood_test bun run --cwd packages/db seed:fixtures`; `/api/health`, `/projects`, and `/api/v1/gallery?q=Glass%20Signal` each returned HTTP 200, and the gallery JSON contained the official fixture title `Glass Signal`.

This checkpoint covers those focused paths, the local seeded smoke, and the web build; it does not establish whole-repository test completion, T1 completion, event eligibility, Compose offline readiness, or official acceptance. The official `run.py` and `spec.md` are absent from this checkout. The current `.dogfood.toml` also differs from the official shape described in the runbook: it lacks `[portal]`, `[auth]`, and `[routes]` and instead has `[claims]` and `[notes]`. The checker therefore has not been run.

## Implemented in the current checkout

The following implementation areas exist in source. Earlier local verification is in [`acceptance-report.txt`](acceptance-report.txt), dated 2026-09-26 and attached to commit `ec8eeb3`; the focused feature slice has the separate current verification evidence above.

- Authentication, local sessions, event membership/roles, and event lifecycle services.
- Team creation and invite-link join; project creation, revision history, submission, and server-side deadline checks.
- Weighted rubrics, manual judge assignment, evaluation drafts/submission/locking, and permission checks for assigned work.
- Pure weighted scoring and per-judge normalization, including zero-variance handling and missing/incomplete score batches.
- Deterministic ranking and persisted ranking snapshots, publication, audit events, and role-checked CSV exports.
- Participant, judge, and organizer UI flows with local Playwright evidence in the recorded report.
- Anonymous gallery with shared search/filter behavior; event-scoped local image uploads, ordered revision gallery images, and thumbnails; event tracks; free-text custom submission questions with required-answer enforcement.
- Local/dev official-fixture seeding with stable IDs and retained duplicate-submission anomaly data. The focused integration test checks repeat seeding and fixture record counts; this is local fixture validation, not official checker acceptance.
- PostgreSQL/Drizzle schema, migrations, a Docker Compose definition, health/readiness endpoints, MIT license, and root `README.md`, `ARCHITECTURE.md`, `DATA-MODEL.md`, and `JUDGING.md`.
- Certificate issuance is present as a partial T4 capability; it does not by itself provide signed, publicly verifiable judge participation records.
- The planning pack now records the official tier ladder, scoring weights, bonuses, prize allocation, rules, required submission artifacts, fixture/checker contract, conflicts, and this implementation/remaining-work split.

The previous report records 65/65 unit checks, 71/71 integration checks, 3/3 Playwright flows, and typecheck passing at its cited commit. It also explicitly says Docker Compose and network-off operation were not literally exercised. That report predates the official published acceptance files and is not evidence for current HEAD.

## Remaining work, in priority order

### P0 — Resolve competition eligibility and source of truth

- [ ] Audit when the project code was authored, not merely when later commits landed. The recorded implementation commit is Sep 26, before the Sep 26 18:00 UTC kickoff; the event rule says all submitted project code must be new within the 72-hour window.
- [ ] Resolve whether this implementation can be entered under the new-code rule. If not, keep it as reference/planning material and build eligible code only from allowed pre-event materials; do not hide or rewrite the provenance.
- [ ] Keep main-site rules/scoring separate from official `spec.md`/fixture/checker assertions. Reconcile the organizer raw-score policy: the site matrix permits organizer score access, while the current app hides raw scores until lock; the seven checks do not settle this.

### P1 — Complete and prove all T1 Core requirements

- [x] Implement an anonymous gallery with shared filters and public/private-answer redaction; focused public-gallery integration tests pass locally.
- [x] Seed official fixture records in local/dev mode with stable IDs and preserve the duplicate project and its source scores; integration tests and a seeded live smoke show the known `Glass Signal` title. The official checker is not available in this checkout.
- [x] Implement event tracks and free-text custom questions with required-answer enforcement; submission integration coverage passes locally.
- [x] Implement local event-scoped image assets, ordered gallery images, and thumbnails; focused asset/gallery integration tests pass locally.
- [ ] Finish and verify the complete submission-field contract (including demo-video URL, repository URL, live link, tech tags, and custom answers) as one end-to-end participant workflow. Keep private/draft content out of public reads.
- [ ] Add or verify organizer configuration for prizes; its presence is not established by the current feature-slice verification.
- [ ] Reconcile all five role types (visitor, participant, judge, organizer, admin) against the site matrix and document any deliberate policy difference.

### P2 — Complete and prove all T2 Judging requirements

- [ ] Add batch/algorithmic judge assignment and coverage preview; current source visibly exposes manual `assignJudge` and queues, but no assignment proposal/generator.
- [ ] Implement track-scoped judge assignment and backend isolation across tracks. Event tracks for T1 project submissions exist; judging assignment by track remains unverified/unimplemented.
- [ ] Resolve organizer score visibility against the official role matrix; retain backend judge-to-judge and judge-to-track denials.
- [ ] Document assignment, weighted rubric, normalization method, limitations, diagnostics, and CSV coverage in `JUDGING.md`; make sure written evidence matches current code.
- [ ] Verify all advertised T2 behavior independently; the official checker covers only own/peer scores, participant denial, and organizer CSV export.

### P3 — Integrate the official acceptance contract

- [ ] Obtain the official `run.py` and `spec.md`; neither is present in this checkout. Do not claim checker acceptance before they are available.
- [ ] Reconcile `.dogfood.toml` with the official `[portal]`, `[tiers]`, `[auth]`, and `[routes]` shape, including actual paths for gallery, submit, own judge scores, peer-score probe, and CSV export. Current `[claims]`/`[notes]` configuration does not match that shape.
- [ ] Once the runner is available and the config matches, run `python3 run.py .dogfood.toml` against a running portal and preserve its unedited output as `acceptance-report.txt`, including failures.
- [ ] Refresh the stale `acceptance-report.txt`; its Sep 26 evidence predates the official checker and the current feature slice.
- [ ] Verify a clean `docker compose up` and a network-disconnected run with the official fixture seed. Compose/offline acceptance has not been exercised in this verification checkpoint.
- [ ] Do not equate seven passing checks with full advertised tier completion; preserve extra tests/docs/demo evidence for requirements the checker does not inspect.

### P4 — Finish submission readiness and evidence

- [ ] Regenerate all verification evidence on the eligible final source revision; the prior local report is for an older pre-kickoff commit.
- [ ] Update the `README.md`, `ARCHITECTURE.md`, `DATA-MODEL.md`, and `JUDGING.md` to describe actual behavior, limits, run instructions, import/export paths, and judging math.
- [ ] Record the honest tier claim and one-sentence pitch in the official `.dogfood.toml`.
- [ ] Produce the five-minute create → submit → judge → publish demo, including a raw API denial proving backend judge isolation.
- [ ] Confirm public GitHub repository, OSI license, team size (1–4), reachable team contact, and final submission before Sep 29 18:00 UTC.

### P5 — Stretch tiers and bonuses, only after P1–P4 are green

- [ ] **T3 Public:** configurable open/email-gated/authenticated voting or a defended alternative; comments; results hidden from everyone except organizers during voting; randomized ballot order; rate limits, duplicate detection, and readable audit.
- [ ] **T4 Stretch:** REST API and webhooks for every UI action; certificates; signed/publicly verifiable judge participation records; embeddable gallery; bulk import/export.
- [ ] **Normalization Proof (+5 tie-break):** show raw/normalized fixture scores, rank movement, math, sensitivity/limits, and reproducible evidence.
- [ ] **Pairwise Mode (+5 tie-break):** pairwise comparisons and a tested Bradley–Terry-style ranker.
- [ ] **Threat Model (+3 tie-break):** document attacks stopped and accepted risks across voting and submissions.
- [ ] **API First (+3 tie-break):** publish OpenAPI and prove UI/API parity.
- [ ] Do not add bonuses to the weighted 1–5 score. These bonuses break ties only; they also help decide the $100 Best Judging Engine prize.

## Official scoring and awards reference

| Main score criterion | Weight |
|---|---:|
| Tier Completion & Correctness | 40% |
| Judging Integrity | 25% |
| Adoptability & Operability | 20% |
| Code Quality & Innovation | 15% |

Main prizes: 1st $800, 2nd $500, 3rd $350, 4th $200, 5th $150, Best Judging Engine $100; four Write-Up Quest awards at $100 each. Total pool: $2,500. T1–T4 are capability tiers; placements/prizes are a separate awards system. Full criteria are in [the official requirements crosswalk](plans-dogfood/00-official-requirements.md).

## Change log

- 2026-09-28: Created current-state tracker, added official DOGFOOD requirements/scoring/prize crosswalk to `plans-dogfood/`, and listed code provenance/official acceptance gaps.
- 2026-09-28: Added the official DOGFOOD source crosswalk and implementation/remaining-work tracker; Graphify artifacts were regenerated from the updated planning corpus. The initial full deep Ollama pass flagged a semantic shrink in the existing architecture plan, so confirm graph extraction integrity separately.
