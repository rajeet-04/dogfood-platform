# Phase 2: Event Configuration & Authorization

## Goal

Organizers can configure an event and its competition structure while the backend enforces event-scoped role isolation.

## Database

### events
Core identity, slug, description, timezone, state, registration/submission/judging dates, published snapshot pointer.

### event_memberships
- event_id
- user_id
- role: PARTICIPANT | JUDGE | ORGANIZER
- is_active
Unique: `(event_id,user_id,role)`.

### tracks
Event-scoped slug/name/description/capacity/sort order.

### prizes
Event-scoped prize definition, optional track association, amount/currency.

### submission_questions
Organizer-defined custom questions:
SHORT_TEXT, LONG_TEXT, URL, SELECT, MULTISELECT, BOOLEAN.

### event_invitations
Email/role/token hash/expiry/track scope for judge or organizer invitations.

## Endpoints

Event:
- `GET /api/v1/events`
- `POST /api/v1/events`
- `GET /api/v1/events/:eventId`
- `PATCH /api/v1/events/:eventId`
- `POST /api/v1/events/:eventId/transitions`

Tracks:
- `GET /api/v1/events/:eventId/tracks`
- `POST /api/v1/events/:eventId/tracks`
- `PATCH /api/v1/events/:eventId/tracks/:trackId`
- `DELETE /api/v1/events/:eventId/tracks/:trackId`

Prizes:
- `GET /api/v1/events/:eventId/prizes`
- `POST /api/v1/events/:eventId/prizes`
- `PATCH /api/v1/events/:eventId/prizes/:prizeId`
- `DELETE /api/v1/events/:eventId/prizes/:prizeId`

Questions:
- `GET /api/v1/events/:eventId/submission-questions`
- `POST /api/v1/events/:eventId/submission-questions`
- `PATCH /api/v1/events/:eventId/submission-questions/:questionId`
- `DELETE /api/v1/events/:eventId/submission-questions/:questionId`

Membership/invite:
- `GET /api/v1/events/:eventId/members`
- `POST /api/v1/events/:eventId/invitations`
- `POST /api/v1/events/:eventId/invitations/:token/accept`
- `DELETE /api/v1/events/:eventId/members/:userId`

## Services

- `createEvent`
- `updateEventConfiguration`
- `transitionEvent`
- `createTrack/updateTrack/deactivateTrack`
- `createPrize/updatePrize/deletePrize`
- `createSubmissionQuestion/updateSubmissionQuestion/deactivateSubmissionQuestion`
- `inviteEventMember/acceptEventInvitation`
- `can(actor,action,context)`
- `requirePermission(...)`

## State machine

`DRAFT → REGISTRATION → SUBMISSIONS_OPEN → SUBMISSIONS_CLOSED → JUDGING → RESULTS_READY → PUBLISHED → ARCHIVED`

## Security tests

- participant cannot configure event;
- judge cannot configure event;
- organizer cannot simultaneously hold judge role in same event;
- Event A organizer cannot mutate Event B;
- track-scoped judge context cannot resolve another track;
- invalid state transition rejected server-side.

## UI

Organizer setup:
- event basics;
- dates;
- tracks;
- prizes;
- custom submission questions;
- membership/invitation management.

## Exit gate

Organizer can fully configure an event, state transitions are deterministic, and cross-event/role abuse tests are green.
