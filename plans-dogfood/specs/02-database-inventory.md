# DOGFOOD Database Inventory

## T1/T2 required tables

1. users
2. sessions
3. events
4. event_memberships
5. event_invitations
6. tracks
7. prizes
8. submission_questions
9. teams
10. team_members
11. team_invites
12. assets
13. projects
14. project_revisions
15. project_answer_values
16. rubrics
17. rubric_criteria
18. judge_track_scopes
19. judge_assignments
20. evaluations
21. evaluation_scores
22. evaluation_revisions
23. ranking_snapshots
24. audit_events

## T3 gated tables

25. voting_configs
26. voter_identities
27. email_challenges
28. votes
29. comments

## T4 gated tables

30. api_tokens if external token auth is needed
31. webhook_endpoints
32. webhook_deliveries
33. import_jobs
34. certificates
35. judge_participation_records

## Cross-table rules

- UUID primary keys.
- TIMESTAMPTZ stored in UTC.
- Event-owned tables carry `event_id` directly when it materially improves authorization/query safety.
- Competition history uses RESTRICT/deactivation rather than destructive cascade.
- Sessions and purely ephemeral challenge data may cascade/expire.
- Email uses CITEXT or normalized lowercase uniqueness.
- Tokens are stored hashed.
- Assets use content hash and randomized storage key.
- Revisions are immutable.
- Audit events are append-only from application layer.
- Ranking snapshots are immutable after creation; publish adds publication metadata, not recalculation.
- Foreign-key ownership is validated at service boundaries even when DB FKs exist.

## Required uniqueness

- users(email)
- sessions(token_hash)
- events(slug)
- event_memberships(event_id,user_id,role)
- tracks(event_id,slug)
- teams(event_id,name)
- team_members(team_id,user_id)
- team_invites(token_hash)
- assets(storage_key)
- projects(event_id,slug)
- projects(event_id,team_id) unless official spec permits multiple
- project_revisions(project_id,revision_number)
- project_answer_values(revision_id,question_id)
- judge_track_scopes(event_id,judge_id,track_id)
- judge_assignments(event_id,judge_id,project_id)
- evaluations(assignment_id)
- evaluation_scores(evaluation_id,criterion_id)
- evaluation_revisions(evaluation_id,revision_number)

## Required indexes

- event_memberships(user_id,event_id)
- event_memberships(event_id,role,is_active)
- projects(event_id,state)
- projects(event_id,submitted_at)
- project_revisions(project_id,revision_number DESC)
- judge_assignments(event_id,judge_id,status)
- judge_assignments(event_id,project_id,status)
- evaluations(status)
- audit_events(event_id,created_at DESC)
- audit_events(event_id,actor_id,created_at DESC)
- gallery search indexes chosen after final search strategy is frozen.

## Migration discipline

- migrations are append-only during event;
- never edit an applied migration;
- seed is idempotent;
- official fixtures have deterministic import mapping;
- schema changes after Hour 48 require explicit review because they risk acceptance regressions.
