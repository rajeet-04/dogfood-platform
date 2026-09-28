# DOGFOOD Build Status and Remaining Work

**Status date:** 2026-09-28  
**Official source:** [DOGFOOD requirements crosswalk](plans-dogfood/00-official-requirements.md), based on the event site and published spec.  
**Event code window:** 2026-09-26 18:00 UTC to 2026-09-29 18:00 UTC.  
**Purpose:** Track implementation present in this checkout separately from requirements still to complete or verify.

> **Eligibility warning:** The existing local acceptance report cites implementation commit `ec8eeb3` dated 2026-09-26, before the official coding window opened. The event rules prohibit pre-existing project code. Treat the implementation below as code present in the repository, not as eligible competition work, until its provenance and eligibility are resolved. Do not make an entry claim based only on this checkout or on retimestamped history.

## Status key

- **Implemented in checkout** means code or artifacts are present. It does not mean the feature passed the current official checker or was written in the allowed event window.
- **Verified locally** refers only to the prior report's unit, integration, Playwright, and portable-Postgres evidence at its cited commit.
- **Officially accepted** requires the published `run.py` report and evidence for advertised features the seven checks do not cover.

## Implemented in the current checkout

The following implementation areas exist in source. The last recorded local verification is in [`acceptance-report.txt`](acceptance-report.txt), dated 2026-09-26 and attached to commit `ec8eeb3`; current HEAD is newer and has not been freshly verified in this task.

- Authentication, local sessions, event membership/roles, and event lifecycle services.
- Team creation and invite-link join; project creation, revision history, submission, and server-side deadline checks.
- Weighted rubrics, manual judge assignment, evaluation drafts/submission/locking, and permission checks for assigned work.
- Pure weighted scoring and per-judge normalization, including zero-variance handling and missing/incomplete score batches.
- Deterministic ranking and persisted ranking snapshots, publication, audit events, and role-checked CSV exports.
- Participant, judge, and organizer UI flows with local Playwright evidence in the recorded report.
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

- [ ] Add a public gallery surface/route with search and filtering. The current app tree has no dedicated gallery route, so the official public-gallery checks cannot yet be claimed from the implementation inventory.
- [ ] Load the official fixture projects into the public gallery and ensure a known fixture title is returned to an unauthenticated visitor.
- [ ] Add or verify organizer configuration for tracks, track association, prizes, and custom submission questions; the current README lists track UI/API as out of scope for the T1/T2 build.
- [ ] Complete the submission field/assets contract: thumbnail, ordered image gallery, demo-video URL, repository URL, live link, tech tags, track, and custom answers. Preserve edits as revisions and keep private/draft content out of public reads.
- [ ] Reconcile all five role types (visitor, participant, judge, organizer, admin) against the site matrix and document any deliberate policy difference.

### P2 — Complete and prove all T2 Judging requirements

- [ ] Add batch/algorithmic judge assignment and coverage preview; current source visibly exposes manual `assignJudge` and queues, but no assignment proposal/generator.
- [ ] Implement track-scoped assignment and backend isolation across tracks. Current README says track features are out of scope.
- [ ] Resolve organizer score visibility against the official role matrix; retain backend judge-to-judge and judge-to-track denials.
- [ ] Document assignment, weighted rubric, normalization method, limitations, diagnostics, and CSV coverage in `JUDGING.md`; make sure written evidence matches current code.
- [ ] Verify all advertised T2 behavior independently; the official checker covers only own/peer scores, participant denial, and organizer CSV export.

### P3 — Integrate the official acceptance contract

- [ ] Replace the current custom `.dogfood.toml` shape with the official `[portal]`, `[tiers]`, `[auth]`, and `[routes]` shape, including actual paths for gallery, submit, own judge scores, peer-score probe, and CSV export.
- [ ] Download and seed the published `fixtures.json` (40 projects, 30 judges, 8 tracks), including flat-scoring, incomplete-review, duplicate-submission, and missing-score cases; print working organizer, judge A, judge B, and participant headers on boot.
- [ ] Run `python3 run.py .dogfood.toml` against a running portal and commit its unedited output as `acceptance-report.txt`, even if it contains failures.
- [ ] Replace the stale note in the current acceptance report saying the official suite is not published; it is available from <https://dogfoodhack.com/spec/>.
- [ ] Verify a clean `docker compose up` and a network-disconnected run with the official fixture seed. The current report says neither Docker nor offline mode was literally exercised.
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
