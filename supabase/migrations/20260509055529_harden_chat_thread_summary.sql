create schema if not exists private;
revoke all on schema private from anon, authenticated;

create index if not exists chat_messages_thread_visible_created_idx
  on public.chat_messages (thread_id, created_at desc, id desc)
  where deleted_at is null;

create or replace function private.refresh_chat_thread_summary_for_message()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  target_thread_id uuid;
begin
  target_thread_id := coalesce(new.thread_id, old.thread_id);

  if target_thread_id is null then
    return coalesce(new, old);
  end if;

  update public.chat_threads
     set last_message_id = (
           select message.id
             from public.chat_messages as message
            where message.thread_id = target_thread_id
              and message.deleted_at is null
            order by message.created_at desc, message.id desc
            limit 1
         ),
         last_message_at = (
           select message.created_at
             from public.chat_messages as message
            where message.thread_id = target_thread_id
              and message.deleted_at is null
            order by message.created_at desc, message.id desc
            limit 1
         ),
         message_count = (
           select count(*)::integer
             from public.chat_messages as message
            where message.thread_id = target_thread_id
              and message.deleted_at is null
         ),
         updated_at = now()
   where id = target_thread_id;

  return coalesce(new, old);
end;
$$;

revoke all on function private.refresh_chat_thread_summary_for_message() from public;

drop trigger if exists chat_messages_refresh_thread_summary_insert on public.chat_messages;
create trigger chat_messages_refresh_thread_summary_insert
  after insert on public.chat_messages
  for each row
  execute function private.refresh_chat_thread_summary_for_message();

drop trigger if exists chat_messages_refresh_thread_summary_update on public.chat_messages;
create trigger chat_messages_refresh_thread_summary_update
  after update of deleted_at, thread_id, created_at on public.chat_messages
  for each row
  when (
    old.deleted_at is distinct from new.deleted_at
    or old.thread_id is distinct from new.thread_id
    or old.created_at is distinct from new.created_at
  )
  execute function private.refresh_chat_thread_summary_for_message();

drop trigger if exists chat_messages_refresh_thread_summary_delete on public.chat_messages;
create trigger chat_messages_refresh_thread_summary_delete
  after delete on public.chat_messages
  for each row
  execute function private.refresh_chat_thread_summary_for_message();

with visible_summary as (
  select thread_id, count(*)::integer as message_count
    from public.chat_messages
   where deleted_at is null
   group by thread_id
), latest_visible as (
  select distinct on (thread_id)
         thread_id,
         id,
         created_at
    from public.chat_messages
   where deleted_at is null
   order by thread_id, created_at desc, id desc
)
update public.chat_threads as thread
   set last_message_id = latest_visible.id,
       last_message_at = latest_visible.created_at,
       message_count = visible_summary.message_count,
       updated_at = now()
  from visible_summary
  join latest_visible using (thread_id)
 where thread.id = visible_summary.thread_id;

update public.chat_threads as thread
   set last_message_id = null,
       last_message_at = null,
       message_count = 0,
       updated_at = now()
 where not exists (
   select 1
     from public.chat_messages as message
    where message.thread_id = thread.id
      and message.deleted_at is null
 );
