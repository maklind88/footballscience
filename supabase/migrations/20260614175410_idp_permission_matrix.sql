-- Register IDP / Player Development in the live permission control plane.

insert into public.platform_permission_matrix
  (module_id, action, roles, scope, requires_organization_scope, requires_team_scope, description)
values
  ('idp', 'read', array['admin','club-admin','team-admin','coach','scout','analyst','performance','medical'], 'team', true, true, 'Read IDP profiles, focuses, evidence, reviews, ownership, next actions, milestones, and clip-bank status.'),
  ('idp', 'write', array['admin','club-admin','team-admin','coach','analyst'], 'team', true, true, 'Create and update IDP focuses, evidence links, reviews, next actions, ownership, and clip-bank status through guarded server routes.'),
  ('idp', 'delete', array['admin','club-admin','team-admin','coach'], 'team', true, true, 'Archive or soft-delete IDP records; hard deletes are blocked.'),
  ('idp', 'export', array['admin','coach','analyst'], 'team', true, true, 'Export authorized IDP summaries and evidence references for coaching review.'),
  ('idp', 'restore', array['admin','coach'], 'team', true, true, 'Restore IDP records from audited backups or recovery flows.'),
  ('idp', 'admin', array['admin'], 'team', true, true, 'Administer IDP access controls and module governance.'),
  ('idp', 'observe', array['admin','club-admin','team-admin','coach'], 'team', true, true, 'Observe IDP health, review coverage, evidence gaps, and module adoption.')
on conflict (module_id, action) do update
set
  roles = excluded.roles,
  scope = excluded.scope,
  requires_organization_scope = excluded.requires_organization_scope,
  requires_team_scope = excluded.requires_team_scope,
  description = excluded.description,
  updated_at = now();
