# API inventory and UI/API parity audit

**Audited:** 2026-09-28 against the route handlers and Server Actions in this checkout.  
**Contract:** [`../openapi.yaml`](../openapi.yaml) documents all 45 application route modules (42 under `/api/v1`, plus `/api/health`, `/api/ready`, and the HTML `/embed/gallery` widget) and all 61 implemented HTTP operations.

## What has an HTTP API

The contract includes event listing/creation/detail/settings; public global, event, and embeddable galleries; image upload/read; team and project draft creation; judge assignment, generation, queue, evaluation draft/submission, invitation and recusal operations; signed public judge participation records; ranking generation/listing, persisted judge pairwise choices and pairwise calculation; published results; authenticated community voting, voting invitations, comments, configuration and audit; prizes; certificate issue/read; CSV/application-attachment downloads; and organizer project archive import/export in JSON or CSV. Session-protected routes use the `dogfood_session` cookie. Public and optionally authenticated reads are marked per operation.

The contract was assembled from `apps/web/app/api/**/route.ts`. It records methods, paths, parameters, implemented request fields, auth mode, and response status/content types. Many JSON response envelopes intentionally use a permissive object schema; this is a route inventory, not yet a strict generated contract for every domain response.

## UI/API gaps

The official API First criterion requires every UI action to be available as REST and documented, contract tests, and no business behavior available only through private Server Actions ([phase 11 bonus definition](phases/phase-11-bonuses.md#api-first-3)). This checkout does **not** meet that criterion yet. Several UI commands still call private Next.js Server Actions or server-side domain services:

- **Accounts and membership:** register/login/logout/account switching; join an event; add/change/remove event members.
- **Teams and submissions:** invite/join/leave a team; revise, submit, or withdraw a project; lock one/all projects. The REST project route only creates a draft.
- **Event setup:** manage tracks; manage custom questions and ordering; edit submission and judging dates. Event lifecycle transitions and registration-window updates are covered by the routes noted below. Updating organizer-managed event details is also covered.
- **Judge administration:** apply/withdraw/decide judge applications and deactivate judges; create/modify/activate rubrics and criteria; begin/reopen/lock evaluations and lock all submissions. Assignment CRUD itself has API routes.
- **Results and account utilities:** publish ranking snapshots; revoke certificates; mark notifications read.
- **Read-side parity:** organizer, judge, and participant pages still assemble substantial event, rubric, membership, application, and submission data directly from server-side services rather than documented read APIs.

Some page navigation and form flows are therefore server-rendered or Server Action backed even when a related operation exists in REST (for example, create event, create project draft, evaluation save/submit, ranking generation, and certificate issue). A related endpoint does not make the whole workflow API-parity complete.

### Implemented in this audit

`PUT /api/v1/events/{eventId}` now replaces the organizer-managed detail fields (description, website, prize information, timeline, schedule, rules, and maximum team size). The request requires every field so omission cannot silently clear a saved value; nullable fields accept `null` to clear. It requires a session and the existing event configure permission, runs the same service normalization and audit path as the UI action, and returns the updated detail fields. `POST /api/v1/events/{eventId}/transition` and `PUT /api/v1/events/{eventId}/registration-window` now reuse the lifecycle and settings services; detail reads include registration windows. Both mutations require organizer permissions and retain the service's transition validation, audit, and notification behavior. Track and custom-question management and other gaps above remain open.

Pairwise judging now has authenticated judge `GET`/`POST /api/v1/events/{eventId}/pairwise-comparisons` for assigned, track-scoped projects and persisted latest pair choices. Organizer ranking calculation can use these stored choices when explicit comparisons are omitted. The signed public judge-record route is also in the inventory; it requires a configured Ed25519 key and derives records per request rather than maintaining an issuance/revocation ledger. These additions do not close the other API First gaps.

Organizer project archives now have `GET` and `POST /api/v1/events/{eventId}/bulk/projects`. Export returns the version 1 project/revision archive as JSON by default or CSV with `?format=csv`; import accepts JSON or CSV and creates projects only. Teams, tracks, and image assets must already exist in the same event; the route does not import teams, events, or binary assets. Imports are limited to 10 MiB, 1,000 projects, and 5,000 revisions, and reject existing project IDs. This adds archive transfer but does not close the remaining API First gaps.

## Remaining contract work

- Add REST operations for the gaps above, or route those UI commands through the existing REST contract.
- Replace permissive JSON response schemas with stable response schemas and document response fields/statuses for each operation.
- Add handler-to-OpenAPI contract checks and UI-to-API parity coverage; no such contract check currently runs in the repository.
- Keep role/access behavior in route descriptions and tests, including the outstanding organizer raw-score policy decision recorded in `PLAN.md`.

Until those items are implemented and verified, count API First as **partial / not earned**. Publishing this inventory and OpenAPI file does not establish the bonus.
