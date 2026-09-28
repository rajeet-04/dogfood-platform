# DOGFOOD 72-Hour Execution Runbook

## Operating rule

Follow the numbered phase documents. Do not start a gated stretch phase while any required T1/T2 acceptance path is red.

Phase windows below are gates, not a serial queue: within each window, engineers work their owned subsystem in parallel per the table in `06-team-roles-and-cut-lines.md`'s "Parallel execution model." That model is what makes the Hours 0-54 budget credible for 2-3 people — it assumes shared contracts are frozen by the end of Phase 0 and, for a 2-person team, an earlier stop-work check at Hour 46 instead of Hour 62.

Write documentation as you go, not at the end. The moment a phase gate goes green, the owning engineer appends the relevant section to `ARCHITECTURE.md`, `DATA-MODEL.md`, or `JUDGING.md` (whichever the phase feeds) while the decision is fresh. Phase 8 then polishes and reconciles these docs instead of drafting them from scratch under acceptance-suite pressure. These three files feed roughly 60% of the scoring rubric (Judging Integrity, Adoptability, Code Quality) and are not safe to rush.

## Before kickoff / Hours 0-2: Phase 0, Spec Reconciliation

The site lists the full tiers, scoring weights, bonuses, prizes, rules, and timeline; `spec.md`, `fixtures.json`, and `run.py` are already published. Read them before the coding window, reconcile the conflicting organizer-score policy, and freeze exact contracts. Project code may start only at kickoff, September 26, 2026 at 18:00 UTC.

**Gate:** every official T1/T2 requirement maps to a phase, endpoint, table, and test.

Remember that the main score weights Tier Completion & Correctness 40%, Judging Integrity 25%, Adoptability & Operability 20%, and Code Quality & Innovation 15%. Optional bonuses only break ties. Reserve evidence/docs effort across all criteria; a green seven-check acceptance report does not prove every advertised tier feature.

## Hours 2-8: Phase 1, Runtime / Identity / Sessions

Deliver Compose boot, PostgreSQL, migrations, fixture seed, local auth, secure sessions, health/readiness.

**Gate:** clean offline boot + auth integration tests green.

## Hours 8-16: Phase 2, Event Configuration / Authorization

Deliver events, state machine, memberships, tracks, prizes, custom questions, invitations, permission engine.

**Gate:** organizer can configure event and cross-event/role abuse tests are green.

## Hours 16-27: Phase 3, Teams / Projects / Gallery

Deliver team invites, one-team-per-event rule, assets, project revisions, custom answers, deadline enforcement, gallery search/filter.

**Gate:** full T1 participant lifecycle passes, including direct endpoint deadline attack.

## Hours 27-35: Phase 4, Judging Setup

Deliver judge invitations, track scopes, weighted rubric, manual assignment, batch/algorithmic assignment, judge queue.

**Gate:** assignment coverage is valid and unassigned/other-track access is denied by backend.

## Hours 35-46: Phase 5, Evaluation / Judging Engine

Deliver evaluation workflow, immutable evaluation revisions, weighted scoring, normalization, diagnostics, organizer progress.

**Gate:** strict/lenient/flat/incomplete judge fixtures are deterministic and peer ballots never leak.

## Hours 46-54: Phase 6, Ranking / Results / Export / Audit

Deliver ranking snapshots, publication, all required CSV exports, audit log, sensitive-read/export audit.

**Gate:** complete T2 lifecycle and exports are green.

## Hours 54-60: Phase 7, Product Surfaces

Integrate public, participant, judge, and organizer screens. Focus on role flows, empty/error/locked states, accessibility, and judge throughput.

**Gate:** Playwright primary journeys green.

## Hours 60-68: Phase 8, Operability / Acceptance

Freeze feature scope. Run full unit/integration/Playwright/official acceptance, clean Compose boot, network-off test, abuse matrix, docs and required root artifacts.

**Gate:** claimed T1/T2 tier passes official suite and a clean laptop can run the system without help.

## Hours 68-72: Submission buffer

Only release blockers, docs, demo, acceptance report, tier claim, license, final clean boot, and submission.

Reserve a dedicated 30-60 minute block inside this window solely for recording and rehearsing the 5-minute demo video (create → submit → judge → publish). Do not let it compete with last-minute bug fixing or doc edits for time; script the walkthrough once the docs stabilize so the recording is a single clean take.

Script one deliberate beat into that walkthrough: a raw API call attempting a cross-judge or cross-track read, shown getting rejected on camera. This is cheap (no UI work) and turns Judging Integrity from an assumed property into something a grader watches happen. Commit `acceptance-report.txt` as the direct, unedited output of the official `run.py`; use `README.md` to explain the result and `JUDGING.md` for a "Verify this yourself" section so a judge who never watches the video can confirm integrity from the docs alone.

Do not begin new features in this window.

## Stretch policy

Phase 9 T3, Phase 10 T4, and Phase 11 bonuses start only if Phase 8 reaches green early enough to preserve submission buffer. T3/T4 contribute to the Tier Completion score when implemented correctly; they are not mandatory acceptance-suite checks. Correctness outranks a higher but broken tier.

Priority if ahead:
1. Normalization Proof bonus if judging data is strong.
2. Threat Model bonus.
3. API First if REST/OpenAPI parity is already nearly complete.
4. T3 voting/comments.
5. T4 portability/webhooks.
6. Pairwise only with substantial buffer.

## Never cut

- backend authorization;
- event/track isolation;
- deadline enforcement;
- judge peer-score isolation;
- audit transaction integrity;
- deterministic ranking;
- seeded offline Compose boot;
- required CSV export;
- official acceptance verification.
