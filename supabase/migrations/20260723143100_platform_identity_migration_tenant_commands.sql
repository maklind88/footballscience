-- Private Platform Identity migration command helpers: tenant roots.

create or replace function app_private.platform_identity_validate_command(
  p_command jsonb,
  p_expected_table text,
  p_expected_key_column text,
  p_operation text,
  p_create_fields text[],
  p_patch_fields text[]
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  action_name text := p_command ->> 'action';
  record_value jsonb := p_command -> 'record';
  patch_value jsonb := p_command -> 'patch';
  expected_version_text text := p_command ->> 'expectedRowVersion';
begin
  if jsonb_typeof(p_command) <> 'object'
    or p_command ->> 'table' <> p_expected_table
    or p_command ->> 'keyColumn' <> p_expected_key_column
    or coalesce(p_command ->> 'key', '') !~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception 'Platform Identity migration command identity is invalid.'
      using errcode = 'P0001';
  end if;
  if (p_operation = 'backfill' and action_name not in ('create', 'update', 'restore'))
    or (
      p_operation = 'rollback'
      and action_name not in ('restore-existing', 'archive-created')
    ) then
    raise exception 'Platform Identity migration action does not match operation.'
      using errcode = 'P0001';
  end if;
  if action_name = 'create' then
    if expected_version_text is not null
      or jsonb_typeof(record_value) <> 'object'
      or record_value ->> p_expected_key_column <> p_command ->> 'key'
      or exists (
        select 1
          from jsonb_object_keys(record_value) fields(field)
         where not (fields.field = any(p_create_fields))
      ) then
      raise exception 'Platform Identity create command is invalid.'
        using errcode = 'P0001';
    end if;
  elsif expected_version_text is null
    or expected_version_text !~ '^[1-9][0-9]*$'
    or jsonb_typeof(patch_value) <> 'object'
    or patch_value = '{}'::jsonb
    or exists (
      select 1
        from jsonb_object_keys(patch_value) fields(field)
       where not (fields.field = any(p_patch_fields))
    ) then
    raise exception 'Platform Identity revision command is invalid.'
      using errcode = 'P0001';
  end if;
end;
$$;

create or replace function app_private.platform_identity_assert_owned_row(
  p_action text,
  p_metadata jsonb
)
returns void
language plpgsql
immutable
security invoker
set search_path = ''
as $$
begin
  if p_action in ('restore', 'archive-created')
    and coalesce(p_metadata ->> 'backfillSchema', '') <>
      'footballscience-platform-identity-backfill-v1' then
    raise exception 'Platform Identity migration will not mutate an unowned row.'
      using errcode = '42501';
  end if;
end;
$$;

create or replace function app_private.platform_identity_apply_organization_command(
  p_command jsonb,
  p_actor_id uuid,
  p_operation text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  key_id uuid := (p_command ->> 'key')::uuid;
  action_name text := p_command ->> 'action';
  expected_version integer := nullif(p_command ->> 'expectedRowVersion', '')::integer;
  before_row public.platform_organizations%rowtype;
  proposed_row public.platform_organizations%rowtype;
  after_row public.platform_organizations%rowtype;
begin
  perform app_private.platform_identity_validate_command(
    p_command,
    'platform_organizations',
    'id',
    p_operation,
    array['id', 'slug', 'name', 'status', 'metadata'],
    array[
      'slug', 'name', 'status', 'metadata', 'updated_by',
      'deleted_by', 'deleted_at', 'delete_reason'
    ]
  );
  if action_name = 'create' then
    select * into proposed_row
      from jsonb_populate_record(
        null::public.platform_organizations,
        p_command -> 'record'
      );
    perform app_private.platform_identity_assert_owned_row(
      'restore',
      proposed_row.metadata
    );
    insert into public.platform_organizations (
      id, slug, name, status, metadata, created_by, updated_by
    ) values (
      proposed_row.id, proposed_row.slug, proposed_row.name,
      proposed_row.status, proposed_row.metadata, p_actor_id, p_actor_id
    ) returning * into after_row;
  else
    select * into before_row
      from public.platform_organizations organization
     where organization.id = key_id
     for update;
    if not found or before_row.row_version <> expected_version then
      raise exception 'Platform Identity organization revision changed.'
        using errcode = '40001';
    end if;
    perform app_private.platform_identity_assert_owned_row(
      action_name,
      before_row.metadata
    );
    select * into proposed_row
      from jsonb_populate_record(before_row, p_command -> 'patch');
    update public.platform_organizations organization
       set slug = proposed_row.slug,
           name = proposed_row.name,
           status = proposed_row.status,
           metadata = proposed_row.metadata,
           updated_by = p_actor_id,
           deleted_by = proposed_row.deleted_by,
           deleted_at = proposed_row.deleted_at,
           delete_reason = proposed_row.delete_reason
     where organization.id = key_id
       and organization.row_version = expected_version
    returning * into after_row;
    if not found then
      raise exception 'Platform Identity organization write lost its revision.'
        using errcode = '40001';
    end if;
  end if;
  return jsonb_build_object(
    'before', case when action_name = 'create' then null else to_jsonb(before_row) end,
    'after', to_jsonb(after_row)
  );
end;
$$;

create or replace function app_private.platform_identity_apply_club_command(
  p_command jsonb,
  p_actor_id uuid,
  p_operation text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  key_id uuid := (p_command ->> 'key')::uuid;
  action_name text := p_command ->> 'action';
  expected_version integer := nullif(p_command ->> 'expectedRowVersion', '')::integer;
  before_row public.platform_clubs%rowtype;
  proposed_row public.platform_clubs%rowtype;
  after_row public.platform_clubs%rowtype;
begin
  perform app_private.platform_identity_validate_command(
    p_command,
    'platform_clubs',
    'id',
    p_operation,
    array[
      'id', 'organization_id', 'slug', 'name', 'country_code',
      'status', 'metadata'
    ],
    array[
      'slug', 'name', 'country_code', 'status', 'metadata', 'updated_by',
      'deleted_by', 'deleted_at', 'delete_reason'
    ]
  );
  if action_name = 'create' then
    select * into proposed_row
      from jsonb_populate_record(
        null::public.platform_clubs,
        p_command -> 'record'
      );
    perform app_private.platform_identity_assert_owned_row(
      'restore',
      proposed_row.metadata
    );
    if not exists (
      select 1
        from public.platform_organizations organization
       where organization.id = proposed_row.organization_id
         and organization.deleted_at is null
         and organization.status <> 'archived'
    ) then
      raise exception 'Platform Identity club organization is inactive.'
        using errcode = '23514';
    end if;
    insert into public.platform_clubs (
      id, organization_id, slug, name, country_code, status, metadata,
      created_by, updated_by
    ) values (
      proposed_row.id, proposed_row.organization_id, proposed_row.slug,
      proposed_row.name, proposed_row.country_code, proposed_row.status,
      proposed_row.metadata, p_actor_id, p_actor_id
    ) returning * into after_row;
  else
    select * into before_row
      from public.platform_clubs club
     where club.id = key_id
     for update;
    if not found or before_row.row_version <> expected_version then
      raise exception 'Platform Identity club revision changed.'
        using errcode = '40001';
    end if;
    perform app_private.platform_identity_assert_owned_row(
      action_name,
      before_row.metadata
    );
    select * into proposed_row
      from jsonb_populate_record(before_row, p_command -> 'patch');
    update public.platform_clubs club
       set slug = proposed_row.slug,
           name = proposed_row.name,
           country_code = proposed_row.country_code,
           status = proposed_row.status,
           metadata = proposed_row.metadata,
           updated_by = p_actor_id,
           deleted_by = proposed_row.deleted_by,
           deleted_at = proposed_row.deleted_at,
           delete_reason = proposed_row.delete_reason
     where club.id = key_id
       and club.row_version = expected_version
    returning * into after_row;
    if not found then
      raise exception 'Platform Identity club write lost its revision.'
        using errcode = '40001';
    end if;
  end if;
  return jsonb_build_object(
    'before', case when action_name = 'create' then null else to_jsonb(before_row) end,
    'after', to_jsonb(after_row)
  );
end;
$$;

create or replace function app_private.platform_identity_apply_team_command(
  p_command jsonb,
  p_actor_id uuid,
  p_operation text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  key_id uuid := (p_command ->> 'key')::uuid;
  action_name text := p_command ->> 'action';
  expected_version integer := nullif(p_command ->> 'expectedRowVersion', '')::integer;
  before_row public.platform_teams%rowtype;
  proposed_row public.platform_teams%rowtype;
  after_row public.platform_teams%rowtype;
begin
  perform app_private.platform_identity_validate_command(
    p_command,
    'platform_teams',
    'id',
    p_operation,
    array[
      'id', 'organization_id', 'club_id', 'slug', 'name', 'sport',
      'age_group', 'gender', 'status', 'metadata'
    ],
    array[
      'slug', 'name', 'sport', 'age_group', 'gender', 'status', 'metadata',
      'updated_by', 'deleted_by', 'deleted_at', 'delete_reason'
    ]
  );
  if action_name = 'create' then
    select * into proposed_row
      from jsonb_populate_record(
        null::public.platform_teams,
        p_command -> 'record'
      );
    perform app_private.platform_identity_assert_owned_row(
      'restore',
      proposed_row.metadata
    );
    if not exists (
      select 1
        from public.platform_organizations organization
       where organization.id = proposed_row.organization_id
         and organization.deleted_at is null
         and organization.status <> 'archived'
    ) or (
      proposed_row.club_id is not null
      and not exists (
        select 1
          from public.platform_clubs club
         where club.id = proposed_row.club_id
           and club.organization_id = proposed_row.organization_id
           and club.deleted_at is null
           and club.status <> 'archived'
      )
    ) then
      raise exception 'Platform Identity team tenant scope is invalid.'
        using errcode = '23514';
    end if;
    insert into public.platform_teams (
      id, organization_id, club_id, slug, name, sport, age_group, gender,
      status, metadata, created_by, updated_by
    ) values (
      proposed_row.id, proposed_row.organization_id, proposed_row.club_id,
      proposed_row.slug, proposed_row.name, proposed_row.sport,
      proposed_row.age_group, proposed_row.gender, proposed_row.status,
      proposed_row.metadata, p_actor_id, p_actor_id
    ) returning * into after_row;
  else
    select * into before_row
      from public.platform_teams team
     where team.id = key_id
     for update;
    if not found or before_row.row_version <> expected_version then
      raise exception 'Platform Identity team revision changed.'
        using errcode = '40001';
    end if;
    perform app_private.platform_identity_assert_owned_row(
      action_name,
      before_row.metadata
    );
    select * into proposed_row
      from jsonb_populate_record(before_row, p_command -> 'patch');
    update public.platform_teams team
       set slug = proposed_row.slug,
           name = proposed_row.name,
           sport = proposed_row.sport,
           age_group = proposed_row.age_group,
           gender = proposed_row.gender,
           status = proposed_row.status,
           metadata = proposed_row.metadata,
           updated_by = p_actor_id,
           deleted_by = proposed_row.deleted_by,
           deleted_at = proposed_row.deleted_at,
           delete_reason = proposed_row.delete_reason
     where team.id = key_id
       and team.row_version = expected_version
    returning * into after_row;
    if not found then
      raise exception 'Platform Identity team write lost its revision.'
        using errcode = '40001';
    end if;
  end if;
  return jsonb_build_object(
    'before', case when action_name = 'create' then null else to_jsonb(before_row) end,
    'after', to_jsonb(after_row)
  );
end;
$$;

revoke all on function app_private.platform_identity_validate_command(
  jsonb, text, text, text, text[], text[]
) from public, anon, authenticated;
revoke all on function app_private.platform_identity_assert_owned_row(
  text, jsonb
) from public, anon, authenticated;
revoke all on function app_private.platform_identity_apply_organization_command(
  jsonb, uuid, text
) from public, anon, authenticated;
revoke all on function app_private.platform_identity_apply_club_command(
  jsonb, uuid, text
) from public, anon, authenticated;
revoke all on function app_private.platform_identity_apply_team_command(
  jsonb, uuid, text
) from public, anon, authenticated;

grant execute on function app_private.platform_identity_validate_command(
  jsonb, text, text, text, text[], text[]
) to service_role;
grant execute on function app_private.platform_identity_assert_owned_row(
  text, jsonb
) to service_role;
grant execute on function app_private.platform_identity_apply_organization_command(
  jsonb, uuid, text
) to service_role;
grant execute on function app_private.platform_identity_apply_club_command(
  jsonb, uuid, text
) to service_role;
grant execute on function app_private.platform_identity_apply_team_command(
  jsonb, uuid, text
) to service_role;
