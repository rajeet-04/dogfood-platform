# DOGFOOD Build Status and Remaining Work

**Status date:** 2026-09-28  
**Official source:** [DOGFOOD requirements crosswalk](plans-dogfood/00-official-requirements.md), based on the event site and published spec.  
**Event code window:** 2026-09-26 18:00 UTC to 2026-09-29 18:00 UTC.  
**Purpose:** Track implementation present in this checkout separately from requirements still to complete or verify.

> **Eligibility warning:** The existing local acceptance report cites implementation commit `ec8eeb3` dated 2026-09-26, before the official coding window opened. The event rules prohibit pre-existing project code. Treat the implementation below as code present in the repository, not as eligible competition work, until its provenance and eligibility are resolved. Do not make an entry claim based only on this checkout or on retimestamped history.

## Status key

- **Implemented in checkout** means code or artifacts are present. It does not mean the feature passed the current official checker or was written in the allowed event window.
- **Partial** means the supported path is implemented, with material access modes or tier requirements still unsupported.
- **Verified locally** means a command and result are recorded in the current verification checkpoint below. Older evidence is identified by its source revision and is not current-HEAD evidence.
- **Officially accepted** requires the published `run.py` report and evidence for advertised features the seven checks do not cover.
- A checked task box records implementation present in this checkout only. It does not establish event eligibility, full local verification, or official acceptance; those statuses are stated separately.

## Current local verification checkpoint — 2026-09-28

The current checkout has passed the full Vitest suite, affected-package typechecks, the live official checker, and local Podman/browser verification:

- `bun run vitest run` — 48 files, 304 tests passed.
- Changed package typechecks for `packages/audit`, `packages/db`, `packages/events`, `packages/judging`, `packages/voting`, and `apps/web` — passed.
- Full Playwright acceptance — 13 passed, including 2 community-voting browser flows; 1 opt-in visual case was skipped. The separate `VISUAL_QA=1` responsive sweep passed with no visual problems or console errors.
- Podman production image and Compose startup — healthy; local fixture seeding and migrations applied; health and readiness endpoints returned HTTP 200.
- Official `python3 plans-dogfood/official/run.py .dogfood.toml` — 7/7 checks passed; unedited output is recorded in [`acceptance-report.txt`](acceptance-report.txt).
- `git diff --check` — passed.

These results establish local checker success and Compose/browser operation, not competition eligibility, offline readiness, or full tier completion. The official submission probe can pass with a schema-validation HTTP 400 before deadline logic is reached, so this check alone does not prove deadline enforcement (covered separately by application tests). Provenance and eligibility remain unresolved because existing source history predates the event's 2026-09-26 18:00 UTC code window. The organizer raw-score policy discrepancy remains pending: the official site matrix permits organizer score access, while the app restricts direct organizer reads to locked evaluations; the seven checker tests do not settle this policy.

## Implemented in the current checkout

The following implementation areas exist in source. The current [`acceptance-report.txt`](acceptance-report.txt) contains the unedited live official checker output for this verification checkpoint; passing it does not resolve eligibility or untested requirements.

- Authentication, local sessions, event membership/roles, and event lifecycle services.
- Team creation and invite-link join; project creation, revision history, submission, and server-side deadline checks.
- Weighted rubrics, manual judge assignment, evaluation drafts/submission/locking, and permission checks for assigned work.
- Pure weighted scoring and per-judge normalization, including zero-variance handling and missing/incomplete score batches.
- Deterministic ranking and persisted ranking snapshots, publication, audit events, and role-checked CSV exports.
- Participant, judge, and organizer UI flows with local Playwright evidence in the recorded report.
- Anonymous gallery with shared search/filter behavior; event-scoped local image uploads, ordered revision gallery images, and thumbnails; event tracks; free-text custom submission questions with required-answer enforcement.
- Structured event-scoped prizes with optional track, amount/currency, organizer CRUD, and public display; event-prize integration tests pass.
- Judge access enforces assigned track scope; judges without a track scope remain event-wide. Assignment scope integration tests pass.
- Organizer event creation exposes UTC registration, submission, and judging windows; the existing event editor supports registration-window changes. Paired boundaries are validated; editing submission and judging windows remains unsupported by the current update service.
- Judge invitations support organizer creation, listing, revocation, and token acceptance. Invitation management requires an active organizer membership; acceptance compares the signed-in account email with the invitation address, but account email ownership is not verified.
- Authenticated-account-only community voting and comments are implemented with randomized ballots, one vote per account, project-team self-vote denial, write rate limits, and anti-abuse audit. Non-organizers cannot read tallies during the configured voting window; organizers may read them, and other authenticated users can read them after the close time. Open-link and email-gated voter access are unsupported.
- Organizers can configure community-voting open and close timestamps in the event settings UI. Only signed-in accounts can vote; leaving either timestamp empty disables voting.
- Judge recusals are auditable; `JUDGING.md` documents assignment and recusal behavior, score policy variance, normalization, proof results, and limitations. `scripts/judging-proof/official-fixture.ts` provides a database-free reproducible normalization/rank-movement example.
- The official checker source, fixture, and config shape are present; the live run passed all seven published checks. The submission-probe caveat above still applies.
- Participant submission round-trip covers the configured project fields; the full-field integration test passes.
- Local/dev official-fixture seeding with stable IDs and retained duplicate-submission anomaly data. The focused integration test checks repeat seeding and fixture record counts; this is local fixture validation, not official checker acceptance.
- PostgreSQL/Drizzle schema, migrations, a Docker Compose definition, health/readiness endpoints, MIT license, and root `README.md`, `ARCHITECTURE.md`, `DATA-MODEL.md`, and `JUDGING.md`.
- Certificate issuance is present as a partial T4 capability; it does not by itself provide signed, publicly verifiable judge participation records.
- The planning pack records the official tier ladder, scoring weights, bonuses, prize allocation, rules, required submission artifacts, fixture/checker contract, conflicts, and this implementation/remaining-work split.

The previous report records 65/65 unit checks, 71/71 integration checks, 3/3 Playwright flows, and typecheck passing at its cited commit. It also explicitly says Docker Compose and network-off operation were not literally exercised. That report predates the official published acceptance files and is not evidence for current HEAD.

## Remaining work, in priority order

### P0 — Resolve competition eligibility and source of truth

- [ ] Audit when the project code was authored, not merely when later commits landed. The recorded implementation commit is Sep 26, before the Sep 26 18:00 UTC kickoff; the event rule says all submitted project code must be new within the 72-hour window.
- [ ] Resolve whether this implementation can be entered under the new-code rule. If not, keep it as reference/planning material and build eligible code only from allowed pre-event materials; do not hide or rewrite the provenance.
- [ ] Keep main-site rules/scoring separate from official `spec.md`/fixture/checker assertions. Reconcile the organizer raw-score policy: the site matrix permits organizer score access, while the current app hides raw scores until lock; the seven checks do not settle this.

### P1 — Complete and prove all T1 Core requirements

- [x] Implement an anonymous gallery with shared filters and public/private-answer redaction; focused public-gallery integration tests pass locally.
- [x] Seed official fixture records in local/dev mode with stable IDs and preserve the duplicate project and its source scores; integration tests and live smoke show the known `Glass Signal` title. The official checker also confirms the fixture project appears in the gallery.
- [x] Implement event tracks and free-text custom questions with required-answer enforcement; submission integration coverage passes locally.
- [x] Implement local event-scoped image assets, ordered gallery images, and thumbnails; focused asset/gallery integration tests pass locally.
- [x] Verify a participant submission round-trip across the full project field set, including demo-video URL, repository URL, live link, tech tags, track, images/thumbnail, and custom answers.
- [x] Configure event-scoped prizes with optional track, amount/currency, organizer CRUD, and public display; event-prize integration tests pass.
- [ ] Reconcile all five role types (visitor, participant, judge, organizer, admin) against the site matrix and document any deliberate policy difference.

### P2 — Complete and prove all T2 Judging requirements

- [x] Add batch/algorithmic judge assignment and coverage preview with deterministic `round_robin` and `balanced_by_track` strategies, diagnostics, filtered assignment API, and persistent, audited recusal support; focused judging/API integration coverage passes locally.
- [x] Enforce assigned judge track scope and preserve event-wide access for judges with no track scope; focused assignment isolation and guard tests pass.
- [x] Add the judge-invitation vertical with active organizer-membership authorization; email ownership verification remains unsupported. **P2 progress: 4/6 complete.**
- [ ] Resolve organizer score visibility against the official role matrix; retain backend judge-to-judge and judge-to-track denials.
- [x] Document assignment, weighted rubric, normalization method, limitations, diagnostics, CSV coverage, and the fixture normalization proof in `JUDGING.md`; keep written evidence aligned with current code.
- [ ] Verify all advertised T2 behavior independently; the official checker covers only own/peer scores, participant denial, and organizer CSV export.

- [x] Obtain the official `run.py`, `spec.md`, and fixture; they are checked in under `plans-dogfood/official/`.
- [x] Reconcile `.dogfood.toml` with the official `[portal]`, `[tiers]`, `[auth]`, and `[routes]` shape and configured gallery, submit, judge-score, peer-score, and CSV paths.
- [x] Run `python3 plans-dogfood/official/run.py .dogfood.toml` against the running local portal; all seven published checks passed. The submission-probe schema-validation caveat is recorded above.
- [x] Refresh `acceptance-report.txt` with the unedited output of the live official checker run.
- [x] Verify production image build, Podman Compose startup, fixture/migration application, health/readiness, and live browser walkthrough; responsive `VISUAL_QA=1` sweep passed. A network-disconnected fixture-seed run remains pending.
- [ ] Do not equate seven passing checks with full advertised tier completion; preserve extra tests/docs/demo evidence for requirements the checker does not inspect.

### P4 — Finish submission readiness and evidence

- [ ] Regenerate all verification evidence on the eligible final source revision; the prior local report is for an older pre-kickoff commit.
- [ ] Update `README.md`, `ARCHITECTURE.md`, and `DATA-MODEL.md` with current behavior, limits, and run instructions; `JUDGING.md` now documents judging policy, methods, and proof limitations.
- [x] Review the configured T1/T2 claim and pitch in `.dogfood.toml` against verified behavior; the live checker reports T1/T2 verified, subject to the submit-probe caveat.
- [ ] Produce the five-minute create → submit → judge → publish demo, including a raw API denial proving backend judge isolation.
- [ ] Confirm public GitHub repository, OSI license, team size (1–4), reachable team contact, and final submission before Sep 29 18:00 UTC.

### P5 — Stretch tiers and bonuses, only after P1–P4 are green

- [~] **T3 Public (partial):** authenticated-account voting and comments, randomized ballot order, one-vote-per-account enforcement, team self-vote denial, rate limits, duplicate detection, anti-abuse audit, and close-time tally privacy are implemented. Open-link and email-gated voter access are unsupported.
- [~] **T4 Stretch (partial):** certificate issuance exists. Webhooks for all UI actions, signed/publicly verifiable judge participation records, embeddable gallery, and bulk import/export remain unsupported.
- [x] **Normalization Proof (+5 tie-break):** `JUDGING.md` documents the raw/normalized fixture comparison, rank movement, method, sensitivity/limits, and the database-free reproducible proof script.
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
- 2026-09-28: Recorded the completed T2 judge-assignment/recusal slice, its focused local verification checkpoint, deferred minor review notes, and P2 progress at 2/5.
- 2026-09-28: Updated current implementation and verification status for organizer schedule settings, recusal audit, judge invitations, authenticated-account T3 voting/comments, official checker assets/config, judging proof documentation, and the remaining live verification and eligibility gates.
- 2026-09-28: Recorded organizer voting-window controls and the 13-pass acceptance run, including both voting browser flows; retained the visual opt-in skip and known policy, eligibility, and access-mode limits.
