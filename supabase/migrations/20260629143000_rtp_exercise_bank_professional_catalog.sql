-- RTP Exercise Bank professional catalog foundation.
-- Exercise knowledge remains club-neutral and player-independent. Player-specific
-- programs stay in Medical Plans / RTP cases and reference these catalog records.

alter table public.rtp_library_exercises
  add column if not exists body_regions text[] not null default '{}',
  add column if not exists symptom_tags text[] not null default '{}',
  add column if not exists mechanism_tags text[] not null default '{}',
  add column if not exists position_demands text[] not null default '{}',
  add column if not exists clinical_tags text[] not null default '{}',
  add column if not exists setup text not null default '',
  add column if not exists execution text not null default '',
  add column if not exists coaching_cues text[] not null default '{}',
  add column if not exists quality_checks text[] not null default '{}',
  add column if not exists common_errors text[] not null default '{}',
  add column if not exists program_builder jsonb not null default '{}'::jsonb,
  add column if not exists media_status text not null default 'missing'
    check (media_status in ('missing', 'placeholder', 'uploaded', 'external')),
  add column if not exists thumbnail_storage_path text not null default '',
  add column if not exists thumbnail_url text not null default '',
  add column if not exists diagram_key text not null default '',
  add column if not exists primary_image_storage_path text not null default '',
  add column if not exists primary_image_url text not null default '',
  add column if not exists primary_video_storage_path text not null default '',
  add column if not exists primary_video_url text not null default '';

create table if not exists public.rtp_library_exercise_media (
  id uuid primary key default gen_random_uuid(),
  exercise_id text not null references public.rtp_library_exercises(id) on delete cascade,
  media_type text not null check (media_type in ('thumbnail', 'image', 'video', 'diagram')),
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  title text not null default '',
  alt_text text not null default '',
  storage_bucket text not null default '',
  storage_path text not null default '',
  external_url text not null default '',
  poster_storage_path text not null default '',
  poster_url text not null default '',
  diagram_key text not null default '',
  mime_type text not null default '',
  duration_seconds integer check (duration_seconds is null or duration_seconds >= 0),
  width integer check (width is null or width >= 0),
  height integer check (height is null or height >= 0),
  metadata jsonb not null default '{}'::jsonb,
  sort_order integer not null default 1000,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rtp_exercise_media_has_reference check (
    storage_path <> '' or external_url <> '' or diagram_key <> '' or media_type = 'thumbnail'
  )
);

create index if not exists rtp_library_exercises_body_regions_gin_idx
on public.rtp_library_exercises using gin (body_regions);

create index if not exists rtp_library_exercises_mechanism_tags_gin_idx
on public.rtp_library_exercises using gin (mechanism_tags);

create index if not exists rtp_library_exercises_position_demands_gin_idx
on public.rtp_library_exercises using gin (position_demands);

create index if not exists rtp_library_exercises_clinical_tags_gin_idx
on public.rtp_library_exercises using gin (clinical_tags);

create index if not exists rtp_library_exercises_program_builder_gin_idx
on public.rtp_library_exercises using gin (program_builder jsonb_path_ops);

create index if not exists rtp_library_exercises_search_gin_idx
on public.rtp_library_exercises using gin (
  to_tsvector(
    'simple'::regconfig,
    coalesce(name, '') || ' ' ||
    coalesce(family, '') || ' ' ||
    coalesce(intent, '') || ' ' ||
    coalesce(evidence_summary, '') || ' ' ||
    coalesce(consensus_note, '') || ' ' ||
    coalesce(setup, '') || ' ' ||
    coalesce(execution, '')
  )
);

create index if not exists rtp_library_exercise_media_exercise_sort_idx
on public.rtp_library_exercise_media (exercise_id, status, sort_order, media_type);

create index if not exists rtp_library_exercise_media_type_idx
on public.rtp_library_exercise_media (media_type, status);

drop trigger if exists rtp_library_exercise_media_touch_updated_at on public.rtp_library_exercise_media;
create trigger rtp_library_exercise_media_touch_updated_at
before update on public.rtp_library_exercise_media
for each row execute function public.rtp_touch_updated_at();

alter table public.rtp_library_exercise_media enable row level security;

revoke all on public.rtp_library_exercise_media from anon, authenticated;
grant select on public.rtp_library_exercise_media to authenticated;

drop policy if exists "rtp library exercise media is visible to medical and performance staff"
on public.rtp_library_exercise_media;

create policy "rtp library exercise media is visible to medical and performance staff"
on public.rtp_library_exercise_media
for select
to authenticated
using (
  status = 'published'
  and app_private.can_read_rtp_library()
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'footballscience-rtp-exercise-media',
  'footballscience-rtp-exercise-media',
  false,
  524288000,
  array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
