# DOGFOOD Planning Self-Review

## Coverage result

The planning pack now has an official source-of-truth crosswalk in [`00-official-requirements.md`](../00-official-requirements.md), including all T1–T4 features, the 40/25/20/15 main score, tie-break bonuses, the $2,500 award allocation, eligibility rules, published fixture/checker behavior, required artifacts, timeline, and adoption terms. Phases 1–8 own T1/T2; Phases 9–10 own gated T3/T4; Phase 11 owns optional bonuses. The official seven-check acceptance suite is documented separately from full tier completion.

## Resolved planning inconsistencies

1. Team membership carries `event_id` so the database can enforce one team per user per event.
2. Phase numbering in the 72-hour runbook matches the authoritative phase documents.
3. The task plan points to phase/spec docs as contracts and `PLAN.md` as the status tracker.
4. Routes are adapters; application services own business behavior.
5. T3/T4 and bonuses are gated behind T1/T2, offline operation, documentation, and submission readiness.
6. The event's top-five placements and Best Judging Engine/Write-Up awards are explicitly distinguished from T1–T4 product capability tiers.
7. The official `.dogfood.toml` format and all seven published checks are recorded.

## Open reconciliation and eligibility items

### Organizer raw-score visibility

The main site's role matrix marks organizers as permitted to see own/peer scores, other tracks, aggregates, and audit. Architecture v1 currently hides raw scores until judging lock. The published acceptance suite does not test this timing. Keep the conflict visible and resolve it explicitly against the site before claiming exact role-matrix compliance; judge-to-judge and judge-to-track isolation are required.

### Event lifecycle / fixture states

The official executable spec only insists that the fixture's past `submissions_close` date is honored and that a closed submission is rejected with 4xx. Keep richer planned event states if useful, but ensure fixture import yields the checked closed state without depending on client clocks.

### Current implementation evidence versus competition eligibility

The current local acceptance report cites a Sep 26, 2026 implementation commit, before the published Sep 26, 18:00 UTC coding window. The event prohibits pre-existing project code. Track code provenance as a critical eligibility issue; do not present the existing checkout as eligible solely because local tests pass.

### Email-gated voting, asset limits, and CSV schemas

The main site names voter-access modes and image submission fields but the acceptance suite does not define email delivery, file-size/MIME limits, image counts, or all export columns. Phase 9/Phase 3 must choose self-hosted/offline behavior and document conservative limits without introducing a hosted dependency.

### T4 API surface

The event site requires every UI action to have a REST API and webhooks; no published acceptance checks verify T4. Keep API parity and OpenAPI contract tests as a distinct Phase 10 exit gate.

## Official acceptance contract

`run.py` checks only: (1) public gallery status 200, (2) known fixture title visible, (3) closed-event participant submission rejected, (4) Judge A can read own scores, (5) Judge B cannot read Judge A's scores, (6) participant cannot read judge scores, and (7) organizer CSV export returns 200/CSV. It does not verify the complete T1–T4 feature set, UI, code provenance, docs, or network-off boot.

## Plan quality checks

- Dependency: required T1/T2 phases have explicit exit gates; stretch cannot start while required gates are red.
- Ownership: routes call services; pure judging engines do not import DB/HTTP modules.
- Security: cross-event IDOR, peer-score leakage, deadline bypass, transactional audit, and ranking determinism have explicit tests.
- Evidence: each tier claim needs the official report plus manual/documentation evidence for advertised features the suite does not inspect.
- Eligibility: only project code authored during the event window may be submitted.
