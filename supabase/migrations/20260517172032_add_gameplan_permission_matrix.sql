-- Register Gameplan in the live permission control plane.
-- Game plans are team-scoped match-preparation records shared with staff,
-- while the player brief audience is selected explicitly inside the module.

insert into public.platform_permission_matrix
  (module_id, action, roles, scope, requires_organization_scope, requires_team_scope, description)
values
  ('gameplan', 'read', array['admin','club-admin','team-admin','coach','scout','analyst','performance','medical'], 'team', true, true, 'Read match gameplans, staff responsibilities, and published player briefs.'),
  ('gameplan', 'write', array['admin','club-admin','team-admin','coach','scout','analyst'], 'team', true, true, 'Create and update match gameplans, staff responsibilities, and player brief content.'),
  ('gameplan', 'delete', array['admin','club-admin','team-admin','coach','scout','analyst'], 'team', true, true, 'Archive match gameplans and related preparation records.'),
  ('gameplan', 'export', array['admin','coach','analyst'], 'team', true, true, 'Export match gameplan records for authorized staff review.'),
  ('gameplan', 'restore', array['admin','coach'], 'team', true, true, 'Restore match gameplan state from audited backups.'),
  ('gameplan', 'admin', array['admin'], 'team', true, true, 'Administer Gameplan access controls and match-preparation settings.'),
  ('gameplan', 'observe', array['admin','coach','analyst'], 'team', true, true, 'Observe Gameplan health, publication events, and preparation data coverage.')
on conflict (module_id, action) do update
set
  roles = excluded.roles,
  scope = excluded.scope,
  requires_organization_scope = excluded.requires_organization_scope,
  requires_team_scope = excluded.requires_team_scope,
  description = excluded.description,
  updated_at = now();
