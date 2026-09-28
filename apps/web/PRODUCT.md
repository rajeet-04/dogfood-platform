# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- Visitors browse public events and submitted projects without an account.
- Participants form teams, revise a project while submissions are open, and submit it before the server deadline.
- Organizers configure event details and submission questions, then operate judging and exports.
- Judges review only the projects and scores their event role permits.

## Product Purpose

DOGFOOD is a self-hosted hackathon submission and judging platform. The event's published tier ladder and acceptance suite define the working product. A local instance must let an organizer run an event and let a visitor inspect real submitted project data.

## Operating Context

The portal runs from a repository checkout through Compose with PostgreSQL and local uploads. The published `fixtures.json` supplies synthetic event data for demonstrations and the official checker. Participants edit over multiple sessions; visitors arrive through a public link; organizers and judges need clear role boundaries.

## Capabilities and Constraints

- Event-scoped roles and server-enforced submission deadlines govern writes.
- Project edits are immutable revisions. Public reads exclude drafts and private events.
- Project images use local event-owned assets. Questions are organizer-defined free text, required or optional, with public or organizer-only visibility.
- The gallery page and anonymous API use the same search and filters.
- The current web stack is Next.js, React, TypeScript, Tailwind CSS, and the existing shared UI components.

## Evidence on Hand

- The DOGFOOD specification is published at `https://dogfoodhack.com/spec/`. The official `run.py` and `spec.md` are absent from this checkout, and local `.dogfood.toml` does not match the official `[portal]`, `[tiers]`, `[auth]`, `[routes]` shape; official acceptance has not been run.
- The repository root `fixtures.json` is synthetic demonstration data, including a deliberate duplicate project entry.
- The existing event, participant, organizer, and judge pages establish the product's current interaction and visual conventions.

## Current Local Verification — 2026-09-28

- Six focused integration files passed: 23 tests covering fixture seeding, submissions, submission settings, assets, and public gallery behavior.
- DB, events, submissions, and web package typechecks passed, as did the production web build.
- Local fixture seed/import smoke returned HTTP 200 from `/api/health`, `/projects`, and `/api/v1/gallery?q=Glass%20Signal`; the gallery response contained `Glass Signal`.
- The smoke verifies local development behavior only. It does not establish full T1 completion, eligibility under the event's code-window rule, Compose offline readiness, or official checker acceptance.

## Product Principles

1. Make public work easy to discover while keeping unpublished work private.
2. Let a participant understand what remains before submission.
3. Enforce roles, deadlines, and required answers on the server.
4. Keep local setup and the official acceptance report reproducible.
