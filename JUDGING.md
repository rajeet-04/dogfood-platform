# DOGFOOD Judging Engine

This is the current-code account of T2 judging. It covers assignment through
published results and separates what the app enforces from what the official
acceptance runner checks. The runner's T2 checks cover own-score access,
peer-score denial, participant denial, and organizer CSV export; it does not
exercise every workflow described here.

## Assignment and recusals

An organizer can create a single assignment (`assignJudge`), submit a batch of
manual pairs (`assignJudges`, committed all-or-none in one transaction), or preview and commit a generated proposal
(`generateAssignmentProposal` then `commitAssignmentProposal`). Every selected
judge must be an active event judge. A judge may not be assigned to their own
team, to a project outside their configured track scope, or to a project from
which they have recused themselves. With no track-scope rows, a judge is
eligible across the event. Duplicate judge/project assignments are rejected.

The generated workflow accepts `reviewsPerProject`, judge IDs, optional track
IDs, and one of two deterministic strategies:

- `round_robin` walks projects in project-ID order and cycles through the
  supplied judge order, skipping ineligible judges and judges already assigned
  to that project.
- `balanced_by_track` greedily chooses the eligible judge with the fewest
  newly proposed assignments in that project's track, then the lowest total
  assignment count for the selected judges, then judge ID. It is a local
  heuristic, not a global optimizer: per-track counts start at zero for this
  proposal, previously existing work only affects the total-load tie-break,
  and track interactions, recusals, scopes, and existing assignments can
  prevent equal loads or full coverage. The project order and judge-ID final
  tie-break are deterministic.

The preview reports project count, required and covered reviews, complete and
under-covered projects, judge loads, and warnings when no eligible judge can
fill a slot. It can return a partial proposal. Commit requires the reviewed
proposal to match a freshly generated preview; changed assignments, track
eligibility, or capacity cause a conflict and require a new preview. Commit
rechecks project, membership, scope, team-conflict, recusal, and duplicate
assignment constraints in a transaction. The generator only targets submitted
projects and the selected tracks; manual assignment validates event, judge,
scope, team, and recusal relationships, but does not itself require the
project's state to be `SUBMITTED`.

A judge may declare a recusal for themself; an organizer may record one for an
active judge. Recusals are a hard exclusion in both generated and manual
assignment. An existing assignment must first be removed while still pending
(`ASSIGNED`); started work cannot be unassigned through the current workflow.
Organizers can list and delete recusal records. The audit trail records the
judge and project IDs, not the recusal reason.

Judging audit action names currently emitted are `judge.assign`,
`judge.unassign`, `judge.recusal.create`, `judge.recusal.delete`,
`evaluation.start`, `evaluation.submit`, `evaluation.lock`,
`ranking.generate`, and `ranking.publish`. Assignment and evaluation state
changes and their audit writes are transactional where implemented.

## Evaluation lifecycle and weighted rubric

An assignment moves through `ASSIGNED → IN_PROGRESS → SUBMITTED → LOCKED`.
Judges can save drafts before submission. Submission validates required
criteria and each score's configured range, writes current scores and an
immutable revision, and changes the assignment state in the same transaction.
An organizer can lock a submitted evaluation; results generation accepts
submitted and locked evaluations, but ignores drafts and in-progress work.

The organizer activates a rubric only when it has criteria and their positive
weights sum to `100` (within `1e-9`). For criterion `k`, score `x_k`, and
percentage weight `w_k`, the evaluator's raw total is:

```text
rawTotal = Σ_k (x_k × w_k)
```

Optional criteria may be omitted. When some criteria are omitted, ranking
rescales the submitted weighted contribution by `total configured weight / sum
of weights actually scored`, so a partially scored evaluation remains on the
same nominal rubric scale. The per-criterion snapshot breakdown records the
mean weighted contribution and number of judges who scored that criterion.
These event-rubric weights are separate from DOGFOOD's published competition
meta-score weights (Tier Completion & Correctness 40%, Judging Integrity 25%,
Adoptability & Operability 20%, Code Quality & Innovation 15%).

## Cross-judge normalization

For each judge `j`, the ranking service builds a batch from that judge's
submitted or locked evaluations. Each `x_ij` is that judge's weighted total for
project `i`; projects they did not score are absent from the batch. The default
`z-score` strategy uses the batch's population mean and population standard
deviation:

```text
μ_j = (1 / n_j) × Σ_i x_ij
σ_j = sqrt((1 / n_j) × Σ_i (x_ij − μ_j)²)
z_ij = (x_ij − μ_j) / σ_j
```

The batch handling is:

- `n_j < minimumBatchSize`: the whole judge batch is ineligible and contributes
  nothing to competitive scores. `minimumBatchSize` must be finite and at
  least 1; the implementation does not require it to be an integer.
- `σ_j = 0`: an eligible flat batch contributes normalized zero for every
  scored project and reports `ZERO_VARIANCE_BATCH`; it does not divide by
  zero. A one-score batch is therefore flat if the minimum is configured as 1.
- Missing project scores are not filled with zero. A project appears in the
  ranked set only if it receives at least one contribution from an eligible
  judge batch. If no batch is eligible, generation fails.
- `none` is the second strategy: it passes raw totals through, but still
  excludes batches below the configured minimum.

For each project, `competitiveScore` is the arithmetic mean of its normalized
contributions from eligible judges, so each eligible judge contributes one
vote per scored project regardless of their total batch size. The optional
`secondaryScore` used for ties is the mean raw total from all submitted
evaluations on that project, including evaluations in batches excluded from
the primary competitive score. The pure normalizer returns
`BELOW_MINIMUM_BATCH` and `ZERO_VARIANCE_BATCH` diagnostics; ranking snapshots
store the normalization configuration and versions, but do not include a
per-judge diagnostics list.

Z-scoring removes a judge's batch-level location and positive scale differences;
it does not establish that judges apply the rubric consistently or remove
project/track effects. A single changed score can change that judge's mean and
deviation, and therefore every normalized value in the batch. Small batches
that just meet the minimum can be especially sensitive. Changing the minimum,
submitted coverage, or assignment pattern can change the eligible judge set
and the resulting order. Compare raw and normalized rankings as a sensitivity
view, not as proof of a uniquely correct order.

### Reproducing the official fixture example

The official fixture has 41 project rows because it includes a duplicate-team
submission; the fixture seeder retains the first project for each team as a
canonical record and stores the duplicate and its scores as an import anomaly.
The seeder's active fixture rubric uses weights `0.33334`, `0.33333`, and
`0.33333` for functionality, quality, and innovation respectively. The
fixture itself does not specify a production rubric or normalization minimum,
so the proof script uses the seeder's rubric weights and explicitly sets
`minimumBatchSize = 2`.

Run from the repository root:

```bash
bun run scripts/judging-proof/official-fixture.ts
```

The script is database-free and uses no external dependencies. It mirrors the
seeder's canonical-project filtering, per-judge population z-score, eligible
judge averaging, raw secondary score, and configured tie ordering. For the
checked-in fixture and those stated settings, it reports 40 canonical projects,
122 canonical scores, 4 anomalous duplicate-team scores excluded, 30 judges,
28 eligible judge batches, 2 below-minimum batches, and 1 eligible flat batch.
All 40 projects are ranked; 36 change rank between the no-normalization and
z-score comparisons, with a maximum absolute movement of 19 places. Top five:

| No normalization | Z-score |
|---|---|
| `prj_11` | `prj_34` |
| `prj_34` | `prj_33` |
| `prj_10` | `prj_11` |
| `prj_25` | `prj_37` |
| `prj_37` | `prj_16` |

This is a reproducible illustration using the fixture seed's equal-weight
rubric, not an official leaderboard or evidence that these fixture scores are
representative of real judging.

## Ranking, snapshots, progress, and CSV

Ranking orders projects by `competitiveScore` descending. If configured,
`secondary-score` orders equal competitive scores by mean raw total descending;
`project-id` ascending is the final deterministic display order and is not a
competitive tiebreak. Equal competitive scores keep the same standard
competition rank even if secondary score or project ID changes their display
order (for example, ranks `1, 1, 3`). Unknown tie-breaker names and non-finite
competitive scores are rejected.

Generation persists scoring, normalization, and ranking version `1.0`, the
configuration, result payload, generator, and timestamp. Reading that snapshot
returns its stored payload, not a recalculation from current scores. Publishing
marks the snapshot public and advances an event in `JUDGING` to
`RESULTS_READY`. The ranking service can also generate/publish from
`RESULTS_READY` or `PUBLISHED` without rewinding the event. The results CSV is
available only after publication.

During `JUDGING`, the organizer dashboard exposes assignment identities and
statuses, submitted times, totals for `ASSIGNED`, `IN_PROGRESS`, `SUBMITTED`,
`LOCKED`, and `completed`, and whether all assignments are locked. It does not
include individual rubric values in that progress read model.

All exports are organizer-only and use CSV with stable headers and RFC 4180
escaping. Available files are `participants.csv`, `teams.csv`,
`projects.csv`, `judge-assignments.csv`, `evaluations.csv`, and `results.csv`.
Evaluation export contains each existing evaluation's score summary and
comments as soon as present, including during `JUDGING`; result export requires
a published snapshot. This makes CSV a distinct access path from
`evaluation:read`: the current direct-read lock restriction described below
does not filter the evaluation CSV. The official checker verifies only that
the organizer CSV route returns a CSV response; it does not check export
contents or timing.

## Pairwise mode (organizer-selected, never mixed with the rubric)

Pairwise is an alternative judging mode, not an add-on to the weighted rubric.

- **Selection:** the organizer chooses pairwise by generating and publishing a
  pairwise snapshot (`POST .../pairwise-ranking`, then `.../publish`). Until then
  the public `pairwise-results` route returns 404 and the rubric ranking is the
  only published result.
- **Separate data:** judges' choices live in `pairwise_comparisons`; rubric
  scores live in `evaluations`. A pairwise choice never creates or edits an
  evaluation, and publishing a pairwise snapshot never sets the event's rubric
  `publishedRankingSnapshotId`.
- **No mixing:** the Bradley-Terry estimator reads only comparisons. Its output
  is never blended with, normalized against, or added to rubric totals. The two
  rankings are published side by side and are compared, not merged.
- **Reproducibility:** each snapshot stores its input comparisons, configuration
  and algorithm version, so anyone can re-run the estimator on the stored input.
- **Verified by:** `tests/integration/pairwise-comparisons.test.ts` (asserts no
  rubric evaluations exist and no rubric snapshot is published after pairwise
  choices and publication) and `tests/unit/ranking/pairwise.test.ts`.

## Role isolation and explicit policy variance

The official site's published role matrix permits organizers and admins to
read own and peer scores, other-track data, aggregates, and audit data. The
application follows it: organizer `evaluation:read` is allowed at any stage,
and the organizer dashboard shows each judge's per-criterion scores in the
assignments table. Judges still read only their own evaluations.

| Actor | Official site: own / peer scores | Current app: direct evaluation read | Other-track work | Aggregate/progress | Audit log |
|---|---|---|---|---|---|
| Visitor | Denied / denied | Denied | Denied for private assigned work | No unpublished aggregate | Denied |
| Participant | Denied / denied | Denied | Denied for private assigned work | No unpublished aggregate | Denied |
| Judge | Own only | Own evaluation only, with assignment and track-scope checks | Denied when scoped outside their tracks; no scope rows means event-wide | No unpublished aggregate | Denied |
| Organizer | Permitted / permitted | All evaluations at any stage, matching the site matrix | Permitted | Assignment progress while judging; organizer ranking snapshots | Permitted |
| Platform admin | Permitted / permitted | Permission engine bypass; service-specific checks still apply | Permitted | Permitted | Permitted |

Published results are readable from the results read model after publication;
they are not the same as access to another judge's ballot. Judges cannot fetch
peer evaluations by assignment ID, and the backend also checks their assigned
project and track scope. The official runner explicitly probes own score,
peer-score denial, participant denial, and organizer CSV success.

## Verify this yourself

With a local instance and two judges assigned to the same project, request
Judge A's assignment as Judge B. A foreign assignment ID must not return
Judge A's evaluation. Also request the progress view as an organizer and
confirm it contains counts/statuses without rubric score values. The official
runner checks the peer-score denial and organizer CSV response; the
database-free fixture proof above checks the arithmetic separately.

### Verify a public judge participation record

Published judge records are Ed25519-signed. The issuer publishes its active
key fingerprint and trust pins at `/.well-known/dogfood-judge-records.json`.
To check a record without trusting the server's own verdict:

```sh
bun scripts/verify-judge-record.ts https://<host>/api/v1/judge-records/<recordId>
# or pin a fingerprint you obtained out of band
bun scripts/verify-judge-record.ts <record-url> --pin <sha256-spki-fingerprint>
```

The script recomputes the payload hash, verifies the signature, and checks the
signing key against the pins. It prints `valid`, `revoked` (a signed
revocation receipt), or `invalid` with a reason, and exits non-zero when
invalid.
