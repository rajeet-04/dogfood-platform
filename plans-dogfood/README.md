# DOGFOOD Hackathon Planning Pack

**Event:** DOGFOOD Hackathon  
**Event site:** https://dogfoodhack.com/  
**Branch:** `dogfood`  
**Architecture status:** v1 approved  
**Primary objective:** Ship the highest correct and honestly evidenced tier possible, with T1 required and a reliable T1/T2 judging core as the plan's delivery floor.

## Planning authority order

1. Official event site for tiers, scoring, prizes, rules, timeline, and adoption terms
2. Published `spec.md`, `fixtures.json`, and `run.py` for the executable acceptance contract
3. [Official requirements and scoring crosswalk](./00-official-requirements.md)
4. [Master phase map](./phases/00-master-phase-map.md)
5. Phase documents under [`phases/`](./phases/)
6. Cross-phase contracts under [`specs/`](./specs/)
7. [Task-level implementation plan](./02-implementation-plan.md)
8. [72-hour execution runbook](./03-72-hour-runbook.md)

The repository-level [PLAN.md](../PLAN.md) tracks current implementation evidence, competition eligibility, and remaining work. The official web brief is at <https://dogfoodhack.com/> and the published acceptance spec is at <https://dogfoodhack.com/spec/>.

## Core documents

- [Event brief](./00-event-brief.md)
- [Official requirements, score weights, bonuses, and prizes](./00-official-requirements.md)
- [Architecture v1](./01-architecture-v1.md)
- [Implementation plan](./02-implementation-plan.md)
- [72-hour execution runbook](./03-72-hour-runbook.md)
- [Risk register](./04-risk-register.md)
- [Acceptance checklist](./05-acceptance-checklist.md)
- [Team roles and cut-lines](./06-team-roles-and-cut-lines.md)

## Phase plan

- [Phase 0: Spec reconciliation](./phases/phase-00-spec-reconciliation.md)
- [Phase 1: Runtime, identity, sessions](./phases/phase-01-runtime-auth.md)
- [Phase 2: Event configuration and authorization](./phases/phase-02-event-authorization.md)
- [Phase 3: Teams, submissions, assets, gallery](./phases/phase-03-submissions-gallery.md)
- [Phase 4: Judging setup](./phases/phase-04-judging-setup.md)
- [Phase 5: Evaluation and judging engine](./phases/phase-05-evaluation-engine.md)
- [Phase 6: Ranking, results, exports, audit](./phases/phase-06-results-export-audit.md)
- [Phase 7: Product surfaces](./phases/phase-07-product-surfaces.md)
- [Phase 8: Operability and submission](./phases/phase-08-operability-submission.md)
- [Phase 9: T3 public features](./phases/phase-09-t3-public.md)
- [Phase 10: T4 integrations](./phases/phase-10-t4-integrations.md)
- [Phase 11: Bonus challenges](./phases/phase-11-bonuses.md)

## Engineering catalogs

- [Endpoint inventory](./specs/01-endpoint-inventory.md)
- [Database inventory](./specs/02-database-inventory.md)
- [Engineering contract](./specs/03-engineering-contract.md)
- [Detailed API contracts](./specs/04-api-contract-details.md)
- [T1/T2 data dictionary](./specs/05-data-dictionary-t1-t2.md)
- [Permissions and transactions](./specs/06-permissions-transactions.md)
- [Service interface catalog](./specs/07-service-interface-catalog.md)

## Frozen architecture decisions

- Modular monolith
- Next.js + TypeScript
- PostgreSQL + Drizzle
- Event-scoped RBAC with contextual ABAC
- Pure scoring, normalization, and ranking domain packages
- Immutable project and evaluation revisions
- Append-only transactional audit trail
- Versioned ranking snapshots
- Docker Compose with only application + PostgreSQL as required services
- Organizer cannot judge the same event
- Organizer raw-score access is a provisional v1 policy; reconcile with the official site's organizer-permitted role matrix in Phase 0

## Build principle

Every protected mutation follows:

```text
authenticate
→ authorize
→ validate input
→ validate domain/state/deadline
→ begin transaction
→ mutate
→ append audit event
→ commit
```

## Scope strategy

**Required gate:** T1. **Primary delivery floor:** Correct, polished T1 + T2 with defensible judging and local adoption evidence.

The official score is 40% Tier Completion & Correctness, 25% Judging Integrity, 20% Adoptability & Operability, and 15% Code Quality & Innovation. T1 is the eligibility floor; the higher the correctly working tier, the better, but a clean T2 outranks a broken T4. Bonus challenges only break ties; they do not add to the weighted score.

**Stretch only after all required T1/T2 acceptance and submission gates are green:** T3/T4 items or advanced pairwise judging.

The judging path is prioritized over gallery polish because judging integrity and operational adoptability carry more architectural risk and product value.
