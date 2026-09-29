# DOGFOOD Build Status and Remaining Work

**Status date:** 2026-09-29

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

## Current local verification checkpoint — 2026-09-29

Rerun on the current source after the T4 parity work and the T3 open-link hardening. Historical checks below are retained as context and may predate current code.

- `bun run test` against `dogfood_test` — 64 files, 359 tests passed, including the UI/API/OpenAPI/audit parity contract (`tests/unit/web/api-parity.test.ts`).
- TypeScript checks for all 18 packages and `apps/web` — passed.
- `podman compose up -d --build` — production image built and the Compose stack started with migrations applied and official fixtures seeded; `/.well-known/dogfood-judge-records.json` served from the production image.
- Official `plans-dogfood/official/run.py` against `localhost:3000` — 7/7 T1/T2 checks passed; unedited output in [`acceptance-report.txt`](acceptance-report.txt). T3/T4 are claimed and reported as "claimed but not verified" because the checker has no probes for them.
- Full Playwright browser acceptance — 13 passed, 1 opt-in visual case skipped.
- Lifecycle demo `demo/artifacts/lifecycle.webm` (4:42) was recorded against the production container image in the previous checkpoint; it is a silent recording.

### Historical verification before the current-source checkpoint

- `bunx vitest run` — 51 files, 315 tests passed on the combined post-merge run.
- `podman build -t localhost/dogfood-platform:final-local .` — passed, including Next.js production compilation and TypeScript.
- Fresh isolated Podman runtime for that image — migration `0020` applied (migration table count 21, max timestamp `1791700000000`), `/api/ready` reported ready/database ok/migrations applied; gallery returned 40 projects including `Glass Signal` with zero non-submitted entries; the unchanged official checker passed 7/7 from a container on the same internal network. Disposable resources were removed.
- `bunx vitest run tests/integration/api-v1.test.ts` — 5/5 passed for event detail REST update; `apps/web` typecheck passed.
- `bunx vitest run tests/integration/embed-gallery.test.ts` — 1/1 passed: `Glass Signal` appears, while the draft project and submitted project in a DRAFT/private event remain hidden.
- `bunx vitest run tests/integration/voting.test.ts` — 20/20 passed after adding event-wide and opt-in trusted-network hourly vote-attempt limits; focused TypeScript checks for `@dogfood/voting`, `@dogfood/db`, and `@dogfood/web` passed. Migration 0022 adds the throttle buckets after webhook migration 0021. These focused checks do not replace a full-suite run or fresh production-image verification.
- At that checkpoint, `bun run --filter @dogfood/web typecheck` failed on an unresolved import in the then-in-progress bulk-project route and emitted no diagnostics for the embed route. After the import fix and route commit, focused archive/export tests passed 10/10 and typechecks for `@dogfood/exports` and `@dogfood/web` passed.
- Changed package typechecks for `packages/audit`, `packages/db`, `packages/events`, `packages/judging`, `packages/voting`, and `apps/web` — passed.
- Full Playwright acceptance — 13 passed, including 2 community-voting browser flows; 1 opt-in visual case was skipped. The separate `VISUAL_QA=1` responsive sweep passed with no visual problems or console errors.
- Podman production image and Compose startup — healthy; local fixture seeding and migrations applied; health and readiness endpoints returned HTTP 200.
- Official `python3 plans-dogfood/official/run.py .dogfood.toml` — 7/7 checks passed; unedited output is recorded in [`acceptance-report.txt`](acceptance-report.txt).
- `git diff --check` — passed.
- After the configurable access-mode and stateless open-link changes, `bun run vitest run tests/integration/voting.test.ts` — 16/16 passed. Typechecks for `@dogfood/voting`, `@dogfood/db`, and `@dogfood/web` passed, as did the production web build.
- Earlier offline image verification (before migration `0020`): the prebuilt web image started against an isolated internal Podman PostgreSQL instance with networking disabled; migration `0019` applied, `/api/ready` returned HTTP 200, and the unchanged official checker passed 7/7 in the container. Fixture smoke showed all 40 official projects, including `Glass Signal`, and zero non-submitted fixtures. This is evidence for that earlier image/setup, not the current source revision or every command on every offline host.

These results establish local checker success, Compose/browser operation, and the scoped offline container run, not competition eligibility or full tier completion. The official submission probe can pass with a schema-validation HTTP 400 before deadline logic is reached, so this check alone does not prove deadline enforcement (covered separately by application tests). Provenance and eligibility remain unresolved because existing source history predates the event's 2026-09-26 18:00 UTC code window. The organizer raw-score policy now follows the official site matrix (organizers read raw scores at any stage).

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
- Community voting defaults to authenticated accounts and also supports public open-link and email-invitation modes. All modes use randomized ballots, one vote per current identity, project-team self-vote denial when the voter is signed in, write limits, and audit records. A configurable event-wide hourly cap (default 10,000 vote attempts) applies to all modes; anonymous modes can also use a configurable network-prefix cap (default 2,000 attempts/hour per IPv4 `/24` or IPv6 `/64`). Network limiting is opt-in via `DOGFOOD_TRUST_PROXY_HEADERS=true` and `DOGFOOD_VOTING_ABUSE_SECRET`, and requires a reverse proxy that overwrites `X-Real-IP`; the database stores only HMAC network keys, not raw IPs. Open-link identity is a server-minted 32-byte token, stored as a hash and held in an event-scoped HttpOnly cookie; forged tokens are refused, and minting new identities is capped per event (default 5,000/hour) and per trusted network (default 200/hour). Clearing the cookie still yields a new identity within those caps, so distributed Sybil stuffing is bounded, not prevented. Event/network caps are volume controls, not identity proof, and can throttle legitimate high-volume events or shared networks. Email invitations are single-use bearer links created and shared manually; the stored email is an unverified label and the app sends no email. Tallies stay organizer-only during `JUDGING` and until the close time, then become available according to event state and route policy.
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

- [x] Audit when the project code was authored, not merely when later commits landed. The recorded implementation commit predates the Sep 26 18:00 UTC kickoff; the event rule says all submitted project code must be new within the 72-hour window.
- [x] Audit the current branch against the pre-kickoff implementation: `ec8eeb3` is dated 2026-09-25 12:44:45 +05:30, before the official 2026-09-26 18:00 UTC kickoff, and is outside this branch's ancestry. A direct tree/blob comparison found 87/183 shared paths identical overall, including 43/117 shared `.ts`/`.tsx` paths. The fresh root `e92577b` does not establish new authorship; the official rule says all submitted project code must be written during the 72-hour window.
- [ ] The current implementation is presumptively ineligible as-is under the published new-code rule. No exception is in the checked-in official snapshots or live rules. Resolve only through an explicit organizer ruling or a new implementation written from allowed planning/specification materials; retain this branch as reference and preserve its provenance.
- [x] Source-of-truth decision: the main-site role matrix permits organizers to access own scores, peer scores, other-track data, aggregates, and audit, with no judging-phase timing qualifier. Owner approved adopting it on 2026-09-29; organizer `evaluation:read` no longer depends on lock.

### P1 — Complete and prove all T1 Core requirements

- [x] Implement an anonymous gallery with shared filters and public/private-answer redaction; focused public-gallery integration tests pass locally.
- [x] Seed official fixture records in local/dev mode with stable IDs and preserve the duplicate project and its source scores; integration tests and live smoke show the known `Glass Signal` title. The official checker also confirms the fixture project appears in the gallery.
- [x] Implement event tracks and free-text custom questions with required-answer enforcement; submission integration coverage passes locally.
- [x] Implement local event-scoped image assets, ordered gallery images, and thumbnails; focused asset/gallery integration tests pass locally.
- [x] Verify a participant submission round-trip across the full project field set, including demo-video URL, repository URL, live link, tech tags, track, images/thumbnail, and custom answers.
- [x] Configure event-scoped prizes with optional track, amount/currency, organizer CRUD, and public display; event-prize integration tests pass.
- [x] Reconcile all five role types (visitor, participant, judge, organizer, admin) against the site matrix; organizer/admin score access now matches it.

### P2 — Complete and prove all T2 Judging requirements

- [x] Add batch/algorithmic judge assignment and coverage preview with deterministic `round_robin` and `balanced_by_track` strategies, diagnostics, filtered assignment API, and persistent, audited recusal support; focused judging/API integration coverage passes locally.
- [x] Enforce assigned judge track scope and preserve event-wide access for judges with no track scope; focused assignment isolation and guard tests pass.
- [x] Add the judge-invitation vertical with active organizer-membership authorization; email ownership verification remains unsupported. **P2 progress: 4/6 complete.**
- [x] Match organizer score visibility to the official role matrix (raw per-judge scores in the organizer assignments table); backend judge-to-judge and judge-to-track denials retained.
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

- [x] **T3 Public:** authenticated-account voting is the default; open-link and email-invitation access are also implemented, along with comments, randomized order, per-identity uniqueness, project-team self-vote denial for signed-in voters, tally privacy for everyone but organizers during voting, and a readable audit trail. Open-link voter tokens are minted by the server and stored as hashes; forged or unknown tokens cannot load a ballot or vote. New open-link identities are capped per event and per trusted network prefix each hour, and votes have separate event-wide and trusted-network caps. Repeated rate-limit and self-vote denials are deduplicated per limiter identity/action/window. Accepted limits (see `THREAT-MODEL.md`): a client that clears its cookie can get another identity within the caps, distributed networks can spread across network caps, and invitation email ownership is unverified. The optional quadratic mode is not implemented.
- [x] **T4 Stretch:** REST and webhooks cover every UI action: all 55 Server Actions map to implemented REST operations, OpenAPI (117 operations) matches the route handlers exactly, and every domain mutation emits an audit event and therefore a webhook, all enforced by `tests/unit/web/api-parity.test.ts`. Certificates can be issued, read, and revoked. Judge records are Ed25519-signed with an issue/reissue/revoke ledger and signed revocation receipts; the issuer publishes its key and pins at `/.well-known/dogfood-judge-records.json`, and `scripts/verify-judge-record.ts` verifies records independently. The iframe gallery and JSON/CSV project archive export/import are in place. Limits: import creates projects only (no events, teams, or binary assets) and is refused after judging starts; response schemas are permissive; the well-known trust document relies on the origin's TLS unless a fingerprint is pinned out of band.
- [x] **Normalization Proof (+5 tie-break):** `JUDGING.md` documents the raw/normalized fixture comparison, rank movement, method, sensitivity/limits, and the database-free reproducible proof script.
- [x] **Pairwise Mode (+5 tie-break):** the tested Bradley–Terry-style estimator and organizer endpoint accept explicit comparisons or persisted judge choices. Judges have a UI and authenticated API for assigned, track-scoped comparisons; organizers can persist drafts and publish snapshots, and the public results route reads the latest publication. Per-event serialization keeps concurrent publication from forking the supersession chain. Organizer selection (generate + publish a snapshot) and the no-mixing-with-rubric policy are specified in `JUDGING.md` and asserted by an integration test.
- [x] **Threat Model (+3 tie-break):** `THREAT-MODEL.md` records code-backed mitigations and accepted submission/voting/judging risks, including anonymous ballot stuffing.
- [x] **API First (+3 tie-break):** every UI Server Action has a documented REST twin, and a contract test checks Server Action → route and route ↔ OpenAPI parity (117 operations). JSON response bodies still use permissive schemas.
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
- 2026-09-28: Refreshed the post-merge checkpoint: 51/315 Vitest tests passed; event-details REST, pairwise comparison collection, signed judge-record contracts, production image build, isolated Podman runtime, and 7/7 checker are verified. Browser acceptance remains from an earlier source revision.
- 2026-09-28: Added the public iframe gallery at `/embed/gallery` with the same anonymous filters, responsive layout, explicit cross-site framing policy, and a fixture/privacy integration check; its earlier typecheck checkpoint was subsequently followed by passing exports/web typechecks after the bulk-route import fix.
- 2026-09-28: Added organizer JSON/CSV project archive export and create-only import to the API inventory and OpenAPI contract; imports require pre-existing same-event teams, tracks, and assets and do not include binary assets. OpenAPI now covers 59 operations; the route/method parity audit remains partial.
- 2026-09-28: Added voting event-wide and opt-in HMAC network-prefix hourly attempt caps; 20/20 voting integration tests and focused DB/voting/web typechecks passed. Anonymous voting remains Sybil-vulnerable; caps are volumetric controls only.
- 2026-09-28: Added organizer event lifecycle and registration-window REST mutations using the existing permission, validation, audit, and notification services; event detail now returns registration windows. OpenAPI covers 61 operations; API First remains partial.
- 2026-09-29: Documented project revision, submit, withdraw, and individual lock routes, plus organizer webhook configuration/dispatch and the bulk-import audit delivery. OpenAPI covers 70 operations; project bulk lock and full UI/API parity remain open.
- 2026-09-29: Added track/custom-question and team REST actions, persisted pairwise ranking snapshots and serialized publication, durable judge-record issuance/reissue/revocation with signed status receipts and explicit trust pins, vote rate-limit audit deduplication, and a post-judging bulk-import guard. OpenAPI/API parity now covers 87 operations; UI/API parity, T3/T4 completion, the organizer score-policy decision, the reviewed demo, and competition eligibility remain open. Current verification: 58/340 Vitest, four package typechecks, fresh Podman build/runtime, and official T1/T2 checker 7/7 passed.
- 2026-09-29: Shipped the "Ledger" UI redesign (tokens, fonts, homepage, gallery, official DOGFOOD mark as favicon and header logo; `DESIGN.md`), fixed the missing `desc` import in rubric versioning, and re-verified on current source: 63/352 Vitest, four typechecks, fresh image build and runtime, checker 7/7, Playwright 13 passed, visual sweep clean, lifecycle demo re-recorded. Eligibility, organizer score policy, public repository visibility, demo narration/review, and final submission remain open.
- 2026-09-29: Adopted the official role matrix for organizer score access (raw per-judge scores visible to organizers/admins at any stage; judges still own-only), recorded the team (Rajeet Ash, Deepali Singh, Ayushman Pyne), and moved the lifecycle demo onto the production container image. Verified: 63/351 Vitest, five typechecks, Playwright 13 passed, rebuilt Compose container, official checker 7/7 on `localhost:3000`, demo re-recorded (4:42, no dev overlay).
- 2026-09-29: Completed T4 and hardened T3. Added REST twins for the remaining Server Actions (evaluation start/reopen/lock, bulk evaluation lock, sign-out, track/question delete), audits for every remaining mutation (event/project creation, rubrics, draft saves, reopen, asset upload, pairwise comparisons, webhook configuration), the judge-record `/.well-known` key document and independent verifier script, and a parity/audit contract test. Open-link voter tokens are now server-minted and persisted as hashes, with hourly minting caps per event and trusted network. Verified: 64/359 Vitest, all package typechecks, Playwright 13 passed (1 opt-in skip), rebuilt Compose container, `/.well-known` route served from the production image, official checker 7/7.
