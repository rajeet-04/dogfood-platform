# DOGFOOD Team Roles and Cut-Lines

## Recommended team shape

Best operating shape for 2-3 people:

### Engineer A: Core/domain

Owns:
- database schema
- event state machine
- permissions
- submission invariants
- transactions
- audit

### Engineer B: Judging

Owns:
- rubrics
- judge assignments
- evaluation workflow
- scoring
- normalization
- ranking
- fixtures

### Engineer C: Product/integration

Owns:
- participant UI
- judge workspace
- organizer console
- exports
- Playwright
- README/demo

If only two people participate, Engineer A owns infrastructure/domain and Engineer B owns judging/product. Both share acceptance hardening.

## Shared contracts to freeze early

- Entity IDs and event-scoping rules
- Domain command names
- Error codes
- Event/Project/Evaluation states
- JudgeAssignment authorization interface
- Scoring/normalization input/output types
- RankingSnapshot schema

## Integration cadence

Merge/rebase at least every few hours. Avoid long-lived feature isolation during a 72-hour event.

Every domain-changing commit should include its tests.

No engineer starts a stretch subsystem without confirming the core acceptance suite is green.

## Parallel execution model (why Hours 0-54 is plausible for 2-3 people)

The phase list in `03-72-hour-runbook.md` reads as one critical path, but each phase is a gate, not a queue: inside a phase window, every engineer works their owned subsystem in parallel and integrates continuously, rather than the whole team working one phase at a time.

| Phase window | Gate-owning work | Parallel work by the others |
|---|---|---|
| Hours 0-2 (Phase 0) | Whole team: spec reconciliation | — (all-hands by design) |
| Hours 2-8 (Phase 1) | A: boot, auth, sessions | B: rubric/scoring domain types and pure functions, no DB yet; C: Docker/dev tooling, UI shell |
| Hours 8-16 (Phase 2) | A: events, RBAC, permission engine | B: judging fixtures and normalization edge-case tests, ahead of Phase 4/5; C: organizer console shell |
| Hours 16-27 (Phase 3) | A + C: teams, projects, gallery, deadline enforcement | B: continues judging engine against fixtures, independent of live DB |
| Hours 27-35 (Phase 4) | B: rubrics, assignment | A: wires assignment auth/isolation; C: judge/organizer assignment UI |
| Hours 35-46 (Phase 5) | B: evaluation, scoring, normalization | A: transactions/audit integration; C: judge workspace UI |
| Hours 46-54 (Phase 6) | B: ranking | A: audit finalization; C: exports, results UI |

This only holds if "Shared contracts to freeze early" (above) are actually frozen by the end of Phase 0. B and C's parallel work depends on building against agreed interfaces before A's integration layer exists. If a contract slips past Hour 2, the parallel model collapses into a serial one and the 54-hour budget stops being credible — treat a slipped contract freeze as its own stop-work trigger, not just a Phase 0 inconvenience.

### 2-person fallback is tighter, not just smaller

With only Engineer A and Engineer B, there is no third parallel track — B now covers both the judging engine and the UI work previously split across B and C. Don't treat this as a linear scale-down. Pull the "less than 10 hours remain and T1/T2 not green" stop-work trigger forward to Hour 46 (start of Phase 6) for a 2-person team: there's no slack engineer left to absorb a Phase 4/5 overrun.

## Cut-lines

### Must ship

- Auth
- Event membership / RBAC
- Teams
- Projects + revisions
- Deadlines
- Rubrics
- Judge assignment
- Evaluation workflow
- Judge isolation
- Weighted scoring
- Normalization edge cases
- Ranking snapshot
- Audit
- Required exports
- Docker boot
- Acceptance tests

### Ship if core is green

- Organizer diagnostics
- Better gallery
- Search/filter polish
- Audit viewer polish
- Extended exports

### Stretch

- Public voting
- Comments
- Webhooks
- Certificates
- Signed records
- Pairwise judging
- Bulk migration
- Advanced theming

## Write Up Quest (optional, $400, zero risk to main score)

Does not compete with the T1/T2 critical path and can be written any time from kickoff to Oct 5. Jot a one-line note whenever something write-up-worthy happens during the event (a role-isolation bug found at hour 60, a normalization approach that fought back, a cut feature and why) instead of trying to reconstruct the story afterward. Whoever has spare capacity near the end of the submission buffer turns the notes into the published write-up. No dedicated hours required in the runbook; this is a note-taking habit, not a scheduled task.

## Stop-work triggers

Immediately stop feature work and harden if any of these occur:

- Cross-role permission test fails.
- Cross-event IDOR is discovered.
- Docker clean boot breaks.
- Ranking is nondeterministic.
- Deadline endpoint can be bypassed.
- Audit transaction can diverge from business state.
- Less than 10 hours remain and T1/T2 acceptance is not fully green.
