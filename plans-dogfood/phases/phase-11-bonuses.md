# Phase 11: Bonus Challenges

Only start after required T1/T2 acceptance, offline operability, submission docs, and final buffer are secure. Bonus points are tie-breakers only: they do not alter the weighted 1–5 main score. They also help determine the Best Judging Engine prize.

## Normalization Proof +5

Deliver:
- raw fixture score table;
- normalized table;
- ranking before/after;
- mathematical explanation;
- zero-variance handling;
- sensitivity/limitations section;
- reproducible script/test.

Suggested artifact: `docs/NORMALIZATION-PROOF.md`.

## Pairwise Mode +5

Add alternative judging mode:
- pairwise assignment/session table;
- pairwise comparison endpoint;
- Bradley-Terry style estimator;
- convergence/reproducibility tests;
- organizer mode selection;
- no mixing with rubric rankings unless explicitly designed.

Do not attempt unless weighted judging is already solid.

## Threat Model +3

Artifact: `THREAT-MODEL.md`.

Cover:
- Sybil voting;
- ballot stuffing;
- judge collusion;
- IDOR;
- deadline gaming;
- submission scraping;
- session theft;
- malicious files;
- CSV injection;
- webhook SSRF if T4 built;
- known accepted risks.

## API First +3

Requires:
- every UI command represented in OpenAPI;
- contract tests between documented schema and handlers;
- no business behavior available only through private Server Actions.
- This +3 is a tie-break bonus only, not an addition to the weighted score.

## Selection rule

Pick the bonus with strongest existing foundation. One fully proven bonus is preferred over several incomplete ones.
