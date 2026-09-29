# DOGFOOD Acceptance Checklist

## Official tier ladder and score evidence

- [ ] T1 gate is fully met before any T1 claim; T1 is required to be judged.
- [ ] T1 includes authentication/sessions, visitor/participant/judge/organizer/admin roles, event dates/tracks/prizes, invite-link teams, editable submissions until deadline, server-side deadline enforcement, and public gallery search/filter.
- [ ] Submission supports title/name, tagline, long description, thumbnail, image gallery, demo-video URL, repository URL, live link, tech tags, track, and organizer-defined questions.
- [ ] T2 includes judge invitation and manual/batch/algorithmic assignment, weighted configurable rubric, backend peer and track isolation, organizer progress, documented normalization, and CSV exports at every stage.
- [ ] T3 includes configurable voter access, voting or a defended alternative, comments, hidden results during the window except organizers, randomized ballots, rate limits, duplicate detection, and readable anti-abuse audit.
- [ ] T4 includes REST/API parity and webhooks for UI actions, certificates, signed publicly verifiable judge records, embeddable gallery, and bulk import/export.
- [ ] Weighted score is understood and documented: Tier Completion & Correctness 40%, Judging Integrity 25%, Adoptability & Operability 20%, Code Quality & Innovation 15%, each rated 1–5.
- [ ] Bonus work is treated as tie-break only: Normalization Proof +5, Pairwise Mode +5, Threat Model +3, API First +3.
- [ ] Prize plan records 1st $800, 2nd $500, 3rd $350, 4th $200, 5th $150, Best Judging Engine $100, and four $100 Write-Up Quest awards ($2,500 total).

## Official checker and rules

- [ ] `.dogfood.toml` uses `[portal]`, `[tiers]`, `[auth]`, and `[routes]`, with honest claims and working organizer/judge A/judge B/participant headers.
- [ ] Official `fixtures.json` is loaded at boot: 40 projects, 30 judges, 8 tracks, flat scores, incomplete batches, duplicate submission, missing scores.
- [ ] `python3 run.py .dogfood.toml` passes the three T1 and four T2 checks; commit its raw output as `acceptance-report.txt`.
- [ ] Do not infer untested T1–T4 behavior from the seven checks; retain manual evidence, tests, docs, and demo for the rest.
- [ ] `docker compose up` seeds the portal and works with the network disconnected.
- [ ] All submitted project code was written between Sep 26, 2026 18:00 UTC and Sep 29, 2026 18:00 UTC; pre-event code is not reused as competition code.
- [ ] Repository is public and OSI licensed; team is 1–4 people; AI/frameworks are allowed and implementation must be defensible.
- [ ] Five-minute demo shows create → submit → judge → publish; required `README.md`, `ARCHITECTURE.md`, `DATA-MODEL.md`, and `JUDGING.md` are complete.

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
- [ ] Organizer can read individual raw scores at any stage (official role matrix); judges still cannot read peers.
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

- [ ] Organizer can see completion progress and per-assignment scores while judging.
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
