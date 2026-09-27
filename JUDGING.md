# DOGFOOD Judging Engine

How raw judge scoring becomes a published, reproducible ranking. The pipeline
has three isolated stages: **weighted scoring** → **per-judge normalization**
→ **aggregation and ranking**. Each stage is a pure function in its own
package; the orchestrating snapshot service is
`packages/ranking/src/service.ts`.

## 1. Assignment

An organizer assigns a judge to a project (`judge_assignments`). Access flows
through that assignment: a judge can read and score only explicitly assigned
projects, regardless of whether they know another project's UUID.

Evaluation lifecycle per assignment:
`ASSIGNED → IN_PROGRESS → SUBMITTED → LOCKED`.

- Draft saves (`saveEvaluationDraft`) are allowed before submit.
- `submitEvaluation` validates every score against its criterion's
  `[min, max]` range and writes current scores, an immutable revision
  snapshot, and the transition in one transaction.
- `lockEvaluation` (organizer only, after submit) freezes the evaluation.

## 2. Weighted scoring (packages/scoring)

For an evaluation with criteria `k`, raw score `x_k` and weight `w_k`:

```text
total = Σ_k (x_k × w_k)
```

- Weights are raw multipliers; the rubric must activate only when criterion
  weights sum to exactly 100 (`RUBRIC_WEIGHT_TARGET`).
- Empty inputs and non-finite scores/weights are rejected with typed errors.
- This yields each judge's raw total per project — the **secondary score**.

## 3. Per-judge normalization (packages/normalization)

Judges calibrate differently, so each judge's batch of raw totals is
normalized. Strategy `z-score`:

```text
z_ij = (x_ij − μ_j) / σ_j
```

for the judge's batch, with population sigma:

```text
σ_j = sqrt( Σ_i (x_ij − μ_j)² / n_j )
```

Rules (all covered by tests):

- **Zero variance** (`[7,7,7,7]`): `σ = 0`. We never divide by zero; every
  project receives a neutral normalized contribution of `0`, and the batch
  carries the diagnostic `ZERO_VARIANCE_BATCH`.
- **Below minimum batch**: if `n_j < minimumBatchSize` the batch is
  normalization-*ineligible* (diagnostic `BELOW_MINIMUM_BATCH`) and excluded
  from aggregation.
- **Missing data**: an unevaluated project is simply absent from a judge's
  batch — never synthesized as score zero.
- Strategy `none` passes raw totals through unchanged.

## 4. Aggregation and ranking (packages/ranking)

For projects that appear in at least one eligible judge batch:

```text
competitiveScore(p) = mean over eligible judges of z_score(p)
secondaryScore(p)   = mean over eligible judges of raw weighted total(p)
```

Deterministic ordering in `rankProjects`:

1. `competitiveScore` descending;
2. if configured, `secondaryScore` descending;
3. `projectId` ascending — used only as deterministic display ordering, never
   as a meaningful competitive tiebreak.

Ranks use standard competition ranking: entries with equal competitive score
share the same rank, and ranks are assigned as the first position of the tie
group. `displayOrder` is the 1-based row position.

Unknown tie-breaker names and non-finite competitive scores are rejected.

## 5. Snapshots and versioning

`generateRankingSnapshot` (organizer only, event state `JUDGING`) persists:

- `scoring_version` (1.0)
- `normalization_version` (1.0)
- `ranking_version` (1.0)
- the full normalization/ranking configuration
- the generated result payload

Re-reading a snapshot returns the persisted payload; it is never recomputed
from current scores (proven by test). The same inputs generated twice produce
byte-identical results. `publishRankingSnapshot` sets `published_at` and moves
the event to `RESULTS_READY`.

## 6. Organizer confidentiality

While judging is active, an organizer sees completion progress only. Raw
individual scores are unavailable — the permission engine requires
`judgingLocked === true` for an organizer's `evaluation:read`. After an
evaluation is locked the organizer may read it.

## Known limits

- Normalization is per-judge batch (no cross-judge calibration beyond
  z-scoring each judge's own distribution).
- Only `z-score` and `none` strategies are implemented.
- Track-scoped scoping rows exist (`judge_track_scopes`) but track features are
  not built in the T1/T2 path.

## Verify this yourself

These requests prove isolation is backend-enforced — no UI tricks. Start a
local instance (see README), create two users, an event with a rubric, assign
judges, and run a `JUDGING`-state event, then:

**A judge cannot read another judge's evaluation by UUID:**

```bash
curl -i -H "Cookie: dogfood_session=<judgeA-token>" \
  http://localhost:3000/api/v1/events/<eventId>/evaluations/<judgeB-assignmentId>
```

Expected:

```text
HTTP/1.1 403
{ "error": { "code": "FORBIDDEN", "requestId": "..." } }
```

**A participant cannot run an organizer command:**

```bash
curl -i -X POST -H "Cookie: dogfood_session=<participant-token>" \
  -H "Content-Type: application/json" -d '{"normalizationStrategy":"z-score"}' \
  http://localhost:3000/api/v1/events/<eventId>/rankings
```

Expected:

```text
HTTP/1.1 403
{ "error": { "code": "FORBIDDEN", "requestId": "..." } }
```

**An organizer cannot read raw scores while judging is active:**

```bash
curl -i -H "Cookie: dogfood_session=<organizer-token>" \
  http://localhost:3000/api/v1/events/<eventId>/evaluations/<assignmentId>
```

Expected before lock: `403 FORBIDDEN`. Re-run after the organizer locks the
evaluation: `200` with criterion scores.

**Direct submission after the deadline is rejected regardless of client:**

```bash
curl -i -X POST -H "Cookie: dogfood_session=<participant-token>" \
  -H "Content-Type: application/json" -d '{"teamId":"...","title":"Late"}' \
  http://localhost:3000/api/v1/events/<eventId>/projects
```

Expected when `serverNow >= submission_closes_at`: `409` with code
`DEADLINE_PASSED`.