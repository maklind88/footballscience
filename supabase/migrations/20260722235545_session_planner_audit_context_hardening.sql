-- Preserve authenticated actor and request attribution when Session Planner
-- writes eventually move behind a server-owned service-role transaction.
-- The domain write path is still disabled; this only hardens audit capture.

create or replace function app_private.session_planner_current_actor()
returns uuid
language plpgsql
stable
set search_path = public, pg_temp
as $$
begin
  return coalesce(
    (select auth.uid()),
    nullif(current_setting('app.session_planner_actor_id', true), '')::uuid
  );
exception when invalid_text_representation then
  return (select auth.uid());
end;
$$;

create or replace function app_private.session_planner_touch_record()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE'
    and (to_jsonb(new) - 'updated_at' - 'updated_by' - 'row_version')
      is distinct from
      (to_jsonb(old) - 'updated_at' - 'updated_by' - 'row_version') then
    new.row_version = old.row_version + 1;
    new.updated_at = clock_timestamp();
    new.updated_by = coalesce(app_private.session_planner_current_actor(), new.updated_by);
  else
    new.updated_at = old.updated_at;
    new.updated_by = old.updated_by;
  end if;
  return new;
end;
$$;

create or replace function app_private.session_planner_log_record_version()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  old_record jsonb;
  new_record jsonb := to_jsonb(new);
  changed text[];
  next_action text;
  request_headers jsonb := '{}'::jsonb;
  audit_actor_id uuid;
  audit_request_id text;
begin
  if tg_op = 'INSERT' then
    select coalesce(array_agg(key order by key), '{}'::text[])
      into changed from jsonb_object_keys(new_record) as fields(key);
    next_action := 'insert';
    old_record := null;
  else
    old_record := to_jsonb(old);
    select coalesce(array_agg(key order by key), '{}'::text[])
      into changed
      from jsonb_each(new_record) as values_next(key, value)
     where (old_record -> key) is distinct from value
       and key not in ('updated_at', 'updated_by', 'row_version');

    if coalesce(array_length(changed, 1), 0) = 0 then
      return new;
    end if;

    next_action := case
      when old.archived_at is null and new.archived_at is not null then 'archive'
      when old.archived_at is not null and new.archived_at is null then 'restore'
      else 'update'
    end;
  end if;

  begin
    request_headers := coalesce(
      nullif(current_setting('request.headers', true), '')::jsonb,
      '{}'::jsonb
    );
  exception when others then
    request_headers := '{}'::jsonb;
  end;

  audit_actor_id := coalesce(
    app_private.session_planner_current_actor(),
    case when next_action = 'archive' then new.archived_by else null end,
    new.updated_by,
    new.created_by
  );
  audit_request_id := nullif(left(coalesce(
    nullif(current_setting('app.session_planner_request_id', true), ''),
    request_headers ->> 'x-request-id',
    request_headers ->> 'x-correlation-id',
    ''
  ), 180), '');

  insert into public.session_planner_record_versions (
    organization_id,
    team_id,
    record_type,
    record_id,
    row_version,
    action,
    changed_fields,
    before_record,
    after_record,
    actor_id,
    request_id
  ) values (
    new.organization_id,
    new.team_id,
    case when tg_table_name = 'session_planner_sessions' then 'session' else 'block' end,
    new.id,
    new.row_version,
    next_action,
    changed,
    old_record,
    new_record,
    audit_actor_id,
    audit_request_id
  );
  return new;
end;
$$;

revoke all on function app_private.session_planner_current_actor() from public, anon, authenticated;
revoke all on function app_private.session_planner_touch_record() from public, anon, authenticated;
revoke all on function app_private.session_planner_log_record_version() from public, anon, authenticated;

grant usage on schema app_private to service_role;
grant execute on function app_private.session_planner_current_actor() to service_role;
grant execute on function app_private.session_planner_validate_scope() to service_role;
grant execute on function app_private.session_planner_touch_record() to service_role;
grant execute on function app_private.session_planner_log_record_version() to service_role;
grant execute on function app_private.session_planner_prevent_hard_delete() to service_role;
