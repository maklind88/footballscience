-- Private Platform Identity migration command helpers: profiles and access.

create or replace function app_private.platform_identity_profile_scope_allowed(
  p_organization_id uuid,
  p_club_id uuid,
  p_team_id uuid
)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select (
    (p_organization_id is not null or (p_club_id is null and p_team_id is null))
    and (
      p_organization_id is null
      or exists (
        select 1
          from public.platform_organizations organization
         where organization.id = p_organization_id
           and organization.deleted_at is null
           and organization.status <> 'archived'
      )
    )
    and (
      p_club_id is null
      or exists (
        select 1
          from public.platform_clubs club
         where club.id = p_club_id
           and club.organization_id = p_organization_id
           and club.deleted_at is null
           and club.status <> 'archived'
      )
    )
    and (
      p_team_id is null
      or exists (
        select 1
          from public.platform_teams team
         where team.id = p_team_id
           and team.organization_id = p_organization_id
           and (p_club_id is null or team.club_id = p_club_id)
           and team.deleted_at is null
           and team.status <> 'archived'
      )
    )
  );
$$;

create or replace function app_private.platform_identity_membership_scope_allowed(
  p_organization_id uuid,
  p_club_id uuid,
  p_team_id uuid,
  p_scope text
)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1
      from public.platform_organizations organization
     where organization.id = p_organization_id
       and organization.deleted_at is null
       and organization.status <> 'archived'
  ) and case p_scope
    when 'organization' then p_club_id is null and p_team_id is null
    when 'club' then p_team_id is null and exists (
      select 1
        from public.platform_clubs club
       where club.id = p_club_id
         and club.organization_id = p_organization_id
         and club.deleted_at is null
         and club.status <> 'archived'
    )
    when 'team' then exists (
      select 1
        from public.platform_teams team
       where team.id = p_team_id
         and team.organization_id = p_organization_id
         and (p_club_id is null or team.club_id = p_club_id)
         and team.deleted_at is null
         and team.status <> 'archived'
    )
    else false
  end;
$$;

create or replace function app_private.platform_identity_apply_profile_command(
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
  before_row public.platform_user_profiles%rowtype;
  proposed_row public.platform_user_profiles%rowtype;
  after_row public.platform_user_profiles%rowtype;
begin
  perform app_private.platform_identity_validate_command(
    p_command,
    'platform_user_profiles',
    'user_id',
    p_operation,
    array[
      'user_id', 'primary_organization_id', 'primary_club_id',
      'primary_team_id', 'display_name', 'first_name', 'last_name', 'email',
      'title', 'department', 'avatar_url', 'status', 'metadata'
    ],
    array[
      'primary_organization_id', 'primary_club_id', 'primary_team_id',
      'display_name', 'first_name', 'last_name', 'email', 'title',
      'department', 'avatar_url', 'status', 'metadata', 'updated_by',
      'deleted_by', 'deleted_at', 'delete_reason'
    ]
  );
  if action_name = 'create' then
    select * into proposed_row
      from jsonb_populate_record(
        null::public.platform_user_profiles,
        p_command -> 'record'
      );
    perform app_private.platform_identity_assert_owned_row(
      'restore',
      proposed_row.metadata
    );
  else
    select * into before_row
      from public.platform_user_profiles profile
     where profile.user_id = key_id
     for update;
    if not found or before_row.row_version <> expected_version then
      raise exception 'Platform Identity profile revision changed.'
        using errcode = '40001';
    end if;
    perform app_private.platform_identity_assert_owned_row(
      action_name,
      before_row.metadata
    );
    select * into proposed_row
      from jsonb_populate_record(before_row, p_command -> 'patch');
  end if;

  if not app_private.platform_identity_profile_scope_allowed(
    proposed_row.primary_organization_id,
    proposed_row.primary_club_id,
    proposed_row.primary_team_id
  ) then
    raise exception 'Platform Identity profile tenant scope is invalid.'
      using errcode = '23514';
  end if;

  if action_name = 'create' then
    insert into public.platform_user_profiles (
      user_id, primary_organization_id, primary_club_id, primary_team_id,
      display_name, first_name, last_name, email, title, department,
      avatar_url, status, metadata, created_by, updated_by
    ) values (
      proposed_row.user_id, proposed_row.primary_organization_id,
      proposed_row.primary_club_id, proposed_row.primary_team_id,
      proposed_row.display_name, proposed_row.first_name,
      proposed_row.last_name, proposed_row.email, proposed_row.title,
      proposed_row.department, proposed_row.avatar_url, proposed_row.status,
      proposed_row.metadata, p_actor_id, p_actor_id
    ) returning * into after_row;
  else
    update public.platform_user_profiles profile
       set primary_organization_id = proposed_row.primary_organization_id,
           primary_club_id = proposed_row.primary_club_id,
           primary_team_id = proposed_row.primary_team_id,
           display_name = proposed_row.display_name,
           first_name = proposed_row.first_name,
           last_name = proposed_row.last_name,
           email = proposed_row.email,
           title = proposed_row.title,
           department = proposed_row.department,
           avatar_url = proposed_row.avatar_url,
           status = proposed_row.status,
           metadata = proposed_row.metadata,
           updated_by = p_actor_id,
           deleted_by = proposed_row.deleted_by,
           deleted_at = proposed_row.deleted_at,
           delete_reason = proposed_row.delete_reason
     where profile.user_id = key_id
       and profile.row_version = expected_version
    returning * into after_row;
    if not found then
      raise exception 'Platform Identity profile write lost its revision.'
        using errcode = '40001';
    end if;
  end if;
  return jsonb_build_object(
    'before', case when action_name = 'create' then null else to_jsonb(before_row) end,
    'after', to_jsonb(after_row)
  );
end;
$$;

create or replace function app_private.platform_identity_apply_membership_command(
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
  before_row public.platform_memberships%rowtype;
  proposed_row public.platform_memberships%rowtype;
  after_row public.platform_memberships%rowtype;
begin
  perform app_private.platform_identity_validate_command(
    p_command,
    'platform_memberships',
    'id',
    p_operation,
    array[
      'id', 'organization_id', 'club_id', 'team_id', 'user_id', 'role',
      'scope', 'status', 'relationship', 'invited_by', 'accepted_at',
      'metadata'
    ],
    array[
      'role', 'scope', 'status', 'relationship', 'invited_by', 'accepted_at',
      'metadata', 'updated_by', 'deleted_by', 'deleted_at', 'delete_reason'
    ]
  );
  if action_name = 'create' then
    select * into proposed_row
      from jsonb_populate_record(
        null::public.platform_memberships,
        p_command -> 'record'
      );
    perform app_private.platform_identity_assert_owned_row(
      'restore',
      proposed_row.metadata
    );
  else
    select * into before_row
      from public.platform_memberships membership
     where membership.id = key_id
     for update;
    if not found or before_row.row_version <> expected_version then
      raise exception 'Platform Identity membership revision changed.'
        using errcode = '40001';
    end if;
    perform app_private.platform_identity_assert_owned_row(
      action_name,
      before_row.metadata
    );
    select * into proposed_row
      from jsonb_populate_record(before_row, p_command -> 'patch');
  end if;

  if not app_private.platform_identity_membership_scope_allowed(
    proposed_row.organization_id,
    proposed_row.club_id,
    proposed_row.team_id,
    proposed_row.scope
  ) then
    raise exception 'Platform Identity membership tenant scope is invalid.'
      using errcode = '23514';
  end if;

  if action_name = 'create' then
    insert into public.platform_memberships (
      id, organization_id, club_id, team_id, user_id, role, scope, status,
      relationship, invited_by, accepted_at, metadata, created_by, updated_by
    ) values (
      proposed_row.id, proposed_row.organization_id, proposed_row.club_id,
      proposed_row.team_id, proposed_row.user_id, proposed_row.role,
      proposed_row.scope, proposed_row.status, proposed_row.relationship,
      proposed_row.invited_by, proposed_row.accepted_at,
      proposed_row.metadata, p_actor_id, p_actor_id
    ) returning * into after_row;
  else
    update public.platform_memberships membership
       set role = proposed_row.role,
           scope = proposed_row.scope,
           status = proposed_row.status,
           relationship = proposed_row.relationship,
           invited_by = proposed_row.invited_by,
           accepted_at = proposed_row.accepted_at,
           metadata = proposed_row.metadata,
           updated_by = p_actor_id,
           deleted_by = proposed_row.deleted_by,
           deleted_at = proposed_row.deleted_at,
           delete_reason = proposed_row.delete_reason
     where membership.id = key_id
       and membership.row_version = expected_version
    returning * into after_row;
    if not found then
      raise exception 'Platform Identity membership write lost its revision.'
        using errcode = '40001';
    end if;
  end if;
  return jsonb_build_object(
    'before', case when action_name = 'create' then null else to_jsonb(before_row) end,
    'after', to_jsonb(after_row)
  );
end;
$$;

create or replace function app_private.platform_identity_apply_tenant_link_command(
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
  before_row public.platform_tenant_links%rowtype;
  proposed_row public.platform_tenant_links%rowtype;
  after_row public.platform_tenant_links%rowtype;
begin
  perform app_private.platform_identity_validate_command(
    p_command,
    'platform_tenant_links',
    'id',
    p_operation,
    array[
      'id', 'organization_id', 'club_id', 'team_id', 'module_id',
      'module_table', 'module_record_id', 'scope', 'status', 'metadata'
    ],
    array['status', 'metadata']
  );
  if action_name = 'create' then
    select * into proposed_row
      from jsonb_populate_record(
        null::public.platform_tenant_links,
        p_command -> 'record'
      );
    perform app_private.platform_identity_assert_owned_row(
      'restore',
      proposed_row.metadata
    );
  else
    select * into before_row
      from public.platform_tenant_links tenant_link
     where tenant_link.id = key_id
     for update;
    if not found or before_row.row_version <> expected_version then
      raise exception 'Platform Identity tenant-link revision changed.'
        using errcode = '40001';
    end if;
    perform app_private.platform_identity_assert_owned_row(
      action_name,
      before_row.metadata
    );
    select * into proposed_row
      from jsonb_populate_record(before_row, p_command -> 'patch');
  end if;

  if not app_private.platform_identity_membership_scope_allowed(
    proposed_row.organization_id,
    proposed_row.club_id,
    proposed_row.team_id,
    proposed_row.scope
  ) then
    raise exception 'Platform Identity tenant-link scope is invalid.'
      using errcode = '23514';
  end if;

  if action_name = 'create' then
    insert into public.platform_tenant_links (
      id, organization_id, club_id, team_id, module_id, module_table,
      module_record_id, scope, status, metadata, created_by, updated_by
    ) values (
      proposed_row.id, proposed_row.organization_id, proposed_row.club_id,
      proposed_row.team_id, proposed_row.module_id, proposed_row.module_table,
      proposed_row.module_record_id, proposed_row.scope, proposed_row.status,
      proposed_row.metadata, p_actor_id, p_actor_id
    ) returning * into after_row;
  else
    update public.platform_tenant_links tenant_link
       set status = proposed_row.status,
           metadata = proposed_row.metadata,
           updated_by = p_actor_id
     where tenant_link.id = key_id
       and tenant_link.row_version = expected_version
    returning * into after_row;
    if not found then
      raise exception 'Platform Identity tenant-link write lost its revision.'
        using errcode = '40001';
    end if;
  end if;
  return jsonb_build_object(
    'before', case when action_name = 'create' then null else to_jsonb(before_row) end,
    'after', to_jsonb(after_row)
  );
end;
$$;

revoke all on function app_private.platform_identity_profile_scope_allowed(
  uuid, uuid, uuid
) from public, anon, authenticated;
revoke all on function app_private.platform_identity_membership_scope_allowed(
  uuid, uuid, uuid, text
) from public, anon, authenticated;
revoke all on function app_private.platform_identity_apply_profile_command(
  jsonb, uuid, text
) from public, anon, authenticated;
revoke all on function app_private.platform_identity_apply_membership_command(
  jsonb, uuid, text
) from public, anon, authenticated;
revoke all on function app_private.platform_identity_apply_tenant_link_command(
  jsonb, uuid, text
) from public, anon, authenticated;

grant execute on function app_private.platform_identity_profile_scope_allowed(
  uuid, uuid, uuid
) to service_role;
grant execute on function app_private.platform_identity_membership_scope_allowed(
  uuid, uuid, uuid, text
) to service_role;
grant execute on function app_private.platform_identity_apply_profile_command(
  jsonb, uuid, text
) to service_role;
grant execute on function app_private.platform_identity_apply_membership_command(
  jsonb, uuid, text
) to service_role;
grant execute on function app_private.platform_identity_apply_tenant_link_command(
  jsonb, uuid, text
) to service_role;
