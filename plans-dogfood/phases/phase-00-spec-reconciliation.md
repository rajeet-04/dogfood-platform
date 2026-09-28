# Phase 0: Spec Reconciliation & Acceptance Harness

## Goal

Turn the released `spec.md`, `fixtures.json`, and official acceptance suite into the exact implementation contract before writing project code.

## Inputs

- official `spec.md`
- official `fixtures.json`
- official acceptance suite
- current Architecture v1
- API and DB planning docs

## Engineering work

1. Create `SPEC-DELTA.md` with every difference between pre-event planning and official spec.
2. Create an acceptance matrix: acceptance test ID → tier → feature → endpoint → table → owner.
3. Freeze exact enum values, required fields, date semantics, and seed-data assumptions.
4. Confirm required localhost port and Compose behavior.
5. Confirm whether the official suite expects REST endpoints, rendered UI, or both.
6. Confirm tier claim syntax for `.dogfood.toml`.
7. Confirm fixture import path and idempotence requirements.
8. Confirm exact CSV schemas if provided.

## Database work

No production migration is written before spec reconciliation. Update planned schema names/types only.

## Endpoints

No project endpoint implementation yet. Freeze route inventory and request/response shapes.

## Tests

- Run official suite against an empty/nonexistent app once to understand failure categories.
- Capture baseline output.
- Create a local checklist for each official assertion.

## Exit gate

- Every official requirement maps to a planned phase.
- No known contradiction remains between official spec and Architecture v1.
- Exact T1/T2 required surface is frozen.
- Team understands what constitutes an acceptance pass.

## Commit

`docs: reconcile dogfood official spec`
