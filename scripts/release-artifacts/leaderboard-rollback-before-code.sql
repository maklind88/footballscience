-- Emergency roll-forward rollback for an empty, database-first Leaderboard release.
-- This migration is valid only before Leaderboard application code is deployed or data exists.
-- migration-safety: allow-destructive
do $$
declare
  leaderboard_class_count integer;
  leaderboard_class_md5 text;
  leaderboard_function_count integer;
  leaderboard_function_md5 text;
  leaderboard_row_count bigint;
  matched_permissions integer;
  deleted_permissions integer;
  dependency_fingerprints jsonb;
begin
  perform set_config('lock_timeout', '5s', true);
  perform set_config('statement_timeout', '60s', true);
  perform set_config('search_path', 'public, extensions, pg_temp', true);
  lock table public.leaderboard_competitions,
    public.leaderboard_participants,
    public.leaderboard_scoring_events,
    public.leaderboard_point_transactions,
    public.leaderboard_audit_events
  in access exclusive mode;

  select count(*)::integer,
    md5(string_agg(concat_ws('|', namespace.nspname, relation.relname, relation.relkind,
      owner.rolname, coalesce(relation.relacl::text, '')), E'\n'
      order by namespace.nspname, relation.relname))
  into leaderboard_class_count, leaderboard_class_md5
  from pg_class relation
  join pg_namespace namespace on namespace.oid = relation.relnamespace
  join pg_roles owner on owner.oid = relation.relowner
  where namespace.nspname in ('public', 'app_private')
    and relation.relname like 'leaderboard_%';

  if leaderboard_class_count <> 28
    or leaderboard_class_md5 <> 'afbfaf46ca11522a18e2d1f928823b2f' then
    raise exception 'Exact Leaderboard relation/index/owner/ACL catalog precondition failed';
  end if;

  select count(*)::integer,
    md5(string_agg(concat_ws('|', namespace.nspname, function_record.proname,
      pg_get_function_identity_arguments(function_record.oid), owner.rolname,
      coalesce(function_record.proacl::text, ''), function_record.prosecdef,
      function_record.provolatile, function_record.proparallel), E'\n'
      order by namespace.nspname, function_record.proname,
        pg_get_function_identity_arguments(function_record.oid)))
  into leaderboard_function_count, leaderboard_function_md5
  from pg_proc function_record
  join pg_namespace namespace on namespace.oid = function_record.pronamespace
  join pg_roles owner on owner.oid = function_record.proowner
  where namespace.nspname in ('public', 'app_private')
    and function_record.proname like 'leaderboard_%';

  if leaderboard_function_count <> 7
    or leaderboard_function_md5 <> '509dbcd39e5fefc29478e70bdea11e9a' then
    raise exception 'Exact Leaderboard function/owner/ACL catalog precondition failed';
  end if;

  if (select count(*) from pg_class relation
      join pg_namespace namespace on namespace.oid = relation.relnamespace
      join pg_index index_record on index_record.indexrelid = relation.oid
      where namespace.nspname = 'public'
        and relation.relname in (
          'platform_clubs_id_org_leaderboard_uidx',
          'platform_teams_id_org_leaderboard_uidx',
          'squad_teams_id_org_leaderboard_uidx',
          'squad_players_id_org_leaderboard_uidx',
          'squad_roster_id_scope_player_leaderboard_uidx'
        )
        and relation.relkind = 'i'
        and index_record.indisvalid
        and index_record.indisready) <> 5 then
    raise exception 'Exact Leaderboard dependency index precondition failed';
  end if;

  select
    (select count(*) from public.leaderboard_competitions)
    + (select count(*) from public.leaderboard_participants)
    + (select count(*) from public.leaderboard_scoring_events)
    + (select count(*) from public.leaderboard_point_transactions)
    + (select count(*) from public.leaderboard_audit_events)
  into leaderboard_row_count;

  if leaderboard_row_count <> 0 then
    raise exception 'Leaderboard rollback is forbidden after data exists';
  end if;

  with expected(action, roles, scope, requires_organization_scope,
    requires_team_scope, description) as (
    values
      ('read', array['admin','club-admin','team-admin','coach','scout','analyst','performance','medical']::text[], 'team', true, true, 'Read the active team monthly Leaderboard.'),
      ('write', array['admin','club-admin','team-admin','coach']::text[], 'team', true, true, 'Award or reverse team Leaderboard points through the guarded API.'),
      ('delete', array['admin']::text[], 'team', true, true, 'No hard delete; administrative correction uses reversal.'),
      ('export', array['admin','club-admin','team-admin','coach']::text[], 'team', true, true, 'Export a monthly Leaderboard snapshot.'),
      ('restore', array['admin']::text[], 'team', true, true, 'Restore Leaderboard data through audited recovery procedures.'),
      ('admin', array['admin']::text[], 'team', true, true, 'Administer Leaderboard competition state.'),
      ('observe', array['admin','club-admin','team-admin','coach']::text[], 'team', true, true, 'Observe Leaderboard integrity and audit health.')
  )
  select count(*)::integer into matched_permissions
  from public.platform_permission_matrix permission
  join expected on expected.action = permission.action
    and expected.roles = permission.roles
    and expected.scope = permission.scope
    and expected.requires_organization_scope = permission.requires_organization_scope
    and expected.requires_team_scope = permission.requires_team_scope
    and expected.description = permission.description
  where permission.module_id = 'leaderboard';

  if matched_permissions <> 7
    or (select count(*) from public.platform_permission_matrix
      where module_id = 'leaderboard') <> 7 then
    raise exception 'Exact Leaderboard permission precondition failed';
  end if;

  with expected(action, roles, scope, requires_organization_scope,
    requires_team_scope, description) as (
    values
      ('read', array['admin','club-admin','team-admin','coach','scout','analyst','performance','medical']::text[], 'team', true, true, 'Read the active team monthly Leaderboard.'),
      ('write', array['admin','club-admin','team-admin','coach']::text[], 'team', true, true, 'Award or reverse team Leaderboard points through the guarded API.'),
      ('delete', array['admin']::text[], 'team', true, true, 'No hard delete; administrative correction uses reversal.'),
      ('export', array['admin','club-admin','team-admin','coach']::text[], 'team', true, true, 'Export a monthly Leaderboard snapshot.'),
      ('restore', array['admin']::text[], 'team', true, true, 'Restore Leaderboard data through audited recovery procedures.'),
      ('admin', array['admin']::text[], 'team', true, true, 'Administer Leaderboard competition state.'),
      ('observe', array['admin','club-admin','team-admin','coach']::text[], 'team', true, true, 'Observe Leaderboard integrity and audit health.')
  )
  delete from public.platform_permission_matrix permission
  using expected
  where permission.module_id = 'leaderboard'
    and permission.action = expected.action
    and permission.roles = expected.roles
    and permission.scope = expected.scope
    and permission.requires_organization_scope = expected.requires_organization_scope
    and permission.requires_team_scope = expected.requires_team_scope
    and permission.description = expected.description;

  get diagnostics deleted_permissions = row_count;
  if deleted_permissions <> 7 then
    raise exception 'Expected to remove exactly seven Leaderboard permissions';
  end if;

  execute 'drop function public.leaderboard_award_batch(uuid,uuid,uuid,uuid,uuid,date,text,date,text,text,text,text,uuid,jsonb) restrict';
  execute 'drop function public.leaderboard_reverse_event(uuid,uuid,uuid,text,text,text,uuid) restrict';
  execute 'drop function public.leaderboard_month_snapshot(uuid,uuid,uuid,date) restrict';

  execute 'drop table public.leaderboard_audit_events restrict';
  execute 'drop table public.leaderboard_point_transactions restrict';
  execute 'drop table public.leaderboard_participants restrict';
  execute 'drop table public.leaderboard_scoring_events restrict';
  execute 'drop table public.leaderboard_competitions restrict';

  execute 'drop function app_private.leaderboard_actor_has_role(uuid,uuid,uuid,text[]) restrict';
  execute 'drop function app_private.leaderboard_block_hard_delete() restrict';
  execute 'drop function app_private.leaderboard_block_append_only_mutation() restrict';
  execute 'drop function app_private.leaderboard_guard_event_update() restrict';

  execute 'drop index public.platform_clubs_id_org_leaderboard_uidx restrict';
  execute 'drop index public.platform_teams_id_org_leaderboard_uidx restrict';
  execute 'drop index public.squad_teams_id_org_leaderboard_uidx restrict';
  execute 'drop index public.squad_players_id_org_leaderboard_uidx restrict';
  execute 'drop index public.squad_roster_id_scope_player_leaderboard_uidx restrict';

  if exists (select 1 from pg_class relation
      join pg_namespace namespace on namespace.oid = relation.relnamespace
      where namespace.nspname in ('public', 'app_private')
        and (relation.relname like 'leaderboard_%'
          or relation.relname in (
            'platform_clubs_id_org_leaderboard_uidx',
            'platform_teams_id_org_leaderboard_uidx',
            'squad_teams_id_org_leaderboard_uidx',
            'squad_players_id_org_leaderboard_uidx',
            'squad_roster_id_scope_player_leaderboard_uidx'
          ))) then
    raise exception 'Leaderboard relation/index remained after rollback';
  end if;

  if exists (select 1 from pg_proc function_record
      join pg_namespace namespace on namespace.oid = function_record.pronamespace
      where namespace.nspname in ('public', 'app_private')
        and function_record.proname like 'leaderboard_%') then
    raise exception 'Leaderboard function remained after rollback';
  end if;

  if exists (select 1 from public.platform_permission_matrix
      where module_id = 'leaderboard') then
    raise exception 'Leaderboard permission remained after rollback';
  end if;

  with target_relations(schema_name, table_name) as (
    values ('public','platform_clubs'),('public','platform_teams'),('public','squad_teams'),
      ('public','squad_players'),('public','squad_roster_memberships'),('public','platform_organizations'),
      ('public','squad_organizations'),('public','platform_memberships'),('public','platform_user_profiles'),
      ('public','platform_permission_matrix'),('auth','users')
  ), target_oids as (
    select relation.oid, namespace.nspname, relation.relname, relation.relowner
    from target_relations target
    join pg_namespace namespace on namespace.nspname = target.schema_name
    join pg_class relation on relation.relnamespace = namespace.oid
      and relation.relname = target.table_name and relation.relkind in ('r','p')
  ), fingerprints as (
    select 'relations' category, count(*)::integer item_count,
      md5(string_agg(concat_ws('|', target.nspname, target.relname, relation.relkind,
        relation.relrowsecurity, relation.relforcerowsecurity, relation.relpersistence), E'\n'
        order by target.nspname, target.relname)) fingerprint
    from target_oids target join pg_class relation on relation.oid = target.oid
    union all
    select 'columns', count(*)::integer,
      md5(string_agg(concat_ws('|', target.nspname, target.relname, attribute.attnum,
        attribute.attname, format_type(attribute.atttypid, attribute.atttypmod), attribute.attnotnull,
        coalesce(pg_get_expr(default_record.adbin, default_record.adrelid), ''),
        attribute.attgenerated, attribute.attidentity), E'\n'
        order by target.nspname, target.relname, attribute.attnum))
    from target_oids target
    join pg_attribute attribute on attribute.attrelid = target.oid
      and attribute.attnum > 0 and not attribute.attisdropped
    left join pg_attrdef default_record on default_record.adrelid = attribute.attrelid
      and default_record.adnum = attribute.attnum
    union all
    select 'constraints', count(*)::integer,
      md5(string_agg(concat_ws('|', target.nspname, target.relname, constraint_record.conname,
        constraint_record.contype, pg_get_constraintdef(constraint_record.oid, true),
        constraint_record.convalidated, constraint_record.condeferrable,
        constraint_record.condeferred), E'\n'
        order by target.nspname, target.relname, constraint_record.conname))
    from target_oids target
    join pg_constraint constraint_record on constraint_record.conrelid = target.oid
    union all
    select 'indexes', count(*)::integer,
      md5(string_agg(concat_ws('|', index_record.schemaname, index_record.tablename,
        index_record.indexname, index_record.indexdef), E'\n'
        order by index_record.schemaname, index_record.tablename, index_record.indexname))
    from pg_indexes index_record
    join target_relations target on target.schema_name = index_record.schemaname
      and target.table_name = index_record.tablename
    union all
    select 'policies', count(*)::integer,
      md5(string_agg(concat_ws('|', policy.schemaname, policy.tablename, policy.policyname,
        policy.permissive, policy.roles::text, policy.cmd, coalesce(policy.qual, ''),
        coalesce(policy.with_check, '')), E'\n'
        order by policy.schemaname, policy.tablename, policy.policyname))
    from pg_policies policy
    join target_relations target on target.schema_name = policy.schemaname
      and target.table_name = policy.tablename
    union all
    select 'grants', count(*)::integer,
      md5(string_agg(concat_ws('|', target.nspname, target.relname,
        coalesce(role_record.rolname, 'PUBLIC'), acl.privilege_type, acl.is_grantable), E'\n'
        order by target.nspname, target.relname, coalesce(role_record.rolname, 'PUBLIC'),
          acl.privilege_type, acl.is_grantable))
    from target_oids target
    cross join lateral aclexplode(coalesce((select relation.relacl from pg_class relation
      where relation.oid = target.oid), acldefault('r', target.relowner))) acl
    left join pg_roles role_record on role_record.oid = acl.grantee
  )
  select jsonb_object_agg(category, jsonb_build_array(item_count, fingerprint))
  into dependency_fingerprints
  from fingerprints;

  if dependency_fingerprints <> jsonb_build_object(
    'columns', jsonb_build_array(194, '8b36ab7efb997774d3f5e0a6faa480c6'),
    'constraints', jsonb_build_array(129, 'dffe35c0573626ce28a558e24bfa26a4'),
    'grants', jsonb_build_array(194, '2fbf42971bd823bcd87f635f3ec9d710'),
    'indexes', jsonb_build_array(53, '34168e3f72b9f4413b1fdb4591c7ae78'),
    'policies', jsonb_build_array(10, 'e3287e44bbf6e0230e3db1fe69ff62b6'),
    'relations', jsonb_build_array(11, '96c6800c1527b3efa8114712615fec08')
  ) then
    raise exception 'Pre-Leaderboard production dependency fingerprint was not restored';
  end if;

  if not exists (select 1 from pg_namespace namespace
      join pg_roles owner on owner.oid = namespace.nspowner
      where namespace.nspname = 'app_private' and owner.rolname = 'postgres'
        and namespace.nspacl::text = '{postgres=UC/postgres,authenticated=U/postgres,service_role=U/postgres}') then
    raise exception 'app_private schema owner/ACL drifted during rollback';
  end if;

  if not exists (select 1 from pg_namespace namespace
      join pg_roles owner on owner.oid = namespace.nspowner
      where namespace.nspname = 'public' and owner.rolname = 'pg_database_owner'
        and namespace.nspacl::text = '{pg_database_owner=UC/pg_database_owner,=U/pg_database_owner,postgres=U/pg_database_owner,anon=U/pg_database_owner,authenticated=U/pg_database_owner,service_role=U/pg_database_owner}') then
    raise exception 'public schema owner/ACL drifted during rollback';
  end if;

  if exists (select 1 from pg_class relation
      join pg_namespace namespace on namespace.oid = relation.relnamespace
      where namespace.nspname = 'public'
        and relation.relname like 'session_planner_%') then
    raise exception 'Out-of-scope Session Planner relation present';
  end if;

  if exists (select 1 from pg_proc function_record
      join pg_namespace namespace on namespace.oid = function_record.pronamespace
      where namespace.nspname = 'app_private'
        and (function_record.proname like 'session_planner_%'
          or function_record.proname = 'can_read_session_planner_scope')) then
    raise exception 'Out-of-scope Session Planner function present';
  end if;

  if (select count(*) from public.platform_module_migration_checkpoints
      where module_id = 'session-planner') <> 1
    or not exists (select 1 from public.platform_module_migration_checkpoints
      where module_id = 'session-planner'
        and source_storage_key = 'football-session-planner-v3'
        and target_table = 'sessions' and phase = 'planned'
        and reads_from_database is false and writes_to_database is false
        and app_state_fallback_enabled is true and owner = 'platform')
    or exists (select 1 from public.platform_module_migration_checkpoints
      where module_id = 'session-planner'
        and target_table = 'session_planner_sessions') then
    raise exception 'Session Planner baseline checkpoint drifted';
  end if;

  if exists (select 1 from public.platform_permission_matrix
      where module_id = 'set-pieces-room') then
    raise exception 'Out-of-scope Set Pieces permission present';
  end if;
end;
$$;
