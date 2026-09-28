# DOGFOOD Acceptance Checklist

## Boot and operations

- [ ] Fresh clone has documented prerequisites.
- [ ] `docker compose up` starts all required services.
- [ ] PostgreSQL becomes healthy before application readiness.
- [ ] Database migrations apply from an empty database.
- [ ] Required functionality works without external cloud services.
- [ ] `.env.example` documents every required variable.
- [ ] Health/readiness endpoint reports database connectivity.

## Authentication and authorization

- [ ] Anonymous user cannot access protected participant/judge/organizer actions.
- [ ] Participant cannot call organizer commands.
- [ ] Judge cannot call organizer commands.
- [ ] Organizer cannot act as judge in the same event.
- [ ] Resource IDs from another event are rejected.
- [ ] Judge can access only explicitly assigned projects.
- [ ] Judge cannot read another judge's raw evaluation.
- [ ] Organizer cannot read individual raw scores while judging is active.
- [ ] Platform admin behavior is explicit and audited.

## Participant workflow

- [ ] Participant can create/join permitted team.
- [ ] Participant can create project.
- [ ] Project changes create immutable revisions.
- [ ] Participant can submit before deadline.
- [ ] Participant cannot submit after deadline via UI or direct request.
- [ ] Project becomes locked according to event state.
- [ ] Audit log records critical participant mutations.

## Rubric and judge workflow

- [ ] Rubric rejects invalid criterion ranges.
- [ ] Rubric cannot activate unless weights satisfy required total.
- [ ] Organizer can assign judges.
- [ ] Judge queue shows incomplete assignments.
- [ ] Judge can save draft evaluation.
- [ ] Score outside criterion range is rejected.
- [ ] Judge can submit valid evaluation.
- [ ] Submitted/locked evaluation obeys state transition rules.
- [ ] Evaluation changes retain revision history.
- [ ] Audit log captures submission/lock actions.

## Judging mathematics

- [ ] Weighted score output matches fixture calculations.
- [ ] Normalization is deterministic.
- [ ] Zero-variance judge does not divide by zero.
- [ ] Zero-variance batch emits diagnostic.
- [ ] Batch below minimum is marked normalization-ineligible.
- [ ] Missing evaluation is not converted to score zero.
- [ ] Cross-judge aggregation is deterministic.
- [ ] Tie behavior is stable and documented.
- [ ] Algorithm versions are persisted.

## Rankings

- [ ] Organizer can see completion progress without raw active scores.
- [ ] Ranking generation requires valid judging state.
- [ ] RankingSnapshot persists configuration and algorithm versions.
- [ ] Re-reading snapshot does not recompute it.
- [ ] Publication creates stable public results.
- [ ] Published historical results remain reproducible.

## Audit

- [ ] Business mutation and audit insert share transaction.
- [ ] Failed mutation does not leave phantom audit event.
- [ ] Sensitive organizer evaluation reads after lock can be audited.
- [ ] Normal application behavior cannot modify/delete audit history.

## Exports

- [ ] Required CSV exports use stable columns.
- [ ] Export respects event authorization.
- [ ] Export handles commas/newlines/quotes correctly.
- [ ] Empty result set produces valid output.

## Final submission gate

- [ ] Unit tests green.
- [ ] Integration tests green.
- [ ] Playwright acceptance tests green.
- [ ] Official/released acceptance suite green.
- [ ] Clean Docker boot verified.
- [ ] README complete.
- [ ] License included.
- [ ] No required secrets committed.
- [ ] Demo path rehearsed.
- [ ] Submission completed with deadline buffer.
