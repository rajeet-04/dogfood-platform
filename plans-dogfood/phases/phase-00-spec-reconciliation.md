# Phase 0: Spec Reconciliation & Acceptance Harness

## Goal

Turn the released `spec.md`, `fixtures.json`, and official acceptance suite into the exact implementation contract before writing project code.

## Inputs

- official website brief and tier/scoring/prize/rules sections
- published `spec.md`
- official `fixtures.json`
- official `run.py` acceptance suite
- current Architecture v1
- API and DB planning docs

## Engineering work

1. Read the main site for all T1–T4 features, 40/25/20/15 scoring weights, bonus tie-break rules, prize allocation, eligibility rules, timeline, and adoption terms; keep these in `00-official-requirements.md`.
2. Read the already-published `spec.md`, `fixtures.json`, and `run.py`.
3. Create a delta record only for actual differences between this plan and official sources.
4. Map each advertised feature and each official acceptance assertion to tier → phase → endpoint/service → data → test/evidence → owner.
5. Freeze exact field shapes, fixture date semantics, credentials, route map, `.dogfood.toml` syntax, and report generation.
6. Implement a deterministic, idempotent fixture seed path that prints four role headers and loads the shared 40-project/30-judge/8-track fixture, including its edge cases.
7. Record which tier requirements are outside the seven official checks; do not treat a green report as proof of untested features.
8. Reconcile the official event role matrix with the architecture's organizer raw-score lock policy; the acceptance suite does not decide organizer score timing.
9. Check code provenance against the Sep 26 18:00 UTC kickoff rule before treating current implementation as eligible.

## Database work

No production migration is written before spec reconciliation. Update planned schema names/types only.

## Endpoints

No project endpoint implementation yet. Freeze route inventory and request/response shapes.

## Official acceptance assertions

- T1: public gallery responds 200 without auth.
- T1: a known fixture project is visible in the gallery response.
- T1: participant submission to the already-closed fixture event is rejected with 4xx.
- T2: Judge A can read own scores (200).
- T2: Judge B cannot read Judge A's scores (401/403, backend-enforced).
- T2: participant cannot use judge score access (401/403).
- T2: organizer can export CSV (200, CSV body).

Run `python3 run.py .dogfood.toml` and commit its output as `acceptance-report.txt`, including failures. Configure actual route names and working role headers in `.dogfood.toml`; the checker does not log in or require fixed routes.

## Exit gate

- Every official requirement maps to a planned phase.
- No known contradiction remains between official spec and Architecture v1.
- Exact T1/T2 required surface is frozen.
- Team understands what constitutes an acceptance pass.

## Commit

`docs: reconcile dogfood official spec`
