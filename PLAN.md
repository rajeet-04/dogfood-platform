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

The current checkout has passed the recorded full Vitest suite, affected-package typechecks, the live official checker, and local Podman/browser verification. The latest voting-access hardening also has a focused integration/typecheck/build/offline checkpoint:

- `bunx vitest run` — 49 files, 313 tests passed on the fresh verification run.
- Changed package typechecks for `packages/audit`, `packages/db`, `packages/events`, `packages/judging`, `packages/voting`, and `apps/web` — passed.
- Full Playwright acceptance — 13 passed, including 2 community-voting browser flows; 1 opt-in visual case was skipped. The separate `VISUAL_QA=1` responsive sweep passed with no visual problems or console errors.
- Podman production image and Compose startup — healthy; local fixture seeding and migrations applied; health and readiness endpoints returned HTTP 200.
- Official `python3 plans-dogfood/official/run.py .dogfood.toml` — 7/7 checks passed; unedited output is recorded in [`acceptance-report.txt`](acceptance-report.txt).
- `git diff --check` — passed.
- After the configurable access-mode and stateless open-link changes, `bun run vitest run tests/integration/voting.test.ts` — 16/16 passed. Typechecks for `@dogfood/voting`, `@dogfood/db`, and `@dogfood/web` passed, as did the production web build.
- Offline verification on the fresh HEAD: the prebuilt web image started against an isolated internal Podman PostgreSQL instance with networking disabled; migration `0019` applied, `/api/ready` returned HTTP 200, and the unchanged official checker passed 7/7 in the container. Fixture smoke showed all 40 official projects, including `Glass Signal`, and zero non-submitted fixtures. This verifies that image/startup/seed path in that setup, not every command on every offline host.

These results establish local checker success, Compose/browser operation, and the scoped offline container run, not competition eligibility or full tier completion. The official submission probe can pass with a schema-validation HTTP 400 before deadline logic is reached, so this check alone does not prove deadline enforcement (covered separately by application tests). Provenance and eligibility remain unresolved because existing source history predates the event's 2026-09-26 18:00 UTC code window. The organizer raw-score policy discrepancy remains pending: the official site matrix permits organizer score access, while the app restricts direct organizer reads to locked evaluations; the seven checker tests do not settle this policy.

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
- Community voting defaults to authenticated accounts and also supports public open-link and email-invitation modes. All modes use randomized ballots, one vote per current identity, project-team self-vote denial when the voter is signed in, write limits, and audit records. Open-link identity is a stateless 32-byte token held in an event-scoped HttpOnly cookie and hashed when used; callers can omit/reset the cookie or supply a fresh 43-character token, so there is no IP/global throttle and Sybil stuffing remains possible. Email invitations are single-use bearer links created and shared manually; the stored email is an unverified label and the app sends no email. Tallies stay organizer-only during `JUDGING` and until the close time, then become available according to event state and route policy.
- Organizers configure the community-voting access mode and open/close timestamps in the event settings UI. Leaving both timestamps empty disables voting. Signed-in project members are denied self-votes in each mode; anonymous modes cannot identify project members.
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
- [x] Verify production image build, Podman Compose startup, fixture/migration application, health/readiness, and live browser walkthrough; responsive `VISUAL_QA=1` sweep passed. A separate fresh-HEAD prebuilt-image run with networking disabled applied migration `0019`, returned `/api/ready` 200, passed the unchanged official checker 7/7, and seeded all 40 fixtures including `Glass Signal`, with zero non-submitted fixtures.
- [ ] Do not equate seven passing checks with full advertised tier completion; preserve extra tests/docs/demo evidence for requirements the checker does not inspect.

### P4 — Finish submission readiness and evidence

- [ ] Regenerate all verification evidence on the eligible final source revision; the prior local report is for an older pre-kickoff commit.
- [x] Update `README.md`, `ARCHITECTURE.md`, and `DATA-MODEL.md` with current behavior, limits, and run instructions; `JUDGING.md` documents judging policy, methods, and proof limitations.
- [x] Review the configured T1/T2 claim and pitch in `.dogfood.toml` against verified behavior; the live checker reports T1/T2 verified, subject to the submit-probe caveat.
- [ ] Produce and review the five-minute create → submit → judge → publish demo video, including a raw API denial proving backend judge isolation. A local browser journey/script exists; a reviewed, submission-ready video is not confirmed.
- [ ] Confirm public GitHub repository, OSI license, team size (1–4), reachable team contact, and final submission before Sep 29 18:00 UTC.

### P5 — Stretch tiers and bonuses, only after P1–P4 are green

- [~] **T3 Public (partial):** authenticated-account voting is the default; open-link and email-invitation access are also implemented, along with comments, randomized order, per-identity uniqueness, project-team self-vote denial for signed-in voters, write throttles, audit records, and tally privacy. Anonymous identities are easy to replace: open-link callers can omit/reset cookies or fabricate a fresh token, and there is no IP/global throttle; invitation email ownership is unverified and links are manually shared. These modes do not prevent Sybil ballot stuffing. No quadratic voting.
- [~] **T4 Stretch (partial):** certificate issuance exists. Webhooks for all UI actions, signed/publicly verifiable judge participation records, embeddable gallery, and bulk import/export remain unsupported.
- [x] **Normalization Proof (+5 tie-break):** `JUDGING.md` documents the raw/normalized fixture comparison, rank movement, method, sensitivity/limits, and the database-free reproducible proof script.
- [~] **Pairwise Mode (+5 tie-break):** a tested Bradley–Terry-style estimator and organizer endpoint exist. Pairwise comparison collection, persistent judge sessions, and judge UI are missing; the bonus is partial.
- [x] **Threat Model (+3 tie-break):** `THREAT-MODEL.md` records code-backed mitigations and accepted submission/voting/judging risks, including anonymous ballot stuffing.
- [~] **API First (+3 tie-break):** `openapi.yaml` documents 52 HTTP methods and a parity audit exists, but server-action workflows remain outside the API; full UI/API parity is incomplete.
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
- 2026-09-28: Recorded configurable voter modes and the stateless-token hardening checkpoint: 16/16 voting integration tests, focused typechecks and production build, offline fresh-PostgreSQL readiness/fixture evidence, pairwise/API partial scope, and the remaining eligibility, identity-abuse, score-policy, video, and submission blockers.
