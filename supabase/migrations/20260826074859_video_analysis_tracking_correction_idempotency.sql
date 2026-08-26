-- Make tracking correction retries idempotent without exposing dense samples.

alter table public.video_track_corrections
  add column if not exists operation_id text;

alter table public.video_track_corrections
  drop constraint if exists video_track_corrections_operation_id_format;
alter table public.video_track_corrections
  add constraint video_track_corrections_operation_id_format
  check (
    operation_id is null
    or operation_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,179}$'
  ) not valid;
alter table public.video_track_corrections
  validate constraint video_track_corrections_operation_id_format;

alter table public.video_track_corrections
  drop constraint if exists video_track_corrections_correction_type_check;
alter table public.video_track_corrections
  add constraint video_track_corrections_correction_type_check
  check (correction_type in ('position','identity','occlusion','split','merge','identity-swap'));

create unique index if not exists video_track_corrections_operation_id_uidx
  on public.video_track_corrections (organization_id, team_id, operation_id)
  where operation_id is not null;

comment on column public.video_track_corrections.operation_id is
  'Client-generated idempotency key scoped by organization and team.';
