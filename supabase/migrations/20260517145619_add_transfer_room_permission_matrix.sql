-- Register Transfer Room in the live permission control plane.
-- Content is team-scoped and confidential; broad staff roles still require
-- explicit per-team selection in the app-state access list.

insert into public.platform_permission_matrix
  (module_id, action, roles, scope, requires_organization_scope, requires_team_scope, description)
values
  ('transfer-room', 'read', array['admin','team-admin'], 'team', true, true, 'Read team transfer planning, squad valuations, target snapshots, and league-rule calculations.'),
  ('transfer-room', 'write', array['admin','team-admin'], 'team', true, true, 'Update team transfer planning, player status, budget assumptions, and selected-person access.'),
  ('transfer-room', 'delete', array['admin','team-admin'], 'team', true, true, 'Archive transfer planning records and target snapshots.'),
  ('transfer-room', 'export', array['admin','team-admin'], 'team', true, true, 'Export confidential transfer planning data for authorized leadership.'),
  ('transfer-room', 'restore', array['admin','team-admin'], 'team', true, true, 'Restore transfer planning state from audited backups.'),
  ('transfer-room', 'admin', array['admin','team-admin'], 'team', true, true, 'Administer Transfer Room league rules, access controls, and team planning settings.'),
  ('transfer-room', 'observe', array['admin','team-admin'], 'team', true, true, 'Observe Transfer Room health, access events, and planning data coverage.')
on conflict (module_id, action) do update
set
  roles = excluded.roles,
  scope = excluded.scope,
  requires_organization_scope = excluded.requires_organization_scope,
  requires_team_scope = excluded.requires_team_scope,
  description = excluded.description,
  updated_at = now();
