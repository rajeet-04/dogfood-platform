# DOGFOOD 2026 Official Requirements and Scoring

**Source reviewed:** DOGFOOD event site, revision 2.6, and the published spec page, checked 2026-09-28.  
**Purpose:** Canonical planning crosswalk for the competition requirements.  
**Execution status:** See the repository-level [PLAN.md](../PLAN.md) for implemented evidence and remaining work.

The event site is authoritative for the product tiers, scoring, prizes, rules, timeline, and adoption terms. The published `spec.md`, `fixtures.json`, and `run.py` are authoritative for the executable acceptance contract and fixture format. This document records both; where a detail conflicts, capture the conflict in Phase 0 instead of silently changing a claim.

## Competition objective

Build a new, open-source, self-hostable hackathon submission and judging platform during the 72-hour event window. It must be runnable by Hackathon Raptors after the event, not only shown as a hosted demo. The winning project is intended to be forked and used in production, with the authors retaining ownership and receiving event-page credit; organizer changes are to be returned as pull requests. If the strongest entries are close, the organizers may adopt one and borrow credited ideas from another.

## Product tier ladder

T1 is a judging gate: an entry that does not clear T1 is not judged. It is the floor, not the target. All tiers are one product and are judged for working behavior, correctness, and honest evidence. A clean T2 is stronger than a broken T4.

| Tier | Official scope | Planning homes |
|---|---|---|
| **T1 — Core** | Authentication and sessions; visitor, participant, judge, organizer, and admin roles; event setup with configurable dates, tracks, and prizes; team formation by invite link; project submission with draft/edit until deadline; server-enforced deadlines; public searchable/filterable gallery. Submission fields include name/title, tagline, long description, thumbnail, image gallery, hosted demo video URL, repository URL, live link, tech tags, track, and organizer-defined custom questions. | Phases 1–3 and 7; endpoint, database, and API contracts. |
| **T2 — Judging** | Judge invitation and assignment, manually, in batches, or algorithmically; weighted organizer-configurable rubric; backend enforcement that judges cannot read peer ballots or another track's work; live organizer progress; documented and defended cross-judge normalization; CSV export at every stage. | Phases 4–8; `JUDGING.md`; endpoint and service contracts. |
| **T3 — Public** | Community voting with open-link, email-gated, or authenticated access; an optional better-defended alternative such as quadratic voting; project comments; results hidden from everyone except organizers during voting; randomized ballot order; meaningful anti-abuse controls (rate limits, duplicate detection, readable audit trail). | Phase 9, only after required T1/T2 acceptance is green. |
| **T4 — Stretch** | REST API and webhooks covering every action available in the UI; certificate and record generation; signed, publicly verifiable judge participation records; embeddable gallery widget; bulk import and export for portability. | Phase 10, gated behind T1/T2 and an explicit T3 scope decision. |

The official acceptance suite does not verify every advertised feature in these tiers. Tier completion therefore also needs honest manual evidence, documentation, and demo coverage; a passing seven-check report alone is not proof of full T1–T4 completion.

### Official role-isolation matrix

Permissions are backend rules, not UI hiding. The site marks `+` as permitted and `✗` as denied at the API.

| Actor | Own scores | Peer scores | Other track | Aggregate | Audit log |
|---|---:|---:|---:|---:|---:|
| Visitor | ✗ | ✗ | ✗ | ✗ | ✗ |
| Participant | ✗ | ✗ | ✗ | ✗ | ✗ |
| Judge | + | ✗ | ✗ | ✗ | ✗ |
| Organizer | + | + | + | + | + |
| Admin | + | + | + | + | + |

The implementation follows this matrix (see the resolution note below).

## Main judging score

Each project is rated on a 1–5 scale across four weighted criteria. The final score is the weighted average of judges who reviewed the project.

| Criterion | Weight | What judges assess |
|---|---:|---|
| Tier Completion & Correctness | **40%** | T1 gate, highest correctly completed tier, correctness over breadth, acceptance-suite evidence, and honest tier claims. |
| Judging Integrity | **25%** | Backend-enforced role/track isolation, defensible normalization, readable audit trail, and thought given to vote abuse. |
| Adoptability & Operability | **20%** | One-command seeded local run, useful docs, import/export and exit path, and a clean license. |
| Code Quality & Innovation | **15%** | Idiomatic, maintainable implementation, defensible schema, and a valuable engineering decision. |

Do not add bonus points to the weighted score. The four bonuses below break ties and determine the Best Judging Engine prize; they do not change the 1–5 score.

## Optional bonus challenges

| Challenge | Points | Required evidence |
|---|---:|---|
| Normalization Proof | +5 | Fixture raw and normalized scores, ranking change, explanation, limitations, and reproducible proof. |
| Pairwise Mode | +5 | Alternative pairwise judging and a defended Bradley–Terry-style global ranking. |
| Threat Model | +3 | Defensible account of voting/submission abuse, attacks stopped, and accepted risks. |
| API First | +3 | Every UI action documented in a published OpenAPI spec and available through an API. |

Maximum tie-break total is +16. One complete bonus is preferred to several partial ones.

## Prize allocation

Total pool: **$2,500 USD**.

| Award | Amount | Award intent |
|---|---:|---|
| 1st / Grand Prize | $800 | The platform that honestly clears the ladder, enforces its rules, runs with one command, and is selected for production adoption. |
| 2nd / Runner-up | $500 | Exceptional end-to-end work, defensible judging math, and strong documentation. |
| 3rd place | $350 | Standout depth or a particularly strong engineering decision. |
| 4th place | $200 | Solid tier completion, honest scope, and no backend shortcuts. |
| 5th place | $150 | A top-five entry with notable working software. |
| Best Judging Engine | $100 | Strongest assignment strategy, normalization, role isolation, and audit trail. |
| Write-Up Quest | $400 total | Four independent $100 awards for technically substantive public build write-ups; optional and does not affect the main score. Publish on X, LinkedIn, Dev.to, a personal blog, or another developer platform; tag Hackathon Raptors. Judged for insight, not follower count. Closes Oct 5, 2026 at 18:00 UTC. |

The main awards are placements, not product tiers. T1–T4 describe feature scope; first through fifth describe competition results.

## Rules and eligibility

- Teams have 1–4 people; solo entries are welcome.
- Project code must be written during the 72-hour window, **September 26, 2026 18:00 UTC through September 29, 2026 18:00 UTC**. Planning, schema sketches, stack choice, spec reading, prompts, and documentation may be prepared earlier. A pre-existing project or renamed open-source platform is not eligible.
- Frameworks, libraries, boilerplate generators, and AI tools are allowed. Teams must be able to explain and defend what they submit.
- Submit a public GitHub repository under an OSI-approved license (MIT or Apache-2.0 preferred). Anonymous usernames are allowed if the team remains reachable for judge follow-up.
- `docker compose up` must start a seeded, working portal on a laptop with the network off. No hosted database, hosted authentication, cloud account, external API, or hosted service may be required.
- Claim only completed tiers in `.dogfood.toml`; the acceptance report is the evidence. Overclaiming is penalized.
- The solution must be new code, not design-only work, hardcoded-data UI, an auth-only demo, one half of the gallery/judging product, UI-only authorization, an undefended generated-code dump, a proprietary/hardware-dependent stack, or a rebrand of an existing open-source platform.

## Published acceptance contract

The downloadable official files are `spec.md`, `run.py`, and `fixtures.json`. The checker is standard-library Python 3, accepts a repository `.dogfood.toml`, makes HTTP requests against the running portal, and emits the report to commit. It does not prescribe route names, framework, language, database, schema, login flow, or repository layout.

The official `.dogfood.toml` contains:

- `[portal]`: `base_url`;
- `[tiers]`: `claimed` and one-sentence `pitch`;
- `[auth]`: working organizer, judge A, judge B, and participant request headers;
- `[routes]`: gallery, submit, judge scores, peer-scores probe, and CSV export paths.

Seed/bootstrap must load the shared fixtures and print usable test credentials/headers. The official fixtures contain 40 projects, 30 judges, and 8 tracks, with intentionally difficult data including a flat-scoring judge, incomplete review batches, and a duplicate submission. IDs are strings and timestamps are UTC ISO 8601. Missing scores remain missing data.

The acceptance suite contains seven checks:

| Tier | Check | Expected behavior |
|---|---|---|
| T1 | Public gallery | Unauthenticated `GET` returns 200. |
| T1 | Fixture project visible | Gallery response contains a known fixture title. |
| T1 | Closed-event submission denied | Participant `POST` against the fixture's past close date returns 4xx. |
| T2 | Judge reads own scores | Judge A receives 200. |
| T2 | Judge cannot read peer scores | Judge B probing Judge A's scores receives 401 or 403 from the backend. |
| T2 | Participant is not a judge | Participant score request receives 401 or 403. |
| T2 | Organizer CSV export | Organizer receives 200 and a CSV body. |

The checker does not validate T3/T4, UI quality, architecture, docs, portability, or all advertised T1/T2 behaviors. Those remain judge-reviewed requirements.

## Required submission package

- Public source repository and OSI-approved `LICENSE`.
- One-command, locally seeded portal (`docker compose up`) that can run offline.
- Root `.dogfood.toml` with honest claims, test headers, and actual route paths.
- Root `acceptance-report.txt`, generated by the published checker and committed even if it contains failures.
- `README.md`, `ARCHITECTURE.md`, `DATA-MODEL.md`, and `JUDGING.md` covering run instructions, honest limits, boundaries, schema/import/export, assignment/scoring/normalization.
- Five-minute demo video showing create → submit → judge → publish.

## Timeline and adoption

- Aug 24: registration opens.
- Sep 4: judging panel announced.
- Sep 21: team formation.
- Sep 24: `spec.md` published; read before kickoff and do not start project code.
- Sep 26, 18:00 UTC: kickoff; 72-hour coding window opens.
- Sep 29, 18:00 UTC: code freeze and submission deadline.
- Sep 29–Oct 8: judging and written feedback.
- Oct 9: winners and adoption decision announced.

The intended first-place adoption is a fork that Raptors self-hosts for its events. The authors retain ownership; credit stays on powered event pages and organizer improvements are offered back as pull requests.

## Planning crosswalk and known conflicts

| Requirement group | Planning owner | Evidence/tracking |
|---|---|---|
| T1 | Phases 1–3, 7; endpoint/API catalogs | `PLAN.md` T1 checklist and official report. |
| T2 | Phases 4–8; judging docs | `PLAN.md` T2 checklist, official report, docs, and demo. |
| T3 | Phase 9 | `PLAN.md` stretch checklist; must not displace T1/T2. |
| T4 | Phase 10 | `PLAN.md` stretch checklist; must not displace T1/T2. |
| Scoring, tie-break bonuses, cash awards | This document; `00-event-brief.md` | Keep product tiers distinct from award places; disclose scores and prizes in team planning. |
| Rules, official fixtures/checker, submission artifacts | Phase 0 and Phase 8 | Compare official files, then record exact results in `acceptance-report.txt`. |

**Resolved 2026-09-29:** the implementation follows the official role matrix. Organizers and admins can read raw per-judge scores at any stage; judges still see only their own scores, enforced in the backend. The earlier pre-event plan to hide raw scores from organizers until locking was dropped.

**Eligibility issue to resolve before competition submission:** the current repository history includes implementation artifacts dated before the Sep 26 kickoff (the local acceptance report cites a Sep 25 commit). The event rules prohibit pre-window project code. Verify provenance and use only eligible in-window code for a DOGFOOD submission; do not assume that code present in the current checkout qualifies.
