# DOGFOOD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> Competition requirements and award scoring are defined in [`00-official-requirements.md`](./00-official-requirements.md). Use the repository-level [`PLAN.md`](../PLAN.md) as the current status tracker; the checkboxes below describe task steps and are not a statement that this checkout is competition-eligible or officially accepted.

**Goal:** Build a self-hosted hackathon submission and judging platform that reliably completes the participant → submission → judge assignment → evaluation → normalization → ranking → publication workflow.

**Architecture:** Implement a modular monolith in Next.js. Keep authorization/state transitions in application/domain modules, persist state in PostgreSQL through Drizzle, and keep scoring/normalization/ranking as pure TypeScript packages with no framework or database dependencies.

**Tech Stack:** Next.js, React, TypeScript, PostgreSQL, Drizzle, Zod, Tailwind CSS, shadcn/ui, Vitest, Playwright, Docker Compose.

**Specs:** `00-official-requirements.md`, `01-architecture-v1.md`, `phases/00-master-phase-map.md`, and the cross-phase contracts under `specs/`.

**Execution rule:** Implement phase-by-phase. The phase document is authoritative for scope and exit criteria; this file supplies task/TDD granularity. Do not skip a phase exit gate.

## Global Constraints

- Required application path must work without mandatory third-party cloud services.
- Required services are the application and PostgreSQL.
- Event authorization is server-authoritative and event-scoped.
- A user cannot be ORGANIZER and JUDGE in the same event.
- Judges can access evaluations only through explicit assignments.
- Provisional v1 policy: organizers cannot inspect individual raw judge scores until judging is locked. Reconcile this with the official event-site role matrix in Phase 0 before claiming exact conformance.
- Project and evaluation history is immutable through revisions.
- Critical business mutation and audit event insertion share one database transaction.
- Published rankings are persisted as versioned snapshots.
- Browser clocks never determine submission/judging deadlines.
- T1/T2 correctness takes priority over stretch scope.

## Review Focus

1. **Cross-event identifiers:** object IDs from Event A presented under Event B must return forbidden/not-found behavior without exposing data.
2. **Boundary timestamps:** writes exactly at or after submission/judging deadlines must follow one documented server-side rule consistently.
3. **Flat judge scoring:** zero-variance batches must never divide by zero or distort rankings.
4. **Incomplete judging:** missing evaluations must remain missing data and must not silently become zero.
5. **Transaction failure:** rollback must remove both the business mutation and its audit write.

---

## Target File Map

```text
apps/web/
  app/
    (auth)/
    events/[eventId]/
    api/v1/
  components/
  server/
    auth/
    errors/
    read-models/

packages/db/
  src/schema/
  src/client.ts
  src/migrations/

packages/auth/
  src/session.ts
  src/password.ts

packages/permissions/
  src/actions.ts
  src/can.ts

packages/events/
  src/domain.ts
  src/service.ts
  src/repository.ts

packages/teams/
  src/service.ts
  src/repository.ts

packages/submissions/
  src/domain.ts
  src/service.ts
  src/repository.ts

packages/judging/
  src/domain.ts
  src/service.ts
  src/repository.ts

packages/scoring/
  src/index.ts

packages/normalization/
  src/index.ts

packages/ranking/
  src/index.ts

packages/audit/
  src/service.ts

packages/exports/
  src/csv.ts

packages/validation/
  src/index.ts

tests/unit/
tests/integration/
tests/acceptance/
tests/fixtures/
```

---

### Task 1: Runtime scaffold and database boot

**Files:**
- Create: `docker-compose.yml`
- Create: `.env.example`
- Create: `apps/web/package.json`
- Create: `packages/db/src/client.ts`
- Create: `packages/db/src/schema/index.ts`
- Create: `tests/integration/boot.test.ts`

**Interfaces:**
- Consumes: none.
- Produces: `db` Drizzle client; deterministic application + PostgreSQL local boot.

- [ ] **Step 1: Write failing boot test**

Create an integration test that connects using `DATABASE_URL` and executes `select 1`.

- [ ] **Step 2: Run test and verify failure**

Run:

```bash
pnpm vitest tests/integration/boot.test.ts
```

Expected: FAIL because database/client configuration does not exist.

- [ ] **Step 3: Add Docker Compose**

Use two required services:

```yaml
services:
  db:
    image: postgres:17
    environment:
      POSTGRES_USER: dogfood
      POSTGRES_PASSWORD: dogfood
      POSTGRES_DB: dogfood
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U dogfood -d dogfood"]
      interval: 2s
      timeout: 2s
      retries: 20
    volumes:
      - dogfood-db:/var/lib/postgresql/data

  web:
    build: .
    depends_on:
      db:
        condition: service_healthy
    environment:
      DATABASE_URL: postgresql://dogfood:dogfood@db:5432/dogfood

volumes:
  dogfood-db:
```

- [ ] **Step 4: Implement Drizzle client**

Export one database client from `packages/db/src/client.ts`; do not create ad-hoc connections in feature modules.

- [ ] **Step 5: Run boot test**

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add docker-compose.yml .env.example apps packages/db tests/integration/boot.test.ts
git commit -m "chore: bootstrap dogfood runtime and database"
```

---

### Task 2: Identity, sessions, events, and event memberships

**Files:**
- Create: `packages/db/src/schema/users.ts`
- Create: `packages/db/src/schema/events.ts`
- Create: `packages/auth/src/password.ts`
- Create: `packages/auth/src/session.ts`
- Create: `packages/events/src/domain.ts`
- Create: `packages/events/src/service.ts`
- Test: `tests/unit/events/state-machine.test.ts`
- Test: `tests/integration/auth-event-membership.test.ts`

**Interfaces:**
- Consumes: `db`.
- Produces: `EventState`, `EventRole`, authenticated `Actor`, `createEvent()`, `transitionEvent()`.

- [ ] **Step 1: Write state-machine tests**

Pin valid sequence:

```text
DRAFT → REGISTRATION → SUBMISSIONS_OPEN → SUBMISSIONS_CLOSED
→ JUDGING → RESULTS_READY → PUBLISHED → ARCHIVED
```

Add a test proving `DRAFT → JUDGING` is rejected.

- [ ] **Step 2: Run unit test and verify failure**

Expected: FAIL because event transition code is absent.

- [ ] **Step 3: Implement event enums and transition guard**

Expose:

```ts
assertEventTransition(from: EventState, to: EventState): void
```

Throw typed `EVENT_STATE_INVALID` on illegal transitions.

- [ ] **Step 4: Write membership integration test**

Verify:
- same user can be participant in Event A and judge in Event B;
- same user cannot be organizer and judge in the same event;
- `UNIQUE(event_id, user_id)` prevents duplicate membership rows.

- [ ] **Step 5: Implement users/events/memberships schema and local sessions**

Password storage uses Argon2id via the Node `argon2` package. Store only encoded Argon2id hashes. Sessions use cryptographically random opaque tokens stored server-side; the browser receives only a Secure, HttpOnly, SameSite=Lax session cookie.

- [ ] **Step 6: Run tests**

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/auth packages/events packages/db/src/schema tests
git commit -m "feat: add identity events and event memberships"
```

---

### Task 3: Permission engine and cross-event isolation

**Files:**
- Create: `packages/permissions/src/actions.ts`
- Create: `packages/permissions/src/can.ts`
- Test: `tests/unit/permissions/permissions.test.ts`
- Test: `tests/integration/permissions/cross-event.test.ts`

**Interfaces:**
- Consumes: `Actor`, event membership, resource context.
- Produces: `can(actor, action, context): boolean` and `requirePermission(...): void`.

- [ ] **Step 1: Write permission matrix tests**

Include:
- participant can manage own project before lock;
- judge can read assigned project;
- judge cannot read unassigned project;
- organizer cannot submit judge evaluation;
- organizer cannot inspect raw evaluation while event is `JUDGING`;
- organizer may inspect after judging lock;
- resource from another event is denied.

- [ ] **Step 2: Run and confirm failure**

- [ ] **Step 3: Implement action constants and policy evaluation**

No route or component may inline role checks for protected business actions.

- [ ] **Step 4: Add cross-event integration test**

Use two events with valid IDs and verify Event A actor cannot mutate Event B object even when they know its UUID.

- [ ] **Step 5: Run tests and commit**

```bash
git add packages/permissions tests
git commit -m "feat: enforce event scoped permissions"
```

---

### Task 4: Teams and participant membership

**Files:**
- Create: `packages/db/src/schema/teams.ts`
- Create: `packages/teams/src/service.ts`
- Create: `packages/teams/src/repository.ts`
- Test: `tests/integration/teams.test.ts`

**Interfaces:**
- Consumes: actor, eventId.
- Produces: `createTeam()`, `joinTeam()`, `leaveTeam()`.

- [ ] **Step 1: Write failing integration tests**

Verify:
- participant creates team;
- duplicate team membership is rejected;
- participant cannot join a team in another event;
- non-participant cannot join participant team through direct service call.

- [ ] **Step 2: Implement Team and TeamMember schema**

Use event ownership and uniqueness constraints sufficient to prevent duplicate membership.

- [ ] **Step 3: Implement transaction-backed team commands**

Each successful create/join/leave emits an audit event once Task 7 audit infrastructure exists; until then expose the transaction hook required by that task.

- [ ] **Step 4: Run tests and commit**

```bash
git add packages/teams packages/db/src/schema/teams.ts tests/integration/teams.test.ts
git commit -m "feat: add event scoped teams"
```

---

### Task 5: Projects, immutable revisions, and deadlines

**Files:**
- Create: `packages/db/src/schema/projects.ts`
- Create: `packages/submissions/src/domain.ts`
- Create: `packages/submissions/src/service.ts`
- Create: `packages/submissions/src/repository.ts`
- Test: `tests/unit/submissions/deadline.test.ts`
- Test: `tests/integration/submissions.test.ts`

**Interfaces:**
- Consumes: actor, event, team.
- Produces: `createProject()`, `reviseProject()`, `submitProject()`, `withdrawProject()`.

- [ ] **Step 1: Write deadline boundary tests**

Specify one rule: writes are accepted only when `serverNow < deadline`. A request where `serverNow >= deadline` is rejected.

- [ ] **Step 2: Write immutable revision integration test**

Create revision 1, revise, assert revision 1 remains unchanged and project points to revision 2.

- [ ] **Step 3: Implement Project + ProjectRevision**

Enforce one competition project per team per event unless released spec explicitly requires multiple submissions.

- [ ] **Step 4: Implement submission commands**

Use server-side time; never accept client time as authority.

- [ ] **Step 5: Run tests and commit**

```bash
git add packages/submissions packages/db/src/schema/projects.ts tests
git commit -m "feat: add revisioned project submissions"
```

---

### Task 6: Rubrics and judge assignments

**Files:**
- Create: `packages/db/src/schema/rubrics.ts`
- Create: `packages/db/src/schema/judging.ts`
- Create: `packages/judging/src/domain.ts`
- Create: `packages/judging/src/service.ts`
- Test: `tests/unit/judging/rubric.test.ts`
- Test: `tests/integration/judging/assignment-isolation.test.ts`

**Interfaces:**
- Produces: `activateRubric()`, `assignJudge()`, `getJudgeQueue()`.

- [ ] **Step 1: Write rubric tests**

Reject:
- non-positive weights;
- `maxScore <= minScore`;
- activation when total weight differs from required total.

- [ ] **Step 2: Write assignment-isolation test**

Judge A assigned Project 1 must fail to fetch/evaluate Project 2 even with Project 2 UUID.

- [ ] **Step 3: Implement schema and domain invariants**

`JudgeAssignment(event_id, judge_id, project_id)` is unique.

- [ ] **Step 4: Implement queue read model**

Return only assignments belonging to current judge and event.

- [ ] **Step 5: Run tests and commit**

```bash
git add packages/judging packages/db/src/schema tests
git commit -m "feat: add rubrics and judge assignments"
```

---

### Task 7: Transactional audit infrastructure

**Files:**
- Create: `packages/db/src/schema/audit.ts`
- Create: `packages/audit/src/service.ts`
- Test: `tests/integration/audit-transaction.test.ts`

**Interfaces:**
- Produces: `appendAuditEvent(tx, event): Promise<void>`.

- [ ] **Step 1: Write rollback test**

Inside a transaction, mutate project + append audit + force an exception. Assert neither business mutation nor audit event persists.

- [ ] **Step 2: Implement append-only AuditEvent schema**

Application code exposes inserts and reads. It does not expose update/delete methods.

- [ ] **Step 3: Integrate audit into existing critical commands**

At minimum:
- event transition;
- team create/join;
- project revise/submit;
- judge assignment.

- [ ] **Step 4: Run tests and commit**

```bash
git add packages/audit packages/db/src/schema/audit.ts packages/events packages/teams packages/submissions packages/judging tests
git commit -m "feat: add transactional audit trail"
```

---

### Task 8: Evaluation workflow and revision history

**Files:**
- Modify: `packages/db/src/schema/judging.ts`
- Modify: `packages/judging/src/domain.ts`
- Modify: `packages/judging/src/service.ts`
- Test: `tests/unit/judging/evaluation-state.test.ts`
- Test: `tests/integration/judging/evaluation.test.ts`

**Interfaces:**
- Produces: `startEvaluation()`, `saveEvaluationDraft()`, `submitEvaluation()`, `lockEvaluation()`.

- [ ] **Step 1: Write state tests**

```text
ASSIGNED → IN_PROGRESS → SUBMITTED → LOCKED
```

Reject editing a locked evaluation.

- [ ] **Step 2: Write score range test**

A submitted score below criterion min or above max must fail with `INVALID_SCORE`.

- [ ] **Step 3: Implement Evaluation, EvaluationScore, EvaluationRevision**

Historical revisions store immutable score snapshots.

- [ ] **Step 4: Implement transaction-backed submit**

A successful submit writes current scores, a revision snapshot, state transition, and audit event atomically.

- [ ] **Step 5: Run tests and commit**

```bash
git add packages/judging packages/db/src/schema/judging.ts tests
git commit -m "feat: add auditable evaluation workflow"
```

---

### Task 9: Pure weighted scoring engine

**Files:**
- Create: `packages/scoring/src/index.ts`
- Test: `tests/unit/scoring/scoring.test.ts`

**Interfaces:**
- Produces:

```ts
type CriterionScore = {
  criterionId: string;
  score: number;
  weight: number;
};

type WeightedScoreResult = {
  total: number;
  contributions: Array<{
    criterionId: string;
    weightedScore: number;
  }>;
};

calculateWeightedScore(scores: CriterionScore[]): WeightedScoreResult;
```

- [ ] **Step 1: Write fixture calculation test**

Use hand-calculated weighted criteria and assert exact expected contribution values.

- [ ] **Step 2: Write invalid input tests**

Reject empty criteria where the active rubric requires criteria and reject non-finite numeric values.

- [ ] **Step 3: Implement minimal pure function**

No database imports.

- [ ] **Step 4: Run tests and commit**

```bash
git add packages/scoring tests/unit/scoring
git commit -m "feat: add deterministic weighted scoring"
```

---

### Task 10: Judge normalization engine

**Files:**
- Create: `packages/normalization/src/index.ts`
- Create: `tests/fixtures/judging.ts`
- Test: `tests/unit/normalization/normalization.test.ts`

**Interfaces:**
- Produces:

```ts
type JudgeScore = { projectId: string; score: number };

type NormalizationConfig = {
  strategy: "z-score" | "none";
  minimumBatchSize: number;
};

type NormalizedBatch = {
  eligible: boolean;
  values: Array<{ projectId: string; normalizedScore: number }>;
  diagnostics: string[];
};

normalizeJudgeBatch(
  scores: JudgeScore[],
  config: NormalizationConfig
): NormalizedBatch;
```

- [ ] **Step 1: Write ordinary z-score test**

Verify mean-centered output.

- [ ] **Step 2: Write zero-variance test**

Input `[7,7,7,7]` must:
- never divide by zero;
- return neutral normalized contribution;
- include `ZERO_VARIANCE_BATCH`.

- [ ] **Step 3: Write minimum-batch test**

If `scores.length < minimumBatchSize`, return `eligible: false`.

- [ ] **Step 4: Write missing-data test**

Absence of a project in a judge batch remains absence; do not synthesize score zero.

- [ ] **Step 5: Implement and run tests**

- [ ] **Step 6: Commit**

```bash
git add packages/normalization tests
git commit -m "feat: add judge score normalization"
```

---

### Task 11: Ranking engine and immutable snapshots

**Files:**
- Create: `packages/db/src/schema/rankings.ts`
- Create: `packages/ranking/src/index.ts`
- Create: `packages/ranking/src/service.ts`
- Test: `tests/unit/ranking/ranking.test.ts`
- Test: `tests/integration/ranking-snapshot.test.ts`

**Interfaces:**
- Produces: deterministic `rankProjects()`, `generateRankingSnapshot()`, `publishRankingSnapshot()`.

- [ ] **Step 1: Write deterministic ranking test**

Run same input repeatedly and assert identical output ordering and metadata.

- [ ] **Step 2: Write tie test**

Equal competitive score must use documented secondary criterion and then stable project ID only as deterministic display ordering.

- [ ] **Step 3: Implement ranking function**

No database access inside pure `rankProjects()`.

- [ ] **Step 4: Persist snapshot**

Snapshot stores:
- scoring version;
- normalization version;
- ranking version;
- configuration;
- result payload;
- generation actor/time;
- publication time.

- [ ] **Step 5: Prove snapshot read does not recalculate**

Change current algorithm constant in test fixture and verify persisted historical snapshot remains unchanged.

- [ ] **Step 6: Commit**

```bash
git add packages/ranking packages/db/src/schema/rankings.ts tests
git commit -m "feat: add reproducible ranking snapshots"
```

---

### Task 12: Participant, judge, and organizer application surfaces

**Files:**
- Create: `apps/web/app/events/[eventId]/participant/page.tsx`
- Create: `apps/web/app/events/[eventId]/judge/page.tsx`
- Create: `apps/web/app/events/[eventId]/organizer/page.tsx`
- Create: `apps/web/server/read-models/participant.ts`
- Create: `apps/web/server/read-models/judge.ts`
- Create: `apps/web/server/read-models/organizer.ts`
- Test: `tests/acceptance/core-flows.spec.ts`

**Interfaces:**
- Consumes application services and read models.
- Produces user-facing primary T1/T2 flows.

- [ ] **Step 1: Write Playwright participant flow**

Create team → project → revision → submit.

- [ ] **Step 2: Write Playwright judge flow**

Open assigned queue → evaluate → submit → verify lock behavior.

- [ ] **Step 3: Write Playwright organizer flow**

Configure rubric → assign judge → view progress → close judging → generate ranking → publish.

- [ ] **Step 4: Implement minimum usable pages**

Prefer simple forms/tables over custom visual systems.

- [ ] **Step 5: Add organizer confidentiality assertion**

While event is `JUDGING`, organizer UI/API response must contain completion state but no raw individual scores.

- [ ] **Step 6: Run Playwright and commit**

```bash
git add apps/web tests/acceptance
git commit -m "feat: add participant judge and organizer workflows"
```

---

### Task 13: Versioned REST API and typed errors

**Files:**
- Create: `apps/web/app/api/v1/events/route.ts`
- Create: `apps/web/app/api/v1/events/[eventId]/route.ts`
- Create: `apps/web/app/api/v1/events/[eventId]/teams/route.ts`
- Create: `apps/web/app/api/v1/events/[eventId]/projects/route.ts`
- Create: `apps/web/app/api/v1/events/[eventId]/judge-queue/route.ts`
- Create: `apps/web/app/api/v1/events/[eventId]/evaluations/[assignmentId]/route.ts`
- Create: `apps/web/app/api/v1/events/[eventId]/rankings/route.ts`
- Create: `apps/web/app/api/v1/events/[eventId]/results/route.ts`
- Create: `apps/web/server/errors/map-error.ts`
- Test: `tests/integration/api-v1.test.ts`

**Interfaces:**
- Consumes existing application services.
- Produces thin `/api/v1` adapters and stable error envelopes.

- [ ] **Step 1: Write error-envelope test**

Expected shape:

```json
{
  "error": {
    "code": "EVALUATION_LOCKED",
    "message": "This evaluation can no longer be modified."
  }
}
```

- [ ] **Step 2: Implement thin handlers**

Handlers parse, authenticate, invoke application service, and map typed errors. No business rule duplication.

- [ ] **Step 3: Add direct-request authorization tests**

Verify bypass attempts fail even without UI.

- [ ] **Step 4: Run tests and commit**

```bash
git add apps/web/app/api apps/web/server/errors tests/integration/api-v1.test.ts
git commit -m "feat: expose versioned application api"
```

---

### Task 14: Exports, readiness, fixtures, and operations

**Files:**
- Create: `packages/exports/src/csv.ts`
- Create: `apps/web/app/api/health/route.ts`
- Create: `tests/integration/export.test.ts`
- Create: `tests/integration/health.test.ts`
- Modify: `README.md`
- Modify: `.env.example`

**Interfaces:**
- Produces required CSV outputs and operational readiness checks.

- [ ] **Step 1: Write CSV escaping tests**

Cover commas, quotes, newlines, and empty result sets.

- [ ] **Step 2: Implement CSV export over authorized read models**

Do not bypass permissions to export data.

- [ ] **Step 3: Implement health/readiness**

Readiness requires database connectivity.

- [ ] **Step 4: Document clean setup**

README must include prerequisites, environment, `docker compose up`, migration behavior, seed/fixture command, tests, and architecture summary.

- [ ] **Step 5: Run operational tests and commit**

```bash
git add packages/exports apps/web/app/api/health tests README.md .env.example
git commit -m "feat: add exports and operational readiness"
```

---

### Task 15: Full acceptance hardening

**Files:**
- Modify tests under `tests/unit`, `tests/integration`, `tests/acceptance`
- Modify implementation only where failures reveal defects.

**Interfaces:**
- Consumes all prior deliverables.
- Produces release candidate.

- [ ] **Step 1: Run unit suite**

```bash
pnpm vitest tests/unit
```

Expected: all green.

- [ ] **Step 2: Run integration suite**

```bash
pnpm vitest tests/integration
```

Expected: all green.

- [ ] **Step 3: Run browser acceptance**

```bash
pnpm playwright test
```

Expected: all green.

- [ ] **Step 4: Run official/released acceptance suite**

Use the command supplied by the hackathon release. Treat failures as release blockers.

- [ ] **Step 5: Clean Docker test**

Destroy local containers/volumes, rebuild from scratch, and verify boot + migration + readiness.

- [ ] **Step 6: Abuse matrix**

Manually or automatically verify:
- participant → organizer endpoint: denied;
- judge → unassigned project: denied;
- event A ID under event B: denied;
- organizer raw-score read during judging: denied;
- post-deadline direct submission: denied.

- [ ] **Step 7: Ranking reproducibility**

Generate same snapshot inputs twice and confirm competitive ordering/results are identical.

- [ ] **Step 8: Commit release hardening**

```bash
git add .
git commit -m "test: harden dogfood acceptance flows"
```

---

### Task 16: Submission packaging

**Files:**
- Modify: `README.md`
- Create or verify: `LICENSE`
- Create: `docs/architecture.md`
- Create: `docs/judging-engine.md`

**Interfaces:**
- Produces competition-ready repository and technical narrative.

- [ ] **Step 1: Document architecture diagram and module boundaries**

- [ ] **Step 2: Document judging mathematics and diagnostics**

Explain weighted scoring, normalization, zero variance, incomplete batches, missing evaluations, aggregation, tie behavior, and algorithm versioning.

- [ ] **Step 3: Verify no required secret is committed**

- [ ] **Step 4: Verify license and public-repository requirements**

- [ ] **Step 5: Rehearse demo**

Demo sequence:
1. organizer event/rubric;
2. participant submission;
3. judge assignment/evaluation;
4. organizer progress without active score leakage;
5. judging lock;
6. deterministic ranking snapshot;
7. publication;
8. audit/revision history.

- [ ] **Step 6: Tag final submission commit only after clean verification**

```bash
git status
git log --oneline -10
```

The worktree must be clean and all required acceptance checks green before tagging.

---

## Dependency Order

```text
Task 1
  ↓
Task 2
  ↓
Task 3
  ↓
Task 4 ─────┐
  ↓         │
Task 5      │
  ↓         │
Task 6      │
  ↓         │
Task 7 ◀────┘
  ↓
Task 8
  ↓
Task 9
  ↓
Task 10
  ↓
Task 11
  ↓
Task 12
  ↓
Task 13
  ↓
Task 14
  ↓
Task 15
  ↓
Task 16
```

Tasks 9 and 10 may be developed in parallel after rubric/evaluation interfaces are frozen because they are pure packages.

## Scope Cut Rule

Do not add T3/T4 features until Task 15 is green for all required T1/T2 workflows.

When schedule pressure appears, cut in this order:

1. pairwise mode;
2. public comments/voting;
3. webhooks/certificates;
4. advanced theming/animation;
5. nonessential dashboard customization.

Never cut permission enforcement, deadlines, audit integrity, judge isolation, ranking determinism, Docker boot, or acceptance coverage.

## Recommended Execution Mode

Use **subagent-driven development** if enough model/tool budget is available. The plan has multiple bounded modules with important security interfaces, and independent review after each task is valuable.

Use **native execution** if time/token budget matters more than per-task independent review. In that mode, preserve the exact task order and run one fresh whole-branch review before final submission.
