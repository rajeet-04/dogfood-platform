# Phase 8: Operability, Acceptance & Submission

## Goal

Make the repository judgeable, reproducible, documented, and safe to hand to another operator.

## Required submission artifacts

- `README.md`
- `ARCHITECTURE.md`
- `DATA-MODEL.md`
- `JUDGING.md`
- `docker-compose.yml`
- `acceptance-report.txt`
- `LICENSE`
- `.dogfood.toml`
- five-minute demo video, linked from the README or submission metadata

## Seed and boot

`docker compose up` must:
1. start PostgreSQL;
2. apply migrations;
3. load official fixture data idempotently;
4. start app;
5. report readiness.

The boot path must work with the network disconnected and print working organizer, judge A, judge B, and participant request headers for the official checker. The official `.dogfood.toml` uses `[portal]`, `[tiers]`, `[auth]`, and `[routes]`; claims and route paths must match the running portal. Use the published fixtures and `run.py`, not substitute demo data.

No cloud account, API key, external database, or auth service.

## Operational engineering

- health endpoint;
- readiness endpoint;
- structured logs;
- request IDs;
- migration command;
- fixture reset command;
- documented backup/restore for PostgreSQL volume;
- documented local asset storage path;
- no secrets in repository;
- deterministic environment defaults suitable for judging.

## Acceptance hardening

Run:
- unit;
- integration;
- Playwright;
- official acceptance suite;
- clean Compose boot;
- network-off smoke test;
- authorization abuse matrix;
- deadline boundary;
- ranking reproducibility;
- export verification.

## Documentation

### ARCHITECTURE.md
Components, boundaries, deployment, transactions, security assumptions.

### DATA-MODEL.md
Tables, relationships, constraints, indexes, fixture/import/export paths.

### JUDGING.md
Assignment strategy, weighted scoring, normalization math, zero-variance behavior, incomplete batches, ranking/tie policy, known limits.

Include a short "Verify this yourself" section: the exact request that proves backend-enforced isolation (e.g. a judge or cross-track raw API call against another judge's assignment) and the exact rejection it returns. Let a skimming judge confirm integrity from the doc alone, without needing the demo video.

### README.md
One-command start, credentials/fixture users, ports, test commands, tier claims, known limits.

## Submission checks

- public GitHub repo;
- OSI license, MIT/Apache-2.0 preferred;
- `.dogfood.toml` claims only passing tiers;
- `acceptance-report.txt` is the direct output of official `python3 run.py .dogfood.toml`, committed unchanged even if it has failures; explain known gaps separately in `README.md`;
- 5-minute demo video covers create → submit → judge → publish, and includes one scripted beat showing a denied cross-judge/cross-track raw API request (proof of backend enforcement, not just a hidden UI button);
- code freeze respected;
- all project code included in the entry was written during the official 72-hour window; pre-event plans/schema sketches are allowed but pre-existing app code is not;
- clean git status;
- final tag/commit recorded.

## Exit gate

A judge on a clean laptop can run the portal and verify the claimed tier without asking a question.
