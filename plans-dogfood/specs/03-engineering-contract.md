# DOGFOOD Engineering Contract

## Delivery architecture

Thin delivery adapters → application services → domain policies/pure engines → repositories → PostgreSQL.

Routes and React components do not own business rules.

## Standard command flow

```text
parse
→ authenticate
→ authorize
→ validate resource event ownership
→ validate state/deadline/domain invariant
→ transaction
→ mutation
→ audit
→ commit
→ map result
```

## Standard query flow

```text
authenticate if required
→ authorize
→ event/resource scoped query
→ explicit read model
→ serialize safe fields only
```

## Error catalog

- UNAUTHENTICATED
- FORBIDDEN
- NOT_FOUND
- VALIDATION_FAILED
- CONFLICT
- EVENT_STATE_INVALID
- DEADLINE_PASSED
- INVITATION_INVALID
- TEAM_RULE_VIOLATION
- SUBMISSION_INCOMPLETE
- JUDGE_NOT_ASSIGNED
- TRACK_SCOPE_VIOLATION
- EVALUATION_LOCKED
- INVALID_SCORE
- RUBRIC_INCOMPLETE
- JUDGING_INCOMPLETE
- RANKING_NOT_READY
- RATE_LIMITED

## Transaction-required commands

- accept invitation;
- join/leave team when membership invariants span rows;
- submit/withdraw project;
- assign/reassign judge;
- submit/lock evaluation;
- transition event;
- generate/publish ranking snapshot;
- voting mutation [T3];
- bulk import commit [T4].

## Testing requirements per service

Each service command needs:
1. happy-path unit/integration test;
2. unauthenticated/unauthorized test;
3. wrong-event resource test;
4. invalid state/deadline test when applicable;
5. transaction rollback test when multi-write;
6. idempotency/conflict test where retry is realistic.

## Security review checklist

- IDOR/cross-event access;
- role escalation;
- judge peer-score leakage;
- track scope leakage;
- deadline manipulation;
- token brute force/reuse;
- malicious asset upload;
- CSV injection/escaping;
- session theft/replay;
- T3 Sybil/rate abuse;
- T4 webhook SSRF/signature/replay.

## Observability

Every request receives request ID.
Structured logs include:
- request ID;
- actor ID when known;
- event ID when known;
- operation;
- status/error code;
- latency.

Never log passwords, session tokens, invitation tokens, raw credential material, or unnecessary ballots.

## Code quality

- strict TypeScript;
- Zod at external boundaries;
- explicit return types for exported service/domain functions;
- no `any` in domain packages;
- pure scoring engines;
- repository interfaces kept narrow;
- no circular package dependencies;
- one module owns each business concept.

## Commit discipline

One independently testable change per commit. Domain behavior and tests land together.
