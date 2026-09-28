# Phase 3: Teams, Projects, Assets & Public Gallery

## Goal

Participants can form teams, create/edit/submit projects until the server deadline, and the public can browse submitted projects.

## Database

### teams
`id,event_id,name,created_by,created_at`

### team_members
`event_id,team_id,user_id,is_owner,joined_at`
Unique: `(event_id,user_id)` so a participant cannot belong to two teams in one event; PK may remain `(team_id,user_id)`.

### team_invites
Token hash, expiry, max uses, use count, revocation.

### assets
Event owner, storage key, original name, MIME, bytes, SHA-256.

### projects
Event/team/slug/state/current revision/submitted/locked timestamps.
Unique one project per team per event unless official spec says otherwise.

### project_revisions
- revision_number
- title
- tagline
- description
- thumbnail_asset_id
- repository_url
- live_url
- demo_video_url
- tech_tags JSONB
- track_id
- created_by/created_at

The published T1 submission contract also includes a thumbnail and ordered image gallery, hosted demo video URL, repository URL, live link, tech tags, track, and organizer-defined custom answers. Keep every mutable submission edit in an immutable revision.

### project_answer_values
Prefer normalized table if official fixtures require searchable custom answers:
- revision_id
- question_id
- value_json
Unique: `(revision_id,question_id)`.

## Endpoints

Teams:
- `POST /api/v1/events/:eventId/teams`
- `GET /api/v1/events/:eventId/teams/:teamId`
- `PATCH /api/v1/events/:eventId/teams/:teamId`
- `POST /api/v1/events/:eventId/teams/:teamId/invites`
- `POST /api/v1/events/:eventId/team-invites/:token/join`
- `POST /api/v1/events/:eventId/teams/:teamId/leave`
- `DELETE /api/v1/events/:eventId/teams/:teamId/members/:userId`

Assets:
- `POST /api/v1/events/:eventId/assets`
- `GET /api/v1/assets/:assetId`
- `DELETE /api/v1/events/:eventId/assets/:assetId`

Projects:
- `POST /api/v1/events/:eventId/projects`
- `GET /api/v1/events/:eventId/projects/:projectId`
- `POST /api/v1/events/:eventId/projects/:projectId/revisions`
- `GET /api/v1/events/:eventId/projects/:projectId/revisions`
- `POST /api/v1/events/:eventId/projects/:projectId/submit`
- `POST /api/v1/events/:eventId/projects/:projectId/withdraw`

Gallery:
- `GET /api/v1/events/:eventId/gallery?q=&track=&tag=&sort=&cursor=`
- `GET /api/v1/events/:eventId/gallery/:projectId`

## Services

- team creation/join/leave;
- invite issue/revoke/use;
- local asset validation/storage;
- project create/revise/submit/withdraw;
- `validateSubmissionCompleteness`;
- `assertSubmissionWindow(serverNow,event)`;
- gallery query/read model.

## Server rules

- client clock ignored;
- `serverNow >= submission_closes_at` rejects write;
- revisions immutable;
- submitted project exposes only approved public fields;
- draft never appears in public gallery;
- asset MIME/size allowlist enforced server-side;
- resource event ownership validated at every command.

## Tests

- invite reuse/expiry limits;
- cross-event invite rejected;
- immutable revision test;
- exact deadline boundary;
- missing required custom answer;
- invalid track;
- draft absent from gallery;
- gallery search/filter correctness;
- unsafe file MIME rejected.

## UI

Participant:
- team screen;
- project editor;
- custom questions;
- assets;
- submission status/deadline.

Public:
- gallery list;
- search/filter;
- project detail.

The anonymous gallery must expose submitted fixture projects using public-safe fields; drafts and private submission data must never leak. The official suite checks a known fixture title in the public response.

## Exit gate

T1 participant flow is complete and direct-request deadline/authorization bypass attempts fail.
