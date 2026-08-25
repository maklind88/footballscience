-- Private, rendered FS Player reviews that can be played without source media.
-- Raw video, signed URLs and local paths are never stored in these tables.

create table if not exists public.video_portable_media_assets (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null check (char_length(organization_id) between 1 and 160),
  team_id text not null check (char_length(team_id) between 1 and 160),
  match_id uuid not null references public.video_matches(id) on delete restrict,
  presentation_id uuid references public.video_presentations(id) on delete restrict,
  clip_id uuid references public.video_clip_instances(id) on delete restrict,
  export_manifest_id uuid,
  owner_id text not null check (char_length(owner_id) between 1 and 160),
  title text not null check (char_length(title) between 1 and 180),
  file_name text not null check (char_length(file_name) between 1 and 180),
  mime_type text not null default 'video/mp4' check (mime_type = 'video/mp4'),
  size_bytes bigint not null check (size_bytes between 1 and 21474836480),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  manifest_sha256 text not null check (manifest_sha256 ~ '^[a-f0-9]{64}$'),
  source_manifest_sha256 text not null check (source_manifest_sha256 ~ '^[a-f0-9]{64}$'),
  storage_bucket text not null check (char_length(storage_bucket) between 1 and 120),
  storage_path text not null check (
    char_length(storage_path) between 1 and 500
    and storage_path !~ '(^|/)\.\.(/|$)'
    and storage_path !~ '[\\]'
  ),
  visibility text not null default 'targets' check (visibility in ('private','targets','team')),
  status text not null default 'uploading' check (status in ('uploading','ready','failed','revoked','archived')),
  upload_expires_at timestamptz not null,
  published_at timestamptz,
  revoked_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  manifest jsonb not null default '{}'::jsonb check (jsonb_typeof(manifest) = 'object'),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  unique (storage_bucket, storage_path)
);

create index if not exists video_portable_media_assets_match_idx
  on public.video_portable_media_assets (team_id, match_id, published_at desc nulls last, created_at desc, id)
  where status = 'ready';
create index if not exists video_portable_media_assets_owner_idx
  on public.video_portable_media_assets (organization_id, team_id, owner_id, created_at desc, id)
  where status in ('uploading','ready');
create unique index if not exists video_portable_media_assets_exact_ready_idx
  on public.video_portable_media_assets (
    organization_id, team_id, owner_id, match_id, sha256, source_manifest_sha256
  ) where status = 'ready';

create table if not exists public.video_portable_media_share_targets (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null check (char_length(organization_id) between 1 and 160),
  team_id text not null check (char_length(team_id) between 1 and 160),
  asset_id uuid not null references public.video_portable_media_assets(id) on delete restrict,
  target_type text not null check (target_type in ('team','role','group','player','user')),
  target_id text not null check (char_length(target_id) between 1 and 160),
  access_level text not null default 'view' check (access_level in ('view','download')),
  status text not null default 'active' check (status in ('active','archived')),
  created_by text not null check (char_length(created_by) between 1 and 160),
  created_at timestamptz not null default now(),
  archived_at timestamptz
);

create unique index if not exists video_portable_media_share_targets_active_idx
  on public.video_portable_media_share_targets (asset_id, target_type, target_id)
  where status = 'active';
create index if not exists video_portable_media_share_targets_lookup_idx
  on public.video_portable_media_share_targets (organization_id, team_id, target_type, target_id, asset_id)
  where status = 'active';

alter table public.video_portable_media_assets enable row level security;
alter table public.video_portable_media_share_targets enable row level security;

revoke all on public.video_portable_media_assets from anon, authenticated;
revoke all on public.video_portable_media_share_targets from anon, authenticated;
grant select, insert, update, delete on public.video_portable_media_assets to service_role;
grant select, insert, update, delete on public.video_portable_media_share_targets to service_role;

drop trigger if exists video_portable_media_assets_touch_updated_at on public.video_portable_media_assets;
create trigger video_portable_media_assets_touch_updated_at before update on public.video_portable_media_assets
  for each row execute function app_private.video_analysis_touch_updated_at();
drop trigger if exists video_portable_media_assets_prevent_hard_delete on public.video_portable_media_assets;
create trigger video_portable_media_assets_prevent_hard_delete before delete on public.video_portable_media_assets
  for each row execute function app_private.video_analysis_prevent_hard_delete();
drop trigger if exists video_portable_media_share_targets_prevent_hard_delete on public.video_portable_media_share_targets;
create trigger video_portable_media_share_targets_prevent_hard_delete before delete on public.video_portable_media_share_targets
  for each row execute function app_private.video_analysis_prevent_hard_delete();
