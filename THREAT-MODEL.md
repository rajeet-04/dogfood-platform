# DOGFOOD Threat Model

**Scope:** Current checkout's event submissions, judge evaluation, and authenticated community-voting paths. This is a code-backed review of the implementation, not a penetration-test report or a claim that the competition entry is eligible. The official DOGFOOD threat-model bonus asks for voting/submission abuse, attacks stopped, and accepted risks; see [`plans-dogfood/00-official-requirements.md`](plans-dogfood/00-official-requirements.md).

## Assets and trust boundaries

- Submission records, revisions, event assets, custom answers, and the submission deadline.
- Judge assignments, track restrictions, evaluations, ballots, comments, and event results.
- User credentials, session tokens, event memberships, and audit records.
- Public gallery and API responses, which must not reveal drafts, private answers, peer evaluations, or active voting tallies.

The browser is untrusted. API handlers resolve an actor from a session cookie, and domain services enforce permissions and event/project relationships. Database uniqueness and foreign-key constraints backstop selected invariants. A signed-in account is an identity boundary, not proof of a unique real person.

## Controls present in this checkout

| Threat | Implemented control | Evidence / limitation |
|---|---|---|
| Late or premature submission | `assertSubmissionWindow` checks event state and server time on create, edit, and submit paths. A locked project cannot be changed. Required title, description, and custom answers are validated when submitted. | `packages/submissions/src/domain.ts`, `packages/submissions/src/service.ts`; `tests/integration/submissions.test.ts`, `tests/integration/submissions-lock.test.ts`. The checker’s submission probe can fail schema validation before it reaches deadline logic; see `PLAN.md`. |
| Duplicate project creation by one team | A database uniqueness conflict is mapped to a team-already-has-project error. | `packages/submissions/src/service.ts`; `tests/integration/submissions.test.ts`. This limits projects per team, not coordinated teams or accounts. |
| Draft/private project exposure | The voting ballot selects only submitted or locked projects in eligible event states. The anonymous gallery has separate published-state filtering and answer redaction. | `packages/voting/src/service.ts`, `packages/submissions/src/gallery.ts`; gallery integration coverage. This does not prevent users copying information already public in a submitted project. |
| Unauthenticated ballot access | Ballot, vote, and results API routes require a valid session actor. Voting configuration supports only `AUTHENTICATED`, enforced by the database constraint. | `apps/web/server/api/http.ts`, voting API routes, `packages/db/src/schema/voting.ts`. Registration validates email syntax, but there is no email-ownership verification. |
| Repeat voting from the same account | A unique `(event_id, voter_id)` index permits one ballot per account per event; a duplicate attempt is rejected and audited. | `packages/db/src/schema/voting.ts`, `packages/voting/src/service.ts`; `tests/integration/voting.test.ts`. This is not one vote per person. |
| Project-team self-voting | Team membership is checked against the selected project before vote insertion; blocked attempts are audited without consuming the vote rate bucket. | `packages/voting/src/service.ts`; `tests/integration/voting.test.ts`. This does not detect indirect coordination or a person using a separate account. |
| Vote/comment write flooding | Per-account, per-event, per-action fixed one-minute buckets cap writes at 10 and audit blocked attempts. | `packages/voting/src/service.ts`, `packages/db/src/schema/voting.ts`; `tests/integration/voting.test.ts`. The limit is account-based, not IP/device/global, and it is not a general login or read-rate limit. |
| Ballot-order influence | Project order is shuffled with Node's cryptographic `randomInt` on each ballot request. | `packages/voting/src/service.ts`. Randomized ordering does not establish that each person saw only one order or eliminate strategic voting. |
| Strategic tally influence during voting | While the event is in `JUDGING` or the configured close time has not passed, results require organizer permission. Results become readable to authenticated users after the configured close time. | `packages/voting/src/service.ts`; active-window and close-time tests in `tests/integration/voting.test.ts`. Organizers can see tallies while voting is active by design. |
| Unauthorized audit access | Voting audit reads require an authenticated actor and event-audit permission; inactive organizer membership is denied. Vote audit rows intentionally omit actor, resource, and metadata identifiers. | `apps/web/app/api/v1/events/[eventId]/voting/audit/route.ts`, `packages/audit`, `tests/integration/voting.test.ts`. Audit history is an application log, not tamper-evident external evidence. |
| Judge reads or scores outside assignment/track | Evaluation services require the assigned judge, enforce event and track scope, reject a judge evaluating their own team's project, and preserve judge-to-judge score isolation. | `packages/judging/src/service.ts`, assignment and evaluation routes; `tests/integration/judging/assignment-isolation.test.ts`, `assignment-guards.test.ts`, and `evaluation.test.ts`. The official checker verifies its own-score, peer-score, participant-denial, and export probes only. |
| Assignment manipulation after results | Assignment generation previews are checked against current project/track/capacity state before commit; assignment and recusal actions are audited. | `packages/judging/src/service.ts`; `tests/integration/judging/assignment-generation.test.ts`, `assignment-guards.test.ts`. Organizers remain trusted to choose assignments and judges. |

## Accepted risks and unsupported defenses

These risks are accepted by the current implementation; they are not represented as solved:

1. **Sybil voting and ballot stuffing across accounts.** Anyone able to register multiple accounts can cast multiple votes, subject to one ballot per account. Email ownership verification, invitation eligibility, CAPTCHA, identity proofing, IP/device abuse detection, and event-wide anomaly review are not implemented. Open-link and email-gated modes are also unsupported. The selected mode is authenticated-account voting, not verified-person voting.
2. **Account takeover and credential abuse.** Password authentication and opaque server-side sessions are used, with only a hash of the session token stored and a 30-day session expiry. The inspected flows show no email verification or multi-factor authentication. Protection against password spraying, credential stuffing, and compromised devices is not established by this threat model.
3. **Cutoff race at submission deadline.** Deadline checks use server time, but `submitProject` performs its check before the transaction that changes project state. A request that passes the check just before cutoff may commit just after it; strict serialization of submission against the event deadline is not established. The published checker’s 4xx probe is insufficient to prove this behavior.
4. **Judge collusion and conflicts outside the app.** Assignment isolation prevents ordinary cross-judge score reads, and same-team judges are blocked from evaluating their own team. The platform cannot prevent judges coordinating outside the service, recognizing authors, sharing screenshots, or using multiple identities. Organizer assignment decisions are trusted; the available recusal flow is an audit/review mechanism, not conflict-of-interest discovery.
5. **Scraping and public-content abuse.** Anonymous gallery content is intentionally public. No application-level public-read throttling, bot challenge, or scraping deterrent was found in the inspected gallery path. Published project material may be copied, indexed, or used for spam; public filtering protects drafts and private event states, not confidentiality of submitted work.
6. **Limited audit guarantees.** Voting actions and sensitive organizer changes have audit records, but the database-backed log has no cryptographic chaining, external append-only sink, or publicly verifiable integrity proof. Vote audit deliberately excludes voter identity, so investigators cannot attribute a ballot from that audit stream alone.
7. **Network/service availability.** Per-account write buckets do not stop distributed traffic or resource exhaustion. Reverse-proxy limits, monitoring, backup/restore, and production incident response are deployment responsibilities and were not validated here.

## Operating assumptions and follow-up

- Keep the current authenticated-account default explicit in organizer UI and event documentation. Do not describe it as email-verified or sybil-resistant.
- For higher-stakes events, add verified email or invite eligibility plus abuse monitoring, and decide retention/privacy rules before recording network/device signals.
- If cutoff semantics must be strict, serialize deadline changes and submissions in the same database transaction and test requests racing the close time.
- If public tallies must be hidden from organizers too, change the current policy explicitly; the published site role matrix and the existing application policy have a documented discrepancy in `PLAN.md`.
- Treat this document as a snapshot. Re-check it after auth, submission-window, voting, assignment, or audit changes; the focused tests named above are evidence for code paths, not a substitute for a security test.
