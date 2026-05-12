-- Register the Scouting workspace in the live permission control plane.

insert into public.platform_permission_matrix
  (module_id, action, roles, scope, requires_organization_scope, requires_team_scope, description)
values
  ('scouting', 'read', array['admin','club-admin','team-admin','coach','scout','analyst'], 'team', true, true, 'Read scouting targets, reports, and shortlists.'),
  ('scouting', 'write', array['admin','club-admin','team-admin','coach','scout','analyst'], 'team', true, true, 'Create and update scouting targets, reports, and shortlists.'),
  ('scouting', 'delete', array['admin','club-admin','team-admin','coach','scout','analyst'], 'team', true, true, 'Archive scouting records.'),
  ('scouting', 'export', array['admin','coach','scout','analyst'], 'team', true, true, 'Export scouting records.'),
  ('scouting', 'restore', array['admin','coach'], 'team', true, true, 'Restore scouting records.'),
  ('scouting', 'admin', array['admin'], 'team', true, true, 'Administer scouting module.'),
  ('scouting', 'observe', array['admin','coach','scout','analyst'], 'team', true, true, 'Observe scouting health.')
on conflict (module_id, action) do update
set roles = excluded.roles,
    scope = excluded.scope,
    requires_organization_scope = excluded.requires_organization_scope,
    requires_team_scope = excluded.requires_team_scope,
    description = excluded.description,
    updated_at = now();
