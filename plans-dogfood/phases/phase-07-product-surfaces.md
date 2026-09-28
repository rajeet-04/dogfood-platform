# Phase 7: Product Surfaces & UX Integration

## Goal

Make the complete T1/T2 system usable under hackathon conditions without changing domain rules.

## Product Design note

Detailed visual ideation is performed in Product Design Work mode. This phase defines the engineering contract for screens, states, and flows.

## Route inventory

Public:
- `/`
- `/events`
- `/events/[eventId]`
- `/events/[eventId]/gallery`
- `/events/[eventId]/gallery/[projectId]`
- `/events/[eventId]/results`

Auth:
- `/register`
- `/login`

Participant:
- `/events/[eventId]/participant`
- `/events/[eventId]/team`
- `/events/[eventId]/submission`
- `/events/[eventId]/submission/history`

Judge:
- `/events/[eventId]/judge`
- `/events/[eventId]/judge/[assignmentId]`

Organizer:
- `/events/[eventId]/organizer`
- `/events/[eventId]/organizer/settings`
- `/events/[eventId]/organizer/tracks`
- `/events/[eventId]/organizer/prizes`
- `/events/[eventId]/organizer/questions`
- `/events/[eventId]/organizer/people`
- `/events/[eventId]/organizer/rubric`
- `/events/[eventId]/organizer/assignments`
- `/events/[eventId]/organizer/judging`
- `/events/[eventId]/organizer/results`
- `/events/[eventId]/organizer/exports`
- `/events/[eventId]/organizer/audit`

## Required states for every screen

- loading;
- empty;
- success;
- validation failure;
- permission denied;
- resource not found;
- event state prevents action;
- deadline passed;
- network/server failure;
- read-only/locked.

## Judge UX requirements

Optimized for many projects:
- persistent progress count;
- project context + rubric visible without navigation confusion;
- keyboard-friendly scoring where practical;
- clear save status;
- explicit submit/lock semantics;
- never expose peer score/aggregate during active evaluation.

## Organizer UX requirements

- at-a-glance lifecycle state;
- outstanding judge work;
- coverage gaps;
- diagnostics without score leakage;
- no destructive action without clear consequence;
- CSV exports discoverable.

## Participant UX requirements

- deadline always visible;
- draft vs submitted state unmistakable;
- required question errors map to exact input;
- revision history visible;
- team invite/join easy to understand.

## Tests

Playwright:
- visitor → register → participant;
- participant → team → project → submit;
- organizer setup → rubric → assign;
- judge queue → evaluate → submit;
- organizer progress → ranking → publish;
- public gallery/result;
- permission/locked/deadline states.

Accessibility:
- keyboard navigation;
- form labels;
- focus management;
- error announcements;
- table semantics.

## Exit gate

A new user can complete each primary role journey without developer intervention.
