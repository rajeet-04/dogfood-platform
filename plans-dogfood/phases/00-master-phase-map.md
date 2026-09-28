# DOGFOOD Master Phase Map

**Planning rule:** a phase is complete only when its database changes, application services, endpoints, UI surfaces, security tests, and exit criteria are all green.

**Sources:** official DOGFOOD main site for tiers/scoring/prizes/rules; published `spec.md`, fixtures, and `run.py` for machine-checked behavior; [official requirements crosswalk](../00-official-requirements.md); approved Architecture v1 subject to documented conflicts.

## Phase order

| Phase | Name | Tier | Purpose |
|---|---|---|---|
| 0 | Spec Reconciliation & Test Harness | Pre-build | Convert official spec into exact implementation contract |
| 1 | Runtime, Identity & Sessions | T1 | Offline local boot, authentication/sessions, and visitor/participant/judge/organizer/admin roles |
| 2 | Event Configuration & Authorization | T1 | Event dates, tracks, prizes, role model, and organizer-defined questions |
| 3 | Teams, Projects, Assets & Gallery | T1 | Invite-link teams; complete editable submission fields/assets; deadline enforcement; searchable/filterable public gallery |
| 4 | Judging Setup | T2 | Judge invitations; batch/algorithmic assignment; weighted rubric; track boundaries |
| 5 | Evaluation & Judging Engine | T2 | Assigned-only judging; peer/track isolation; progress; documented normalization |
| 6 | Ranking, Results, Export & Audit | T2 | Reproducible results, publication, readable audit, CSV export at every stage |
| 7 | Product Surfaces & UX Integration | T1/T2 | Complete role-specific interfaces |
| 8 | Operability, Acceptance & Submission | T1/T2 | Offline boot, docs, acceptance report, packaging |
| 9 | Public Voting & Comments | T3 gated | Community layer only after T2 is green |
| 10 | API, Webhooks, Portability & Records | T4 gated | API-first stretch and migration paths |
| 11 | Bonus Challenges | Optional | Normalization proof, pairwise, threat model, API-first |

## Critical path

```text
0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8
                              ↘
                                9 → 10
                              ↘
                                11
```

Phases 9-11 are forbidden while required T1/T2 acceptance, offline boot, required docs, or submission artifacts are red. The official seven-check program verifies only a subset of T1/T2; phase exit gates must include the full advertised tier behavior.

## Cross-phase invariants

- Every protected object is event-scoped.
- Server/database time controls deadlines.
- Judge project access flows through JudgeAssignment.
- A judge cannot see peer ballots.
- Track-scoped judges cannot access another track.
- Organizer/admin operations are server-authorized.
- Business mutation + audit event occur in the same transaction when audit is required.
- Project/evaluation history uses immutable revisions.
- Ranking snapshots persist algorithms/configuration and are not silently recomputed.
- Required path uses no cloud dependency.
- `docker compose up` starts a seeded working portal.

## Phase exit discipline

A phase cannot be marked complete with:
- skipped negative authorization tests;
- undocumented database migrations;
- an endpoint that duplicates domain logic in a route handler;
- UI-only enforcement of a server rule;
- failing official acceptance cases relevant to that phase;
- unresolved placeholders in the phase document.

## File ownership

- `specs/` contains stable cross-phase contracts.
- `phases/` contains sequence and execution gates.
- `02-implementation-plan.md` remains the task-level execution index.
- `03-72-hour-runbook.md` maps phases to competition time.
