# DOGFOOD Permissions & Transaction Matrix

## Actors

Visitor, Participant, Judge, Organizer, Platform Admin.

## Permission rules

| Action | Visitor | Participant | Judge | Organizer | Admin |
|---|---:|---:|---:|---:|---:|
| Read public event/gallery | yes | yes | yes | yes | yes |
| Create/join team | no | yes | no | no | yes |
| Manage own team project | no | yes | no | no | yes |
| Configure event | no | no | no | yes | yes |
| Configure tracks/prizes/questions | no | no | no | yes | yes |
| Invite judges | no | no | no | yes | yes |
| Configure rubric | no | no | no | yes | yes |
| Assign judges | no | no | no | yes | yes |
| Read assigned judging project | no | no | yes | yes* | yes |
| Write own evaluation | no | no | yes | no | yes |
| Read peer judge ballot | no | no | no | policy* | yes |
| Read other track as scoped judge | no | no | no | yes | yes |
| View aggregate progress | no | no | own | yes | yes |
| Generate/publish ranking | no | no | no | yes | yes |
| Export event data | no | no | no | yes | yes |
| Read audit | no | no | no | yes | yes |

`yes*` is constrained by active-judging confidentiality policy and final official spec.

## Context attributes

Authorization checks receive:
- actor user ID;
- actor event role(s);
- event ID;
- event state;
- resource event ID;
- ownership/team relation;
- assignment relation;
- track scope;
- evaluation state;
- deadline result.

## Mandatory transaction boundaries

### Accept event invitation
Read/lock invite → validate token/expiry/conflict → create membership → mark accepted → audit → commit.

### Join team
Read/lock invite → validate event/membership/use limit → insert member → increment use → audit → commit.

### Submit project
Validate actor/team/event/deadline/completeness → create revision if payload supplied → update project current revision/state/submitted_at → audit → commit.

### Assign batch
Validate all judge/project track relationships → insert all assignments → audit summary + per-assignment as chosen → commit all-or-none.

### Submit evaluation
Validate assignment/actor/event/rubric/scores/deadline → upsert current scores → create revision → state submitted → audit → commit.

### Generate ranking snapshot
Read a transactionally consistent set of submitted evaluations → compute outside DB only if input snapshot/version is captured consistently → persist immutable snapshot + audit → commit.

### Publish ranking
Lock event/snapshot → validate ownership/state → set published_at/event pointer/state → audit → commit.

## Sensitive read audit

Audit reads for:
- organizer/admin raw judge evaluation access after judging;
- sensitive CSV export;
- full portable export;
- judge record/certificate administrative generation.

## Denial behavior

For IDs that would reveal existence across events, prefer NOT_FOUND or a uniform forbidden response according to official acceptance expectations. Never return a foreign resource payload before permission evaluation.
