# DOGFOOD Event Brief

## Competition frame

DOGFOOD is a free, online, 72-hour build event running **September 26–29, 2026**. Teams build one product: a self-hosted hackathon submission and judging platform. The winner is intended to be forked and operated by Hackathon Raptors, with authors retaining ownership and receiving credit. The event site and executable spec are the sources of truth; the full requirement crosswalk is [00-official-requirements.md](./00-official-requirements.md).

## Scoring and prize frame

Main score (each criterion rated 1–5, final score a weighted average):

- Tier Completion & Correctness — **40%**
- Judging Integrity — **25%**
- Adoptability & Operability — **20%**
- Code Quality & Innovation — **15%**

T1 is required to be judged. A clean, correct T2 outranks a broken T4. Optional bonus challenges are tie-breakers only and do not increase the weighted score. The **$2,500** pool is: 1st $800, 2nd $500, 3rd $350, 4th $200, 5th $150, Best Judging Engine $100, and four Write-Up Quest awards at $100 each. T1–T4 are product capability tiers; these placements and category prizes are competition awards, not tiers.

## Eligibility and runtime constraints

- Team size: 1–4; solo is welcome.
- All project code must be written in the official 72-hour window (Sep 26 18:00 UTC to Sep 29 18:00 UTC). Planning, reading, stack choice, schema sketches, prompts, and documentation are allowed earlier; a pre-existing project or renamed open-source platform is not.
- Open source under an OSI-approved license, MIT or Apache-2.0 preferred. Public GitHub repository at submission; anonymous usernames are allowed if the team is reachable for judge follow-up.
- AI tools, frameworks, libraries, and boilerplate generators are allowed; the team must be able to defend the submitted schema and implementation.
- `docker compose up` must start a seeded, working portal on a laptop with the network off. No cloud account, hosted database/auth, external API, or other hosted service may be required.
- T1 must work to be judged; tier claims must match evidence.

## Product priorities

1. **Correctness and tier completion:** implement the tier ladder from the official requirements crosswalk; enforce state, role, resource, score, and deadline rules on the server.
2. **Judging integrity:** backend-enforced judge and track boundaries, defensible assignment and normalization, visible diagnostics, and an audit trail.
3. **Adoptability:** one-command offline boot with official fixtures, useful docs, migrations, and complete import/export paths.
4. **Code quality and innovation:** clean module boundaries, defensible data model, and a decision with demonstrated value.

## Definition of a submission-ready entry

The portal boots from `docker compose up` with official fixtures and no network dependency; can take a participant project through judging and published results; passes the official `run.py` checks for honestly claimed tiers; and includes a committed `acceptance-report.txt`, `.dogfood.toml`, public source, OSI license, `README.md`, `ARCHITECTURE.md`, `DATA-MODEL.md`, `JUDGING.md`, and a five-minute create → submit → judge → publish demo.

## Stretch policy

T3 public voting/comments and T4 integrations are part of the published ladder, not replacements for T1/T2. Start them only after required T1/T2 acceptance, offline operability, docs, and submission artifacts are green. Select bonuses based on a complete, defensible result; they break ties only.
