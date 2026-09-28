# Webhook implementation and coverage

The organizer can configure event-scoped HTTPS endpoints from the event dashboard. Endpoint secrets are generated once and signed using HMAC-SHA256 over `<unix timestamp>.<raw JSON body>`. Requests include `X-Dogfood-Event`, `X-Dogfood-Delivery`, and `X-Dogfood-Signature`; delivery IDs are stable for idempotency.

Every `appendAuditEvent` call inserts matching deliveries in the same database transaction as its audit row. The business mutation does no network I/O. Dispatch is separate: an organizer can run due deliveries from the Webhooks page or `POST /api/v1/events/{eventId}/webhooks/dispatch`. Failures are recorded with the response status or error, retried with increasing delay, and marked `DEAD` after eight attempts. A background scheduler is not installed; retries run only when the organizer or an external scheduler dispatches them.

Endpoint URLs must be HTTPS on port 443. Literal IPs and local/internal hostnames are rejected; DNS answers are checked against private, loopback, link-local, metadata, and non-global ranges before connection, and the vetted address is pinned for the HTTPS request. Redirects are not followed. Payload `data` mirrors audit metadata and may contain personal data (for example, an invitation email); organizers should send only to destinations they control.

## Audited actions currently enqueued

The outbox covers these action values when recorded through `appendAuditEvent`:

- Events and prizes: `event.details`, `event.join`, `event.member.grant`, `event.member.remove`, `event.registration_window`, `event.transition`, `prize.create`, `prize.update`, `prize.delete`.
- Judges and evaluation: `judge_application.apply`, `judge_application.approve`, `judge_application.reapply`, `judge_application.reject`, `judge_application.revoke`, `judge_application.withdraw`, `judge_invitation.accept`, `judge_invitation.create`, `judge_invitation.revoke`, `judge.assign`, `judge.recusal.create`, `judge.recusal.delete`, `judge.unassign`, `evaluation.start`, `evaluation.submit`, `evaluation.lock`.
- Projects and teams: `project.revise`, `project.submit`, `project.lock`, `project.lock_all`, `project.withdraw`, `team.create`, `team.join`.
- Results and records: `ranking.generate`, `ranking.publish`, `certificate.issue`, `certificate.revoke`.
- Voting and comments: `voting.config.update`, `voting_invitation.create`, `voting_invitation.revoke`, `vote.cast`, `vote.duplicate`, `vote.self_attempt`, `vote.rate_limited`, `vote.event_rate_limited`, `vote.network_rate_limited`, `comment.create`, `comment.delete`, `comment.moderate_delete`.

## Known UI mutation gaps

The implementation is not yet complete T4 coverage. These mutation flows do not currently pass through the centralized audit hook and therefore do not enqueue webhooks:

- Event creation.
- Track and custom-question create, edit, reorder, and delete.
- Rubric and criterion create/edit/activation.
- Saving an evaluation draft.
- Creating a team invite or leaving a team.
- Project asset upload.
- Pairwise comparison create/update.
- Webhook endpoint create/update/delete.
- Bulk import currently writes its audit row directly instead of calling `appendAuditEvent`; the audit row exists but does not enqueue a delivery.

Read-only gallery, search, download, and audit queries are not webhook events. Extend the service audit writes for the mutation gaps above before claiming “every UI action” coverage.
