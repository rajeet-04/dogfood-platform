# DOGFOOD Planning Self-Review

## Coverage result

The planning set now covers:
- every currently advertised T1 endpoint family;
- every currently advertised T2 endpoint family;
- T3/T4 as gated phases;
- T1/T2 table inventory and field-level data dictionary;
- permission/context rules;
- transaction boundaries;
- service interfaces;
- screen/route inventory;
- test and exit gates;
- runtime/operability/submission artifacts.

## Resolved inconsistencies

1. Team membership now carries `event_id` so the database can enforce one team per user per event.
2. Phase numbering in the 72-hour runbook now matches the authoritative phase documents.
3. The original task plan now points to the phase/spec documents as authoritative contracts.
4. REST route/business-logic ownership is explicitly separated: routes are adapters, services own behavior.
5. T3/T4 are explicitly gated and cannot consume core schedule while T1/T2 is red.

## Known pre-spec uncertainties

These are not placeholders; they are explicit reconciliation items for Phase 0.

### Organizer access to raw judge scores

Approved Architecture v1 delays organizer raw-score access until judging lock. The current public DOGFOOD role matrix shows organizers as permitted to see scores generally. The official `spec.md` and acceptance suite will decide the exact timing. Until then, the stricter confidentiality policy remains planned.

### Event lifecycle exact states

The planned state machine may need adjustment if `spec.md` defines a different lifecycle or derives stages from timestamps rather than explicit states.

### Custom question storage

The plan uses normalized `project_answer_values`. If fixtures use a fixed JSON shape and no answer queries are required, JSONB may be simpler. Phase 0 chooses based on fixture/acceptance needs.

### Email-gated T3 voting

The product must remain self-hosted/offline. If email-gated voting requires a real outbound mail dependency, implement a self-hostable SMTP path only if the official spec requires it and time permits. Never add a mandatory hosted email provider.

### Asset requirements

Exact MIME types, file limits, thumbnail dimensions, and image count are frozen from `spec.md`.

### CSV schemas

Export endpoints are planned; exact headers/order are frozen from official acceptance fixtures.

### API First scope

T4 API parity may require additional endpoints beyond the current catalog. If the public acceptance suite defines them, add them in Phase 0 before implementation.

## Superpowers plan-quality checks

- Placeholder scan: no intentional TODO/TBD items are used as implementation instructions.
- Dependency check: T1/T2 phases are sequential with explicit exit gates; pure judging algorithms may be parallelized only after input contracts freeze.
- Type/ownership check: routes call application services; pure engines do not import DB or HTTP modules.
- Security check: cross-event IDOR, peer-score leakage, deadline bypass, transaction rollback, and ranking determinism each have explicit tests.
- Scope check: T3, T4, and bonus work are isolated from the T1/T2 critical path.

## Required Phase 0 output after spec release

Create `specs/100-official-spec-delta.md` and record every changed assumption with:
- official requirement;
- planning assumption;
- final decision;
- affected phase;
- endpoint changes;
- schema changes;
- test changes;
- schedule impact.

No project code starts before this reconciliation is complete.
