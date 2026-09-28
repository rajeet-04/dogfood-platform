# DOGFOOD Event Brief

## Competition frame

DOGFOOD is a 72-hour build focused on creating a self-hosted hackathon submission and judging platform. The winning system should be deployable by the organizers rather than functioning only as a demo.

## Hard constraints

- Project code is written during the competition window.
- Architecture planning, schema design, prompts, task breakdowns, and documentation can be prepared before kickoff.
- The required application must be self-hostable.
- Mandatory functionality must not depend on hosted authentication, hosted databases, or other cloud-only infrastructure.
- Docker Compose is the deployment contract.
- Authorization, judging integrity, and auditability are treated as server-side concerns.
- The implementation should remain understandable enough for post-event adoption.

## Product priorities

### Priority 1: Correctness

The application must reject invalid state transitions, unauthorized reads/writes, post-deadline submissions, invalid rubric scores, and cross-event resource access.

### Priority 2: Judging integrity

Judges must only see assigned work and their own evaluations while judging is active. Organizer progress views must not leak active raw scores.

### Priority 3: Adoptability

A clean local boot, deterministic migrations, useful seed fixtures, operational documentation, and understandable domain boundaries matter more than exotic infrastructure.

### Priority 4: Differentiation

The strongest differentiator is a transparent, testable judging engine with normalization diagnostics and reproducible ranking snapshots.

## Definition of a successful submission

The system boots locally with `docker compose up`, supports the full participant → submission → judge assignment → evaluation → ranking → publication flow, passes acceptance tests, and includes enough documentation for another engineer to operate it.

## Explicit non-goals for the core build

- Microservices
- Kubernetes
- Kafka
- Redis without measured need
- GraphQL
- Event sourcing
- A generalized CQRS framework
- Hosted-only auth
- Hosted-only storage
- Premature high-scale optimization

## Stretch order

1. Stronger judging diagnostics
2. Better organizer operations
3. Export polish
4. Public voting/comments
5. Webhooks/API extensions
6. Pairwise judging mode
