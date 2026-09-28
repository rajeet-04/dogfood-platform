# Phase 9: T3 Public Voting & Comments

**Gate:** begin only after all required T1/T2 acceptance checks pass.

## Database

- voting_configs
- voter_identities
- email_challenges if self-hosted email verification is feasible/required
- votes
- comments
- voting_audit_events or shared audit actions
- rate_limit_buckets if persisted implementation is chosen

## Endpoints

- `GET /api/v1/events/:eventId/voting/config`
- `PUT /api/v1/events/:eventId/voting/config`
- `GET /api/v1/events/:eventId/voting/ballot`
- `POST /api/v1/events/:eventId/votes`
- `POST /api/v1/events/:eventId/voting/email-challenges`
- `POST /api/v1/events/:eventId/voting/email-challenges/:token/verify`
- `GET /api/v1/events/:eventId/projects/:projectId/comments`
- `POST /api/v1/events/:eventId/projects/:projectId/comments`
- `DELETE /api/v1/events/:eventId/projects/:projectId/comments/:commentId`

## Required behavior

- OPEN, EMAIL_GATED, AUTHENTICATED modes according to the official site;
- support one-person-one-vote, or provide a defensible alternative such as quadratic voting;
- randomized ballot ordering;
- results hidden from everyone except organizers during active voting;
- duplicate detection;
- rate limits;
- readable abuse audit;
- comments with authorization/moderation rules.

T3 is not covered by the seven-check acceptance suite. Maintain separate behavior tests and demo evidence for voter eligibility, ballot ordering, result secrecy, comments, and abuse controls.

## Security tests

- repeated vote abuse;
- IP/account/email duplication strategy;
- ballot ordering randomness without changing project eligibility;
- results leak test;
- race condition on vote limit;
- comment cross-event access.

## Exit gate

T3 official acceptance is green without weakening T1/T2.
