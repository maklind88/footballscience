export const dependencyFingerprintSql = String.raw`
with target_relations(schema_name, table_name) as (
  values ('public','platform_clubs'),('public','platform_teams'),('public','squad_teams'),
    ('public','squad_players'),('public','squad_roster_memberships'),('public','platform_organizations'),
    ('public','squad_organizations'),('public','platform_memberships'),('public','platform_user_profiles'),
    ('public','platform_permission_matrix'),('auth','users')
), target_oids as (
  select c.oid,n.nspname,c.relname,c.relowner from target_relations tr
  join pg_namespace n on n.nspname=tr.schema_name
  join pg_class c on c.relnamespace=n.oid and c.relname=tr.table_name and c.relkind in ('r','p')
), fingerprints as (
  select 'relations' category,count(*)::int item_count,md5(string_agg(concat_ws('|',t.nspname,t.relname,c.relkind,c.relrowsecurity,c.relforcerowsecurity,c.relpersistence),E'\n' order by t.nspname,t.relname)) fingerprint from target_oids t join pg_class c on c.oid=t.oid
  union all select 'columns',count(*)::int,md5(string_agg(concat_ws('|',t.nspname,t.relname,a.attnum,a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,coalesce(pg_get_expr(d.adbin,d.adrelid),''),a.attgenerated,a.attidentity),E'\n' order by t.nspname,t.relname,a.attnum)) from target_oids t join pg_attribute a on a.attrelid=t.oid and a.attnum>0 and not a.attisdropped left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
  union all select 'constraints',count(*)::int,md5(string_agg(concat_ws('|',t.nspname,t.relname,con.conname,con.contype,pg_get_constraintdef(con.oid,true),con.convalidated,con.condeferrable,con.condeferred),E'\n' order by t.nspname,t.relname,con.conname)) from target_oids t join pg_constraint con on con.conrelid=t.oid
  union all select 'indexes',count(*)::int,md5(string_agg(concat_ws('|',i.schemaname,i.tablename,i.indexname,i.indexdef),E'\n' order by i.schemaname,i.tablename,i.indexname)) from pg_indexes i join target_relations tr on tr.schema_name=i.schemaname and tr.table_name=i.tablename
  union all select 'policies',count(*)::int,md5(string_agg(concat_ws('|',p.schemaname,p.tablename,p.policyname,p.permissive,p.roles::text,p.cmd,coalesce(p.qual,''),coalesce(p.with_check,'')),E'\n' order by p.schemaname,p.tablename,p.policyname)) from pg_policies p join target_relations tr on tr.schema_name=p.schemaname and tr.table_name=p.tablename
  union all select 'grants',count(*)::int,md5(string_agg(concat_ws('|',t.nspname,t.relname,coalesce(r.rolname,'PUBLIC'),x.privilege_type,x.is_grantable),E'\n' order by t.nspname,t.relname,coalesce(r.rolname,'PUBLIC'),x.privilege_type,x.is_grantable)) from target_oids t cross join lateral aclexplode(coalesce((select c.relacl from pg_class c where c.oid=t.oid),acldefault('r',t.relowner))) x left join pg_roles r on r.oid=x.grantee
) select category,item_count,fingerprint from fingerprints order by category;`;

export const postApplyCatalogFingerprintSql = String.raw`
with leaderboard_relations as (
  select relation.oid, namespace.nspname as schema_name, relation.relname,
    relation.relkind, relation.relrowsecurity, relation.relforcerowsecurity,
    owner.rolname as owner_name, coalesce(relation.relacl::text, '') as acl
  from pg_class relation
  join pg_namespace namespace on namespace.oid = relation.relnamespace
  join pg_roles owner on owner.oid = relation.relowner
  where namespace.nspname = 'public'
    and relation.relkind in ('r', 'p')
    and relation.relname like 'leaderboard_%'
), fingerprint as (
  select 'relation'::text as object_type,
    format('%I.%I', schema_name, relname) as object_identity,
    format('kind=%s|rls=%s|force=%s|owner=%I|acl=%s', relkind, relrowsecurity, relforcerowsecurity, owner_name, acl) as object_definition
  from leaderboard_relations
  union all
  select 'column', format('%I.%I.%s', relation.schema_name, relation.relname, attribute.attnum),
    format('%I|%s|notnull=%s|default=%s|identity=%s|generated=%s|acl=%s',
      attribute.attname, format_type(attribute.atttypid, attribute.atttypmod), attribute.attnotnull,
      coalesce(pg_get_expr(default_record.adbin, default_record.adrelid), ''),
      attribute.attidentity, attribute.attgenerated, coalesce(attribute.attacl::text, ''))
  from leaderboard_relations relation
  join pg_attribute attribute on attribute.attrelid = relation.oid and attribute.attnum > 0 and not attribute.attisdropped
  left join pg_attrdef default_record on default_record.adrelid = relation.oid and default_record.adnum = attribute.attnum
  union all
  select 'constraint', format('%I.%I.%I', relation.schema_name, relation.relname, constraint_record.conname),
    format('validated=%s|%s', constraint_record.convalidated, pg_get_constraintdef(constraint_record.oid, true))
  from leaderboard_relations relation
  join pg_constraint constraint_record on constraint_record.conrelid = relation.oid
  union all
  select 'index', format('%I.%I', index_namespace.nspname, index_relation.relname), pg_get_indexdef(index_relation.oid)
  from leaderboard_relations relation
  join pg_index index_record on index_record.indrelid = relation.oid
  join pg_class index_relation on index_relation.oid = index_record.indexrelid
  join pg_namespace index_namespace on index_namespace.oid = index_relation.relnamespace
  union all
  select 'dependency_index', format('%I.%I', index_namespace.nspname, index_relation.relname), pg_get_indexdef(index_relation.oid)
  from pg_class index_relation
  join pg_namespace index_namespace on index_namespace.oid = index_relation.relnamespace
  where index_namespace.nspname = 'public'
    and index_relation.relkind = 'i'
    and index_relation.relname in (
      'platform_clubs_id_org_leaderboard_uidx',
      'platform_teams_id_org_leaderboard_uidx',
      'squad_teams_id_org_leaderboard_uidx',
      'squad_players_id_org_leaderboard_uidx',
      'squad_roster_id_scope_player_leaderboard_uidx'
    )
  union all
  select 'trigger', format('%I.%I.%I', relation.schema_name, relation.relname, trigger_record.tgname),
    format('enabled=%s|%s', trigger_record.tgenabled, pg_get_triggerdef(trigger_record.oid, true))
  from leaderboard_relations relation
  join pg_trigger trigger_record on trigger_record.tgrelid = relation.oid and not trigger_record.tgisinternal
  union all
  select 'function', format('%I.%s', namespace.nspname, function_record.oid::regprocedure),
    format('owner=%I|security_definer=%s|config=%s|acl=%s|definition=%s',
      owner.rolname, function_record.prosecdef, coalesce(function_record.proconfig::text, ''),
      coalesce(function_record.proacl::text, ''), pg_get_functiondef(function_record.oid))
  from pg_proc function_record
  join pg_namespace namespace on namespace.oid = function_record.pronamespace
  join pg_roles owner on owner.oid = function_record.proowner
  where namespace.nspname in ('public', 'app_private')
    and function_record.proname like 'leaderboard_%'
  union all
  select 'policy', format('%I.%I.%I', namespace.nspname, relation.relname, policy.polname),
    format('%s|%s|roles=%s|qual=%s|check=%s', policy.polcmd, policy.polpermissive,
      policy.polroles::text, coalesce(pg_get_expr(policy.polqual, policy.polrelid), ''),
      coalesce(pg_get_expr(policy.polwithcheck, policy.polrelid), ''))
  from pg_policy policy
  join pg_class relation on relation.oid = policy.polrelid
  join pg_namespace namespace on namespace.oid = relation.relnamespace
  where namespace.nspname = 'public' and relation.relname like 'leaderboard_%'
  union all
  select 'permission', format('leaderboard.%s', action),
    format('roles=%s|scope=%s|org=%s|team=%s|description=%s', roles::text, scope,
      requires_organization_scope, requires_team_scope, description)
  from public.platform_permission_matrix
  where module_id = 'leaderboard'
)
select count(*) as object_count,
  md5(string_agg(format('%s|%s|%s', object_type, object_identity, object_definition), E'\n'
    order by object_type, object_identity, object_definition)) as catalog_md5,
  count(*) filter (where object_type = 'relation') as relations,
  count(*) filter (where object_type = 'column') as columns,
  count(*) filter (where object_type = 'constraint') as constraints,
  count(*) filter (where object_type = 'index') as indexes,
  count(*) filter (where object_type = 'dependency_index') as dependency_indexes,
  count(*) filter (where object_type = 'trigger') as triggers,
  count(*) filter (where object_type = 'function') as functions,
  count(*) filter (where object_type = 'policy') as policies,
  count(*) filter (where object_type = 'permission') as permissions
from fingerprint;`;

const outOfScopeCatalogAbsenceAssertionsSql = String.raw`
  if exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname like 'session_planner_%') then raise exception 'Out-of-scope Session Planner relation present'; end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='app_private' and (p.proname like 'session_planner_%' or p.proname='can_read_session_planner_scope')) then raise exception 'Out-of-scope Session Planner function present'; end if;
  if (select count(*) from public.platform_module_migration_checkpoints where module_id='session-planner') <> 1 or not exists (select 1 from public.platform_module_migration_checkpoints where module_id='session-planner' and source_storage_key='football-session-planner-v3' and target_table='sessions' and phase='planned' and reads_from_database is false and writes_to_database is false and app_state_fallback_enabled is true and owner='platform') then raise exception 'Session Planner baseline checkpoint drifted'; end if;
  if exists (select 1 from public.platform_module_migration_checkpoints where module_id='session-planner' and target_table='session_planner_sessions') then raise exception 'Out-of-scope Session Planner database checkpoint present'; end if;
  if exists (select 1 from public.platform_permission_matrix where module_id='set-pieces-room') then raise exception 'Out-of-scope Set Pieces permission present'; end if;`;

export function makePreApplySql({ targetVersion }) {
  return String.raw`
begin read only;
do $$ begin
  if current_setting('server_version_num')::int < 170000 then raise exception 'Postgres 17+ required'; end if;
  if current_database() <> 'postgres' or current_user <> 'postgres' then raise exception 'Unexpected database identity'; end if;
  if not exists (select 1 from pg_stat_ssl where pid=pg_backend_pid() and ssl) then raise exception 'TLS is required'; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') or not exists (select 1 from pg_roles where rolname='anon') or not exists (select 1 from pg_roles where rolname='authenticated') then raise exception 'Supabase application roles missing'; end if;
${outOfScopeCatalogAbsenceAssertionsSql}
  if exists (select 1 from supabase_migrations.schema_migrations where version='${targetVersion}') then raise exception 'Leaderboard target migration already present'; end if;
  if exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname like 'leaderboard_%') then raise exception 'Leaderboard relation already present'; end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','app_private') and p.proname like 'leaderboard_%') then raise exception 'Leaderboard function already present'; end if;
  if exists (select 1 from public.platform_permission_matrix where module_id='leaderboard') then raise exception 'Leaderboard permission rows already present'; end if;
end $$;
rollback;`;
}

export function makePostApplySql({ targetVersion, targetName }, canonicalTarget) {
  return String.raw`
begin read only;
do $$ declare leaderboard_table text; fn regprocedure; begin
  if (select count(*) from supabase_migrations.schema_migrations) <> 48 then raise exception 'Expected 48 migrations'; end if;
  if exists (select 1 from supabase_migrations.schema_migrations where version in ('20260722202605','20260810214000')) then raise exception 'Out-of-scope migration entered history'; end if;
${outOfScopeCatalogAbsenceAssertionsSql}
  if not exists (select 1 from supabase_migrations.schema_migrations where version='${targetVersion}' and name='${targetName}' and cardinality(statements)=${canonicalTarget.statements} and octet_length(array_to_string(statements,E';\n')||E';\n')=${canonicalTarget.bytes} and md5(array_to_string(statements,E';\n')||E';\n')='${canonicalTarget.md5}') then raise exception 'Stored target canonical migration fingerprint mismatch'; end if;
  if not exists (select 1 from pg_namespace n join pg_roles r on r.oid=n.nspowner where n.nspname='app_private' and r.rolname='postgres' and n.nspacl::text='{postgres=UC/postgres,authenticated=U/postgres,service_role=U/postgres}') then raise exception 'app_private schema owner/ACL mismatch'; end if;
  if not exists (select 1 from pg_namespace n join pg_roles r on r.oid=n.nspowner where n.nspname='public' and r.rolname='pg_database_owner' and n.nspacl::text='{pg_database_owner=UC/pg_database_owner,=U/pg_database_owner,postgres=U/pg_database_owner,anon=U/pg_database_owner,authenticated=U/pg_database_owner,service_role=U/pg_database_owner}') then raise exception 'public schema owner/ACL mismatch'; end if;
  if (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','app_private') and c.relname like 'leaderboard_%' and c.relkind='S') <> 0 then raise exception 'Leaderboard sequence is forbidden'; end if;
  if not exists (select 1 from (select count(*)::int item_count,md5(string_agg(concat_ws('|',n.nspname,c.relname,c.relkind,r.rolname,coalesce(c.relacl::text,'')),E'\n' order by n.nspname,c.relname)) fingerprint from pg_class c join pg_namespace n on n.oid=c.relnamespace join pg_roles r on r.oid=c.relowner where n.nspname in ('public','app_private') and c.relname like 'leaderboard_%') catalog where item_count=28 and fingerprint='afbfaf46ca11522a18e2d1f928823b2f') then raise exception 'Exact Leaderboard relation/index/owner/ACL catalog mismatch'; end if;
  if not exists (select 1 from (select count(*)::int item_count,md5(string_agg(concat_ws('|',n.nspname,p.proname,pg_get_function_identity_arguments(p.oid),r.rolname,coalesce(p.proacl::text,''),p.prosecdef,p.provolatile,p.proparallel),E'\n' order by n.nspname,p.proname,pg_get_function_identity_arguments(p.oid))) fingerprint from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_roles r on r.oid=p.proowner where n.nspname in ('public','app_private') and p.proname like 'leaderboard_%') catalog where item_count=7 and fingerprint='509dbcd39e5fefc29478e70bdea11e9a') then raise exception 'Exact Leaderboard function/owner/ACL catalog mismatch'; end if;
  if (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('leaderboard_competitions','leaderboard_participants','leaderboard_scoring_events','leaderboard_point_transactions','leaderboard_audit_events') and c.relkind='r' and c.relrowsecurity) <> 5 then raise exception 'Leaderboard RLS table set mismatch'; end if;
  if exists (select 1 from pg_policies where schemaname='public' and tablename like 'leaderboard_%') then raise exception 'Browser policies must remain absent'; end if;
  if (select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname like 'leaderboard_%' and not t.tgisinternal) <> 6 then raise exception 'Leaderboard trigger set mismatch'; end if;
  if (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','app_private') and p.proname like 'leaderboard_%') <> 7 then raise exception 'Leaderboard function set mismatch'; end if;
  if (select count(*) from public.platform_permission_matrix where module_id='leaderboard' and action=any(array['read','write','delete','export','restore','admin','observe'])) <> 7 then raise exception 'Leaderboard permission matrix mismatch'; end if;
  if (select count(*) from pg_index i join pg_class idx on idx.oid=i.indexrelid join pg_namespace n on n.oid=idx.relnamespace where n.nspname='public' and idx.relname like '%_leaderboard_uidx' and i.indisvalid and i.indisready) <> 5 then raise exception 'Leaderboard dependency index set mismatch'; end if;
  foreach leaderboard_table in array array['leaderboard_competitions','leaderboard_participants','leaderboard_scoring_events','leaderboard_point_transactions','leaderboard_audit_events'] loop
    if has_table_privilege('anon',format('public.%I',leaderboard_table),'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') or has_table_privilege('authenticated',format('public.%I',leaderboard_table),'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') then raise exception 'Browser table privilege leaked on %',leaderboard_table; end if;
    if has_table_privilege('service_role',format('public.%I',leaderboard_table),'DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') then raise exception 'Destructive service_role privilege leaked on %',leaderboard_table; end if;
    if exists (select 1 from pg_attribute a where a.attrelid=format('public.%I',leaderboard_table)::regclass and a.attnum>0 and not a.attisdropped and a.attacl is not null) then raise exception 'Explicit column ACL leaked on %',leaderboard_table; end if;
  end loop;
  if exists (
    with expected(table_name,privilege_type) as (values
      ('leaderboard_audit_events','INSERT'),('leaderboard_audit_events','SELECT'),
      ('leaderboard_competitions','INSERT'),('leaderboard_competitions','SELECT'),('leaderboard_competitions','UPDATE'),
      ('leaderboard_participants','INSERT'),('leaderboard_participants','SELECT'),
      ('leaderboard_point_transactions','INSERT'),('leaderboard_point_transactions','SELECT'),
      ('leaderboard_scoring_events','INSERT'),('leaderboard_scoring_events','SELECT'),('leaderboard_scoring_events','UPDATE')
    ), actual as (
      select table_name,privilege_type from information_schema.role_table_grants
      where table_schema='public' and table_name like 'leaderboard_%' and grantee='service_role' and is_grantable='NO'
    ) select * from ((select * from actual except select * from expected) union all (select * from expected except select * from actual)) delta
  ) then raise exception 'Exact service_role table grant matrix mismatch'; end if;
  if exists (select 1 from information_schema.role_table_grants where table_schema='public' and table_name like 'leaderboard_%' and grantee in ('service_role','anon','authenticated','PUBLIC') and is_grantable='YES') then raise exception 'Grant option leaked'; end if;
  foreach fn in array array[
    'public.leaderboard_award_batch(uuid,uuid,uuid,uuid,uuid,date,text,date,text,text,text,text,uuid,jsonb)'::regprocedure,
    'public.leaderboard_reverse_event(uuid,uuid,uuid,text,text,text,uuid)'::regprocedure,
    'public.leaderboard_month_snapshot(uuid,uuid,uuid,date)'::regprocedure,
    'app_private.leaderboard_actor_has_role(uuid,uuid,uuid,text[])'::regprocedure
  ] loop
    if not has_function_privilege('service_role',fn,'EXECUTE') then raise exception 'Missing intended service_role EXECUTE on %',fn; end if;
    if has_function_privilege('service_role',fn,'EXECUTE WITH GRANT OPTION') then raise exception 'service_role EXECUTE grant option leaked on %',fn; end if;
    if has_function_privilege('anon',fn,'EXECUTE') or has_function_privilege('authenticated',fn,'EXECUTE') or exists (select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=fn and acl.grantee=0 and acl.privilege_type='EXECUTE') then raise exception 'Browser/PUBLIC EXECUTE leaked on %',fn; end if;
  end loop;
  foreach fn in array array[
    'app_private.leaderboard_block_hard_delete()'::regprocedure,
    'app_private.leaderboard_block_append_only_mutation()'::regprocedure,
    'app_private.leaderboard_guard_event_update()'::regprocedure
  ] loop
    if has_function_privilege('service_role',fn,'EXECUTE') or has_function_privilege('anon',fn,'EXECUTE') or has_function_privilege('authenticated',fn,'EXECUTE') or exists (select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=fn and acl.grantee=0 and acl.privilege_type='EXECUTE') then raise exception 'Trigger function EXECUTE leaked on %',fn; end if;
  end loop;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_roles r on r.oid=p.proowner where p.proname like 'leaderboard_%' and r.rolname='service_role') then raise exception 'service_role owns Leaderboard function'; end if;
  if exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace join pg_roles r on r.oid=c.relowner where n.nspname='public' and c.relname like 'leaderboard_%' and r.rolname='service_role') then raise exception 'service_role owns Leaderboard relation'; end if;
  if (select (select count(*) from public.leaderboard_competitions)+(select count(*) from public.leaderboard_participants)+(select count(*) from public.leaderboard_scoring_events)+(select count(*) from public.leaderboard_point_transactions)+(select count(*) from public.leaderboard_audit_events)) <> 0 then raise exception 'Leaderboard tables must be empty before staging smoke'; end if;
end $$;
rollback;`;
}
