-- Register Set Pieces Room as team-scoped match-preparation data.

insert into public.platform_permission_matrix
  (module_id, action, roles, scope, requires_organization_scope, requires_team_scope, description)
values
  ('set-pieces-room', 'read', array['admin','club-admin','team-admin','coach','analyst'], 'team', true, true, 'Read team set-piece plans, variants, phases, and opponent responses.'),
  ('set-pieces-room', 'write', array['admin','club-admin','team-admin','coach','analyst'], 'team', true, true, 'Create and update team set-piece plans, variants, phases, and board elements.'),
  ('set-pieces-room', 'delete', array['admin','club-admin','team-admin','coach'], 'team', true, true, 'Archive team set-piece plans and variants.'),
  ('set-pieces-room', 'export', array['admin','coach','analyst'], 'team', true, true, 'Export authorized set-piece plans for team preparation.'),
  ('set-pieces-room', 'restore', array['admin','coach'], 'team', true, true, 'Restore set-piece planning state from audited backups.'),
  ('set-pieces-room', 'admin', array['admin'], 'team', true, true, 'Administer Set Pieces Room access controls.'),
  ('set-pieces-room', 'observe', array['admin','club-admin','team-admin','coach','analyst'], 'team', true, true, 'Observe Set Pieces Room health and data coverage.')
on conflict (module_id, action) do update
set
  roles = excluded.roles,
  scope = excluded.scope,
  requires_organization_scope = excluded.requires_organization_scope,
  requires_team_scope = excluded.requires_team_scope,
  description = excluded.description,
  updated_at = now();
