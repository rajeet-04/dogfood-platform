# API inventory and UI/API parity

**Audited:** 2026-09-29 against the route handlers and Server Actions in this checkout.
**Contract:** [`../openapi.yaml`](../openapi.yaml) documents 117 HTTP operations across 88 paths: everything under `/api/v1`, `/api/health`, `/api/ready`, the HTML `/embed/gallery` widget, and the `/.well-known/dogfood-judge-records.json` issuer key document.

## Parity is enforced, not asserted

`tests/unit/web/api-parity.test.ts` runs in the normal Vitest suite and fails when any of these stop holding:

1. **Every UI Server Action has a REST twin.** The test holds a map from each of the 55 exported Server Actions in `apps/web/server/actions/` to the `METHOD /path` that performs the same domain call. A new Server Action without a mapping fails, and so does a mapping to a route that is not implemented.
2. **OpenAPI matches the routes exactly.** The test collects every exported `GET`/`POST`/`PUT`/`PATCH`/`DELETE` handler under `apps/web/app/**/route.ts` and every operation in `openapi.yaml`. An undocumented route or a documented operation with no handler fails.
3. **Every mutation reaches webhooks.** Every exported, actor-driven domain mutation must call `appendAuditEvent`, which records the audit row and queues webhook deliveries in one transaction (see [`WEBHOOKS.md`](WEBHOOKS.md)).

REST handlers and Server Actions call the same domain services, so permissions, validation, audit, and notifications are shared rather than duplicated.

## Gaps closed in this pass

- Judge administration: judge applications (apply, withdraw, decide), judge deactivation, rubric create, criterion add, rubric activation.
- Evaluation lifecycle: `POST …/evaluations/{assignmentId}/start`, `/reopen`, `/lock`, and `POST …/bulk/evaluations/lock` (locks every submitted evaluation).
- Setup: `DELETE` for tracks and custom questions.
- Results and records: ranking snapshot publication and certificate revocation.
- Accounts: `POST /api/v1/auth/sign-out` revokes one saved session (`{token}`) or all of them (`{all: true}`); a token not held by this browser is refused.
- Notifications: mark one or all read.
- Previously unaudited mutations (event creation, rubric changes, draft saves, reopen, project creation, asset upload, pairwise comparisons, webhook configuration, track/question deletion) now emit audit events and webhooks.

## Other T4 pieces

- **Signed, publicly verifiable judge records.** Records are Ed25519-signed. The issuer publishes its active key fingerprint and trust pins at `/.well-known/dogfood-judge-records.json` (CORS open, 5-minute cache). `bun scripts/verify-judge-record.ts <record-url> [--pin <fingerprint>]` fetches a record, recomputes the payload hash, verifies the signature, and checks the key against the published or supplied pin. It ignores the server's own `issuerTrusted` field.
- **Embeddable gallery:** `/embed/gallery` with the anonymous gallery filters.
- **Portability:** organizer project archives via `GET`/`POST /api/v1/events/{eventId}/bulk/projects` (JSON, or CSV with `?format=csv`), plus CSV exports.
- **Certificates:** issue, read, and revoke.

## Known limits

- Bulk import creates projects and revisions only. Teams, tracks, and image assets must already exist in the same event; it does not restore whole events or binary assets. Imports are rejected once judging starts.
- Many JSON response bodies use a permissive object schema. Request fields, auth, and status codes are documented per operation; strict response schemas are future work.
- The judge-record trust document is only as trustworthy as the origin's TLS. Pinning a fingerprint out of band (`--pin`) avoids relying on it.
- Some organizer, judge, and participant pages still assemble read models server-side. Their underlying data is available through documented read endpoints, but the page shapes themselves are not REST resources.
