-- Add Platform Appearance to the server-owned permission matrix.
-- Platform Admins can publish safe visual governance; other roles may not
-- read or mutate this central appearance contract directly.

insert into public.platform_permission_matrix
  (module_id, action, roles, scope, requires_organization_scope, requires_team_scope, description)
values
  ('platform-appearance', 'read', array['admin'], 'organization', true, false, 'Read Platform Appearance governance.'),
  ('platform-appearance', 'write', array['admin'], 'organization', true, false, 'Publish Platform Appearance governance.'),
  ('platform-appearance', 'delete', array['admin'], 'organization', true, false, 'Reset Platform Appearance governance to defaults.'),
  ('platform-appearance', 'export', array['admin'], 'organization', true, false, 'Export Platform Appearance governance.'),
  ('platform-appearance', 'restore', array['admin'], 'organization', true, false, 'Restore Platform Appearance governance.'),
  ('platform-appearance', 'admin', array['admin'], 'organization', true, false, 'Administer Platform Appearance governance.'),
  ('platform-appearance', 'observe', array['admin'], 'organization', true, false, 'Observe Platform Appearance governance health.')
on conflict (module_id, action) do update
set
  roles = excluded.roles,
  scope = excluded.scope,
  requires_organization_scope = excluded.requires_organization_scope,
  requires_team_scope = excluded.requires_team_scope,
  description = excluded.description,
  updated_at = now();
