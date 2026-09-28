# DOGFOOD T1/T2 Data Dictionary

All IDs UUID. All timestamps TIMESTAMPTZ UTC. Exact optionality is reconciled with official fixtures.

## users
`id PK`  
`email CITEXT UNIQUE NOT NULL`  
`password_hash TEXT NOT NULL`  
`display_name TEXT NOT NULL`  
`is_platform_admin BOOLEAN NOT NULL DEFAULT false`  
`created_at NOT NULL`  
`updated_at NOT NULL`

## sessions
`id PK`  
`user_id FK users CASCADE NOT NULL`  
`token_hash BYTEA UNIQUE NOT NULL`  
`expires_at NOT NULL`  
`created_at NOT NULL`  
`last_seen_at NULL`

## events
`id PK`  
`slug TEXT UNIQUE NOT NULL`  
`name TEXT NOT NULL`  
`description TEXT NULL`  
`timezone TEXT NOT NULL`  
`state event_state NOT NULL`  
`registration_opens_at NULL`  
`registration_closes_at NULL`  
`submission_opens_at NULL`  
`submission_closes_at NULL`  
`judging_opens_at NULL`  
`judging_closes_at NULL`  
`published_ranking_snapshot_id UUID NULL`  
`created_by FK users NOT NULL`  
`created_at NOT NULL`  
`updated_at NOT NULL`

## event_memberships
`id PK`  
`event_id FK events RESTRICT`  
`user_id FK users RESTRICT`  
`role event_role`  
`is_active BOOLEAN DEFAULT true`  
`created_at`  
Unique `event_id,user_id,role`.

## event_invitations
`id PK`  
`event_id FK events`  
`email CITEXT`  
`role invitation_role`  
`token_hash BYTEA UNIQUE`  
`track_scope JSONB DEFAULT []`  
`expires_at`  
`accepted_at NULL`  
`invited_by FK users`  
`created_at`.

## tracks
`id PK,event_id FK,slug,name,description?,capacity?,sort_order,is_active`  
Unique `event_id,slug`. Check capacity positive when non-null.

## prizes
`id PK,event_id FK,track_id FK NULL,name,description?,amount?,currency?,sort_order,created_at`.

## submission_questions
`id PK,event_id FK,label,help_text?,type,required,options JSONB,sort_order,is_active,created_at,updated_at`.

## teams
`id PK,event_id FK,name,created_by FK users,created_at`  
Unique `event_id,name`.

## team_members
`team_id FK,user_id FK,is_owner,joined_at`  
PK `team_id,user_id`.

## team_invites
`id PK,team_id FK,token_hash UNIQUE,expires_at?,max_uses?,use_count,created_by,revoked_at?,created_at`.

## assets
`id PK,event_id FK,owner_user_id FK,storage_key UNIQUE,original_name,mime_type,byte_size,sha256,created_at`.

## projects
`id PK,event_id FK,team_id FK,slug,state,current_revision_id?,submitted_at?,locked_at?,created_at`  
Unique `event_id,slug`; planned unique `event_id,team_id`.

## project_revisions
`id PK,project_id FK,revision_number,title,tagline,description,repository_url?,live_url?,demo_video_url?,thumbnail_asset_id?,track_id?,tech_tags JSONB,created_by,created_at`  
Unique `project_id,revision_number`.

## project_revision_assets
For image gallery ordering if multiple local assets are required:  
`revision_id,asset_id,sort_order`  
PK `revision_id,asset_id`.

## project_answer_values
`revision_id,question_id,value_json`  
PK `revision_id,question_id`.

## rubrics
`id PK,event_id FK,name,version,active,created_at`  
Unique `event_id,version`.

## rubric_criteria
`id PK,rubric_id FK,name,description?,weight NUMERIC,min_score NUMERIC,max_score NUMERIC,sort_order`.

## judge_track_scopes
`event_id,judge_id,track_id`  
PK all three.

## judge_assignments
`id PK,event_id FK,judge_id FK users,project_id FK,status,assigned_by FK users,assigned_at`  
Unique `event_id,judge_id,project_id`.

## evaluations
`id PK,assignment_id UNIQUE FK,rubric_id FK,state,current_revision INTEGER,overall_comment?,started_at?,submitted_at?,locked_at?`.

## evaluation_scores
`evaluation_id FK,criterion_id FK,score NUMERIC,comment?`  
PK `evaluation_id,criterion_id`.

## evaluation_revisions
`id PK,evaluation_id FK,revision_number,scores_json JSONB,overall_comment?,changed_by,created_at`  
Unique `evaluation_id,revision_number`.

## ranking_snapshots
`id PK,event_id FK,scoring_version,normalization_version,ranking_version,configuration JSONB,results JSONB,generated_by,generated_at,published_at?`.

## audit_events
`id PK,event_id FK,actor_id FK NULL,action,resource_type,resource_id?,metadata JSONB,created_at`.

## Delete policy

Hard delete permitted only for disposable/unreferenced configuration before meaningful activity. Competition history is preserved by RESTRICT, deactivation, or status transitions.

## Index minimum

- event_memberships(user_id,event_id)
- event_memberships(event_id,role,is_active)
- tracks(event_id,is_active,sort_order)
- projects(event_id,state)
- projects(event_id,submitted_at)
- project_revisions(project_id,revision_number DESC)
- judge_assignments(event_id,judge_id,status)
- judge_assignments(event_id,project_id,status)
- evaluations(state)
- ranking_snapshots(event_id,generated_at DESC)
- audit_events(event_id,created_at DESC)
- audit_events(event_id,actor_id,created_at DESC)

## Integrity not expressible as simple CHECK

Application/domain layer must enforce:
- organizer/judge mutual exclusion;
- track scope compatibility;
- rubric weight sum;
- question answer type validation;
- referenced track belongs to same event;
- judge/project/event relationship consistency;
- deadline/state transitions;
- one current revision belongs to its project;
- publication snapshot belongs to event.
