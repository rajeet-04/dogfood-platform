# Webhook implementation and coverage

The organizer can configure event-scoped HTTPS endpoints from the event dashboard. Endpoint secrets are generated once and signed using HMAC-SHA256 over `<unix timestamp>.<raw JSON body>`. Requests include `X-Dogfood-Event`, `X-Dogfood-Delivery`, and `X-Dogfood-Signature`; delivery IDs are stable for idempotency.

Every `appendAuditEvent` call inserts matching deliveries in the same database transaction as its audit row. The business mutation does no network I/O. Dispatch is separate: an organizer can run due deliveries from the Webhooks page or `POST /api/v1/events/{eventId}/webhooks/dispatch`. Failures are recorded with the response status or error, retried with increasing delay, and marked `DEAD` after eight attempts. A background scheduler is not installed; retries run only when the organizer or an external scheduler dispatches them.

Endpoint URLs must be HTTPS on port 443. Literal IPs and local/internal hostnames are rejected; DNS answers are checked against private, loopback, link-local, metadata, and non-global ranges before connection, and the vetted address is pinned for the HTTPS request. Redirects are not followed. Payload `data` mirrors audit metadata and may contain personal data (for example, an invitation email); organizers should send only to destinations they control.

## Audited actions currently enqueued

The outbox covers these action values when recorded through `appendAuditEvent`:

- Events, setup, and prizes: `event.create`, `event.details`, `event.join`, `event.member.grant`, `event.member.remove`, `event.registration_window`, `event.transition`, `event.track.create`, `event.track.update`, `event.track.reorder`, `event.track.delete`, `event.custom_question.create`, `event.custom_question.update`, `event.custom_question.reorder`, `event.custom_question.delete`, `prize.create`, `prize.update`, `prize.delete`.
- Judges, rubrics, and evaluation: `judge_application.apply`, `judge_application.approve`, `judge_application.reapply`, `judge_application.reject`, `judge_application.revoke`, `judge_application.withdraw`, `judge_invitation.accept`, `judge_invitation.create`, `judge_invitation.revoke`, `judge.assign`, `judge.recusal.create`, `judge.recusal.delete`, `judge.unassign`, `rubric.create`, `rubric.criterion.create`, `rubric.activate`, `evaluation.start`, `evaluation.draft_save`, `evaluation.submit`, `evaluation.reopen`, `evaluation.lock`, `pairwise.compare`.
- Projects, assets, and teams: `project.create`, `project.revise`, `project.submit`, `project.lock`, `project.lock_all`, `project.withdraw`, `projects.bulk_import`, `asset.upload`, `team.create`, `team.invite.create`, `team.join`, `team.leave`.
- Results and records: `ranking.generate`, `ranking.publish`, `pairwise_ranking.generate`, `pairwise_ranking.publish`, `certificate.issue`, `certificate.revoke`, `judge_record.issue`, `judge_record.reissue`, `judge_record.revoke`.
- Voting and comments: `voting.config.update`, `voting_invitation.create`, `voting_invitation.revoke`, `vote.cast`, `vote.duplicate`, `vote.self_attempt`, `vote.rate_limited`, `vote.event_rate_limited`, `vote.network_rate_limited`, `vote.link.event_rate_limited`, `vote.link.network_rate_limited`, `comment.create`, `comment.delete`, `comment.moderate_delete`, `comment.rate_limited`.
- Webhook configuration: `webhook.create`, `webhook.update`, `webhook.delete`. Metadata never includes the endpoint secret.

`evaluation.draft_save` carries the assignment ID only, never scores. `event.create` is audited, but no endpoint can subscribe to an event before it exists, so it only reaches the audit log.

## Coverage is enforced by a test

`tests/unit/web/api-parity.test.ts` scans every exported domain function in `packages/*/src` (and the asset upload service) that takes an `actor` and is not a read. Each must call `appendAuditEvent`, so it both lands in the audit log and queues webhook deliveries. Exemptions are listed in the test with reasons: helpers that delegate to an audited function, a read-only preview, and per-user notification read state, which is not an event action. Adding an unaudited mutation fails the suite.

Read-only gallery, search, download, and audit queries are not webhook events. Account sign-in, sign-out, and session switching are user-scoped, not event actions, and are not webhook events.
