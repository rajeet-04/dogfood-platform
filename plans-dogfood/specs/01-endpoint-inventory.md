# DOGFOOD Endpoint Inventory

This file is the cross-phase endpoint registry. Phase documents own implementation details.

## T1

Auth:
- POST /api/v1/auth/register
- POST /api/v1/auth/login
- POST /api/v1/auth/logout
- GET /api/v1/auth/session

Events:
- GET /api/v1/events
- POST /api/v1/events
- GET /api/v1/events/:eventId
- PATCH /api/v1/events/:eventId
- POST /api/v1/events/:eventId/transitions

Tracks:
- GET /api/v1/events/:eventId/tracks
- POST /api/v1/events/:eventId/tracks
- PATCH /api/v1/events/:eventId/tracks/:trackId
- DELETE /api/v1/events/:eventId/tracks/:trackId

Prizes:
- GET /api/v1/events/:eventId/prizes
- POST /api/v1/events/:eventId/prizes
- PATCH /api/v1/events/:eventId/prizes/:prizeId
- DELETE /api/v1/events/:eventId/prizes/:prizeId

Questions:
- GET /api/v1/events/:eventId/submission-questions
- POST /api/v1/events/:eventId/submission-questions
- PATCH /api/v1/events/:eventId/submission-questions/:questionId
- DELETE /api/v1/events/:eventId/submission-questions/:questionId

People:
- GET /api/v1/events/:eventId/members
- POST /api/v1/events/:eventId/invitations
- POST /api/v1/events/:eventId/invitations/:token/accept
- DELETE /api/v1/events/:eventId/members/:userId

Teams:
- POST /api/v1/events/:eventId/teams
- GET /api/v1/events/:eventId/teams/:teamId
- PATCH /api/v1/events/:eventId/teams/:teamId
- POST /api/v1/events/:eventId/teams/:teamId/invites
- POST /api/v1/events/:eventId/team-invites/:token/join
- POST /api/v1/events/:eventId/teams/:teamId/leave
- DELETE /api/v1/events/:eventId/teams/:teamId/members/:userId

Assets:
- POST /api/v1/events/:eventId/assets
- GET /api/v1/assets/:assetId
- DELETE /api/v1/events/:eventId/assets/:assetId

Projects:
- POST /api/v1/events/:eventId/projects
- GET /api/v1/events/:eventId/projects/:projectId
- POST /api/v1/events/:eventId/projects/:projectId/revisions
- GET /api/v1/events/:eventId/projects/:projectId/revisions
- POST /api/v1/events/:eventId/projects/:projectId/submit
- POST /api/v1/events/:eventId/projects/:projectId/withdraw

Gallery:
- GET /api/v1/events/:eventId/gallery
- GET /api/v1/events/:eventId/gallery/:projectId

## T2

Rubrics:
- GET /api/v1/events/:eventId/rubrics
- POST /api/v1/events/:eventId/rubrics
- POST /api/v1/events/:eventId/rubrics/:rubricId/criteria
- PATCH /api/v1/events/:eventId/rubrics/:rubricId/criteria/:criterionId
- DELETE /api/v1/events/:eventId/rubrics/:rubricId/criteria/:criterionId
- POST /api/v1/events/:eventId/rubrics/:rubricId/activate

Assignments:
- POST /api/v1/events/:eventId/judge-assignments
- POST /api/v1/events/:eventId/judge-assignments/generate
- GET /api/v1/events/:eventId/judge-assignments
- DELETE /api/v1/events/:eventId/judge-assignments/:assignmentId
- GET /api/v1/events/:eventId/judge-queue
- GET /api/v1/events/:eventId/judge-queue/:assignmentId

Evaluations:
- GET /api/v1/events/:eventId/evaluations/:assignmentId
- PUT /api/v1/events/:eventId/evaluations/:assignmentId
- POST /api/v1/events/:eventId/evaluations/:assignmentId/submit
- POST /api/v1/events/:eventId/evaluations/:assignmentId/lock

Judging:
- GET /api/v1/events/:eventId/judging/progress
- GET /api/v1/events/:eventId/judging/diagnostics

Rankings:
- POST /api/v1/events/:eventId/rankings
- GET /api/v1/events/:eventId/rankings
- GET /api/v1/events/:eventId/rankings/:snapshotId
- POST /api/v1/events/:eventId/rankings/:snapshotId/publish
- GET /api/v1/events/:eventId/results

Exports:
- GET /api/v1/events/:eventId/exports/participants.csv
- GET /api/v1/events/:eventId/exports/teams.csv
- GET /api/v1/events/:eventId/exports/projects.csv
- GET /api/v1/events/:eventId/exports/judge-assignments.csv
- GET /api/v1/events/:eventId/exports/evaluations.csv
- GET /api/v1/events/:eventId/exports/results.csv

Audit:
- GET /api/v1/events/:eventId/audit
- GET /api/v1/events/:eventId/audit/:auditEventId

Operations:
- GET /api/health
- GET /api/ready

## T3

- GET/PUT /api/v1/events/:eventId/voting/config
- GET /api/v1/events/:eventId/voting/ballot
- POST /api/v1/events/:eventId/votes
- POST /api/v1/events/:eventId/voting/email-challenges
- POST /api/v1/events/:eventId/voting/email-challenges/:token/verify
- GET /api/v1/events/:eventId/projects/:projectId/comments
- POST /api/v1/events/:eventId/projects/:projectId/comments
- DELETE /api/v1/events/:eventId/projects/:projectId/comments/:commentId

## T4

- GET /openapi.yaml
- GET/POST /api/v1/events/:eventId/webhooks
- PATCH/DELETE /api/v1/events/:eventId/webhooks/:webhookId
- GET /api/v1/events/:eventId/webhook-deliveries
- POST /api/v1/events/:eventId/imports
- GET /api/v1/events/:eventId/imports/:importId
- GET /api/v1/events/:eventId/exports/full
- POST /api/v1/events/:eventId/certificates/generate
- GET /api/v1/certificates/:certificateId
- GET /api/v1/judge-records/:recordId
- GET /api/v1/widgets/events/:eventId/gallery

## Contract rule

Every endpoint must have:
- Zod input schema;
- actor/permission requirement;
- event/resource ownership validation;
- typed service call;
- stable typed errors;
- request ID;
- integration test for happy path and highest-risk denial path.
