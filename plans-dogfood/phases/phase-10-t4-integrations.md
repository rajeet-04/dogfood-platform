# Phase 10: T4 API, Webhooks, Portability & Records

**Gate:** begin only after T1/T2 is fully green and T3 status is consciously chosen.

## API-first

Every action available in the UI maps to shared application services and a documented REST operation. Publish the OpenAPI contract and prove UI/API parity; the API-first bonus also requires a published OpenAPI spec.

Artifacts:
- `openapi.yaml`
- API authentication scheme
- API examples
- stable error schema

## Webhooks

Database:
- webhook_endpoints
- webhook_deliveries

Endpoints:
- `GET/POST /api/v1/events/:eventId/webhooks`
- `PATCH/DELETE /api/v1/events/:eventId/webhooks/:webhookId`
- `GET /api/v1/events/:eventId/webhook-deliveries`

Engineering:
- HMAC signature;
- retry schedule;
- idempotency event ID;
- delivery log;
- disabled endpoint after configured failure threshold.

## Bulk portability

Database:
- import_jobs

Endpoints:
- `POST /api/v1/events/:eventId/imports`
- `GET /api/v1/events/:eventId/imports/:importId`
- `GET /api/v1/events/:eventId/exports/full`

Rules:
- dry-run import;
- row-level error report;
- transactional or chunk-safe import semantics;
- portable full export.

## Certificates and judge records

Database:
- certificates
- judge_participation_records
- signing_keys metadata if public-key verification is used

Endpoints:
- `POST /api/v1/events/:eventId/certificates/generate`
- `GET /api/v1/certificates/:certificateId`
- `GET /api/v1/judge-records/:recordId`

Signed records must be publicly verifiable without privileged DB access.

## Embeddable gallery

- `GET /api/v1/widgets/events/:eventId/gallery`
- CSP/CORS policy documented;
- safe public fields only.

## Exit gate

T4 feature checks and API parity tests are green, migration/import paths are reversible/documented, every UI action has an API, and webhook/record security is tested. The official seven-check acceptance program does not verify T4.
