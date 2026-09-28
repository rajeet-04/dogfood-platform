# DOGFOOD Hackathon Planning Pack

**Event:** DOGFOOD Hackathon  
**Event site:** https://dogfoodhack.com/  
**Branch:** `dogfood`  
**Architecture status:** v1 approved  
**Primary objective:** Ship a reliable T1 + T2 implementation with a differentiated judging engine inside the 72-hour competition window.

## Planning authority order

1. Official `spec.md`, fixtures, and acceptance suite after release
2. [Master phase map](./phases/00-master-phase-map.md)
3. Phase documents under [`phases/`](./phases/)
4. Cross-phase contracts under [`specs/`](./specs/)
5. [Task-level implementation plan](./02-implementation-plan.md)
6. [72-hour execution runbook](./03-72-hour-runbook.md)

## Core documents

- [Event brief](./00-event-brief.md)
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
- Organizer cannot inspect raw judge scores until judging is locked

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

**Primary target:** Correct, polished T1 + T2.

**Stretch only after acceptance is green:** T3/T4 items or advanced pairwise judging.

The judging path is prioritized over gallery polish because judging integrity and operational adoptability carry more architectural risk and product value.
