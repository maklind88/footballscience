-- Football Science Chat: private Supabase Storage bucket for chat attachments.
-- Upload access is tied to pending chat_attachments rows and download access is
-- tied to ready attachments in threads the authenticated user can read.

insert into storage.buckets (id, name, public)
values ('footballscience-chat-attachments', 'footballscience-chat-attachments', false)
on conflict (id) do update set public = false;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'storage'
      and table_name = 'buckets'
      and column_name = 'file_size_limit'
  ) then
    update storage.buckets
    set file_size_limit = 52428800
    where id = 'footballscience-chat-attachments';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'storage'
      and table_name = 'buckets'
      and column_name = 'allowed_mime_types'
  ) then
    update storage.buckets
    set allowed_mime_types = array[
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
      'application/pdf',
      'text/plain',
      'text/csv',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    ]
    where id = 'footballscience-chat-attachments';
  end if;
end $$;

create unique index if not exists chat_attachments_storage_object_idx
  on public.chat_attachments (storage_bucket, storage_path)
  where status <> 'deleted';

create index if not exists chat_attachments_uploaded_pending_idx
  on public.chat_attachments (uploaded_by, status, created_at desc)
  where status = 'pending';

drop policy if exists "chat attachment storage objects are readable" on storage.objects;
drop policy if exists "chat attachment storage objects are uploadable" on storage.objects;

create policy "chat attachment storage objects are readable"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'footballscience-chat-attachments'
  and exists (
    select 1
    from public.chat_attachments attachment
    where attachment.storage_bucket = storage.objects.bucket_id
      and attachment.storage_path = storage.objects.name
      and attachment.status = 'ready'
      and app_private.can_access_chat_thread(attachment.thread_id)
  )
);

create policy "chat attachment storage objects are uploadable"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'footballscience-chat-attachments'
  and exists (
    select 1
    from public.chat_attachments attachment
    where attachment.storage_bucket = storage.objects.bucket_id
      and attachment.storage_path = storage.objects.name
      and attachment.status = 'pending'
      and attachment.uploaded_by = (select auth.uid())
      and attachment.byte_size <= 52428800
      and app_private.can_access_chat_thread(attachment.thread_id)
  )
);
