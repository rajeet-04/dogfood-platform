# Phase 11: Bonus Challenges

Only start after core tier goals are secure.

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

## Selection rule

Pick the bonus with strongest existing foundation. One fully proven bonus is preferred over several incomplete ones.
