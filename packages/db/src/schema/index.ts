// Schema aggregate. Tables are added phase-by-phase:
//
//   Phase 1: users, sessions
//   Phase 2: events, event_memberships, event_invitations, tracks, prizes, submission_questions
//   Phase 3: teams, team_members, team_invites, assets, projects, project_revisions, project_answer_values
//   Phase 4/5: rubrics, rubric_criteria, judge_track_scopes, judge_assignments,
//              evaluations, evaluation_scores, evaluation_revisions
//   Phase 6: ranking_snapshots, audit_events
export {};