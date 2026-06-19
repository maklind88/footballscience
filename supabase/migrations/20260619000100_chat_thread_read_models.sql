-- Durable chat read model for low-request thread summaries.
-- Runtime reads should fetch prebuilt thread summary rows instead of rebuilding
-- the same last-message attachment/reaction shape for every user refresh.

create schema if not exists private;
revoke all on schema private from anon, authenticated;

create table if not exists public.chat_thread_read_models (
  thread_id uuid primary key references public.chat_threads(id) on delete cascade,
  organization_id uuid not null references public.chat_organizations(id) on delete cascade,
  team_id uuid references public.chat_teams(id) on delete cascade,
  thread_type text not null,
  last_message_id uuid,
  last_message_at timestamptz,
  message_count integer not null default 0 check (message_count >= 0),
  participant_count integer not null default 0 check (participant_count >= 0),
  last_message jsonb not null default '{}'::jsonb,
  last_message_reactions jsonb not null default '[]'::jsonb,
  last_message_attachments jsonb not null default '[]'::jsonb,
  refreshed_at timestamptz not null default now()
);

create index if not exists chat_thread_read_models_org_team_activity_idx
  on public.chat_thread_read_models (organization_id, team_id, last_message_at desc nulls last, thread_id);

create index if not exists chat_thread_read_models_org_activity_idx
  on public.chat_thread_read_models (organization_id, last_message_at desc nulls last, thread_id);

alter table public.chat_thread_read_models enable row level security;

drop policy if exists "chat thread read models are readable by thread members" on public.chat_thread_read_models;
create policy "chat thread read models are readable by thread members"
on public.chat_thread_read_models
for select
to authenticated
using (app_private.can_access_chat_thread(thread_id));

revoke all on public.chat_thread_read_models from anon, authenticated;
grant select on public.chat_thread_read_models to authenticated;

create or replace function private.refresh_chat_thread_read_model(target_thread_id uuid)
returns void
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  thread_row public.chat_threads%rowtype;
  latest_message public.chat_messages%rowtype;
  latest_message_json jsonb := '{}'::jsonb;
  reaction_rows jsonb := '[]'::jsonb;
  attachment_rows jsonb := '[]'::jsonb;
  visible_message_count integer := 0;
  active_participant_count integer := 0;
begin
  if target_thread_id is null then
    return;
  end if;

  select *
    into thread_row
    from public.chat_threads
   where id = target_thread_id;

  if not found then
    return;
  end if;

  select *
    into latest_message
    from public.chat_messages as message
   where message.thread_id = target_thread_id
     and message.deleted_at is null
   order by message.created_at desc, message.id desc
   limit 1;

  select count(*)::integer
    into visible_message_count
    from public.chat_messages as message
   where message.thread_id = target_thread_id
     and message.deleted_at is null;

  select count(*)::integer
    into active_participant_count
    from public.chat_thread_participants as participant
   where participant.thread_id = target_thread_id
     and participant.left_at is null;

  if latest_message.id is not null then
    latest_message_json := to_jsonb(latest_message);

    select coalesce(jsonb_agg(to_jsonb(reaction) order by reaction.created_at), '[]'::jsonb)
      into reaction_rows
      from public.chat_reactions as reaction
     where reaction.message_id = latest_message.id;

    select coalesce(jsonb_agg(to_jsonb(attachment) order by attachment.created_at), '[]'::jsonb)
      into attachment_rows
      from public.chat_attachments as attachment
     where attachment.message_id = latest_message.id
       and attachment.status in ('pending', 'ready');
  end if;

  insert into public.chat_thread_read_models (
    thread_id,
    organization_id,
    team_id,
    thread_type,
    last_message_id,
    last_message_at,
    message_count,
    participant_count,
    last_message,
    last_message_reactions,
    last_message_attachments,
    refreshed_at
  ) values (
    thread_row.id,
    thread_row.organization_id,
    thread_row.team_id,
    thread_row.type,
    latest_message.id,
    latest_message.created_at,
    visible_message_count,
    active_participant_count,
    latest_message_json,
    reaction_rows,
    attachment_rows,
    now()
  )
  on conflict (thread_id) do update set
    organization_id = excluded.organization_id,
    team_id = excluded.team_id,
    thread_type = excluded.thread_type,
    last_message_id = excluded.last_message_id,
    last_message_at = excluded.last_message_at,
    message_count = excluded.message_count,
    participant_count = excluded.participant_count,
    last_message = excluded.last_message,
    last_message_reactions = excluded.last_message_reactions,
    last_message_attachments = excluded.last_message_attachments,
    refreshed_at = excluded.refreshed_at;
end;
$$;

revoke all on function private.refresh_chat_thread_read_model(uuid) from public;

create or replace function private.refresh_chat_thread_read_model_for_thread()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  perform private.refresh_chat_thread_read_model(coalesce(new.id, old.id));
  return coalesce(new, old);
end;
$$;

create or replace function private.refresh_chat_thread_read_model_for_message()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  perform private.refresh_chat_thread_read_model(coalesce(new.thread_id, old.thread_id));
  if tg_op = 'UPDATE' and old.thread_id is distinct from new.thread_id then
    perform private.refresh_chat_thread_read_model(old.thread_id);
  end if;
  return coalesce(new, old);
end;
$$;

create or replace function private.refresh_chat_thread_read_model_for_message_child()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  target_message_id uuid;
  target_thread_id uuid;
begin
  target_message_id := coalesce(new.message_id, old.message_id);

  select message.thread_id
    into target_thread_id
    from public.chat_messages as message
   where message.id = target_message_id;

  perform private.refresh_chat_thread_read_model(target_thread_id);
  return coalesce(new, old);
end;
$$;

create or replace function private.refresh_chat_thread_read_model_for_participant()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  perform private.refresh_chat_thread_read_model(coalesce(new.thread_id, old.thread_id));
  if tg_op = 'UPDATE' and old.thread_id is distinct from new.thread_id then
    perform private.refresh_chat_thread_read_model(old.thread_id);
  end if;
  return coalesce(new, old);
end;
$$;

revoke all on function private.refresh_chat_thread_read_model_for_thread() from public;
revoke all on function private.refresh_chat_thread_read_model_for_message() from public;
revoke all on function private.refresh_chat_thread_read_model_for_message_child() from public;
revoke all on function private.refresh_chat_thread_read_model_for_participant() from public;

drop trigger if exists chat_threads_refresh_read_model_write on public.chat_threads;
create trigger chat_threads_refresh_read_model_write
  after insert or update of organization_id, team_id, type, archived_at, last_message_id, last_message_at, message_count
  on public.chat_threads
  for each row
  execute function private.refresh_chat_thread_read_model_for_thread();

drop trigger if exists chat_messages_refresh_read_model_write on public.chat_messages;
create trigger chat_messages_refresh_read_model_write
  after insert or update of thread_id, body, priority, pinned_at, pinned_by, edited_at, deleted_at, created_at, updated_at, metadata or delete
  on public.chat_messages
  for each row
  execute function private.refresh_chat_thread_read_model_for_message();

drop trigger if exists chat_reactions_refresh_read_model_write on public.chat_reactions;
create trigger chat_reactions_refresh_read_model_write
  after insert or update or delete
  on public.chat_reactions
  for each row
  execute function private.refresh_chat_thread_read_model_for_message_child();

drop trigger if exists chat_attachments_refresh_read_model_write on public.chat_attachments;
create trigger chat_attachments_refresh_read_model_write
  after insert or update of message_id, status, storage_bucket, storage_path, mime_type, byte_size, metadata or delete
  on public.chat_attachments
  for each row
  execute function private.refresh_chat_thread_read_model_for_message_child();

drop trigger if exists chat_thread_participants_refresh_read_model_write on public.chat_thread_participants;
create trigger chat_thread_participants_refresh_read_model_write
  after insert or update of thread_id, left_at, participant_role, notification_level or delete
  on public.chat_thread_participants
  for each row
  execute function private.refresh_chat_thread_read_model_for_participant();

do $$
declare
  thread_record record;
begin
  for thread_record in select id from public.chat_threads loop
    perform private.refresh_chat_thread_read_model(thread_record.id);
  end loop;
end;
$$;
