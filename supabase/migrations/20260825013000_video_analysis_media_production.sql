-- FS Player Elite multi-angle and rendered-export metadata.
-- Source media, rendered MP4 files and artifact URLs remain device-local.

create table if not exists public.video_media_angles (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null check (char_length(organization_id) between 1 and 160),
  team_id text not null check (char_length(team_id) between 1 and 160),
  match_id uuid not null references public.video_matches(id) on delete restrict,
  video_id uuid not null references public.video_videos(id) on delete restrict,
  source_id uuid not null references public.video_sources(id) on delete restrict,
  local_video_identifier text not null check (char_length(local_video_identifier) between 8 and 240),
  label text not null check (char_length(label) between 1 and 180),
  angle_role text not null default 'custom' check (angle_role in ('primary','tactical','broadcast','end-zone','bench','custom')),
  sync_offset_ms bigint not null default 0 check (sync_offset_ms between -21600000 and 21600000),
  drift_ppm numeric(10,4) not null default 0 check (drift_ppm between -10000 and 10000),
  duration_ms bigint not null default 0 check (duration_ms >= 0),
  is_primary boolean not null default false,
  is_muted boolean not null default false,
  sync_confidence numeric(5,4) not null default 0 check (sync_confidence between 0 and 1),
  status text not null default 'active' check (status in ('active','needs-local-file','offline','archived')),
  revision integer not null default 1 check (revision > 0),
  created_by text check (created_by is null or char_length(created_by) <= 160),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  unique (team_id, match_id, source_id)
);

create unique index if not exists video_media_angles_one_primary_idx
  on public.video_media_angles (team_id, match_id)
  where is_primary and status <> 'archived';
create index if not exists video_media_angles_match_idx
  on public.video_media_angles (team_id, match_id, is_primary desc, created_at, id)
  where status <> 'archived';

create table if not exists public.video_export_manifests (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null check (char_length(organization_id) between 1 and 160),
  team_id text not null check (char_length(team_id) between 1 and 160),
  match_id uuid not null references public.video_matches(id) on delete restrict,
  video_id uuid not null references public.video_videos(id) on delete restrict,
  source_id uuid not null references public.video_sources(id) on delete restrict,
  angle_id uuid references public.video_media_angles(id) on delete restrict,
  presentation_id uuid references public.video_presentations(id) on delete restrict,
  presentation_item_id uuid references public.video_presentation_items(id) on delete restrict,
  clip_id uuid references public.video_clip_instances(id) on delete restrict,
  title text not null check (char_length(title) between 1 and 180),
  start_ms bigint not null check (start_ms >= 0),
  end_ms bigint not null check (end_ms > start_ms),
  output_preset text not null check (output_preset in ('review-720p','analysis-1080p','master-2160p')),
  manifest_sha256 text not null check (manifest_sha256 ~ '^[a-f0-9]{64}$'),
  output_sha256 text not null check (output_sha256 ~ '^[a-f0-9]{64}$'),
  output_size_bytes bigint not null default 0 check (output_size_bytes >= 0),
  status text not null default 'completed' check (status in ('completed','archived')),
  rendered_by text check (rendered_by is null or char_length(rendered_by) <= 160),
  rendered_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  layer_summary jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists video_export_manifests_match_idx
  on public.video_export_manifests (team_id, match_id, rendered_at desc, id)
  where status = 'completed';

alter table public.video_media_angles enable row level security;
alter table public.video_export_manifests enable row level security;

revoke all on public.video_media_angles from anon, authenticated;
revoke all on public.video_export_manifests from anon, authenticated;
grant select, insert, update, delete on public.video_media_angles to service_role;
grant select, insert, update, delete on public.video_export_manifests to service_role;

drop trigger if exists video_media_angles_touch_updated_at on public.video_media_angles;
create trigger video_media_angles_touch_updated_at before update on public.video_media_angles
  for each row execute function app_private.video_analysis_touch_updated_at();
drop trigger if exists video_media_angles_increment_revision on public.video_media_angles;
create trigger video_media_angles_increment_revision before update on public.video_media_angles
  for each row execute function app_private.video_analysis_increment_tracking_revision();
drop trigger if exists video_media_angles_prevent_hard_delete on public.video_media_angles;
create trigger video_media_angles_prevent_hard_delete before delete on public.video_media_angles
  for each row execute function app_private.video_analysis_prevent_hard_delete();

drop trigger if exists video_export_manifests_prevent_hard_delete on public.video_export_manifests;
create trigger video_export_manifests_prevent_hard_delete before delete on public.video_export_manifests
  for each row execute function app_private.video_analysis_prevent_hard_delete();
