-- Recover FS Player permissions on older staging snapshots without widening other modules.
do $$
declare
  previous_expression text;
  already_supported boolean;
begin
  select pg_get_expr(conbin, conrelid) into previous_expression
  from pg_constraint
  where conrelid = 'public.platform_permission_matrix'::regclass
    and conname = 'platform_permission_matrix_action_check'
    and contype = 'c';
  if previous_expression is null then
    raise exception 'Expected platform permission action constraint is missing.';
  end if;

  execute format(
    'select bool_and((%s) is true) from (select ''video-analysis''::text as module_id, unnest(array[''present'',''share'',''collaborate'',''process-local-media'']) as action) candidate',
    previous_expression
  ) into already_supported;

  if not already_supported then
    alter table public.platform_permission_matrix
      drop constraint platform_permission_matrix_action_check;
    execute format(
      'alter table public.platform_permission_matrix add constraint platform_permission_matrix_action_check check ((%s) or (module_id = ''video-analysis'' and action in (''present'',''share'',''collaborate'',''process-local-media'')))',
      previous_expression
    );
  end if;
end;
$$;

-- Restore missing FS presentation entries; preserve any existing role configuration.
insert into public.platform_permission_matrix
  (module_id, action, roles, scope, requires_organization_scope, requires_team_scope, description)
values
  ('video-analysis', 'present', array['admin','club-admin','team-admin','coach','analyst','performance'], 'team', true, true, 'Present saved video analysis presentations without exposing local video files.'),
  ('video-analysis', 'share', array['admin','club-admin','team-admin','coach','analyst'], 'team', true, true, 'Share presentation metadata to approved team, role, group, player, or user targets.')
on conflict (module_id, action) do nothing;
