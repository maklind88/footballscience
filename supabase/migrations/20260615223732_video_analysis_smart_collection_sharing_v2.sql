-- Video Analysis Smart Collection sharing v2.
-- Collections are playlist-like metadata objects. Video and thumbnails remain local.

alter table public.video_smart_collections
  add column if not exists description text check (description is null or char_length(description) <= 1000),
  add column if not exists collection_type text not null default 'smart' check (collection_type in ('smart', 'manual')),
  add column if not exists visibility text not null default 'coach-analyst' check (visibility in ('coach-analyst', 'team', 'private', 'custom', 'player-safe')),
  add column if not exists sort_mode text not null default 'newest' check (sort_mode in ('newest', 'oldest', 'match-date', 'clip-time', 'custom'));

create table if not exists public.video_smart_collection_share_targets (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null check (char_length(organization_id) between 1 and 160),
  team_id text not null check (char_length(team_id) between 1 and 160),
  collection_id uuid not null references public.video_smart_collections(id) on delete restrict,
  target_type text not null check (target_type in ('team', 'role', 'group', 'player', 'user')),
  target_id text not null check (char_length(target_id) between 1 and 180),
  access_level text not null default 'view' check (access_level in ('view', 'present', 'edit')),
  status text not null default 'active' check (status in ('active', 'archived')),
  created_by text check (created_by is null or char_length(created_by) <= 160),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  unique (collection_id, target_type, target_id, access_level)
);

create index if not exists video_smart_collections_visibility_idx on public.video_smart_collections (team_id, visibility, updated_at desc, id) where status = 'active';
create index if not exists video_smart_collection_share_targets_collection_idx on public.video_smart_collection_share_targets (collection_id, status, id);
create index if not exists video_smart_collection_share_targets_target_idx on public.video_smart_collection_share_targets (team_id, target_type, target_id, access_level) where status = 'active';

alter table public.video_smart_collection_share_targets enable row level security;
revoke all on public.video_smart_collection_share_targets from anon, authenticated;
grant select, insert, update, delete on public.video_smart_collection_share_targets to service_role;

drop trigger if exists video_smart_collection_share_targets_touch_updated_at on public.video_smart_collection_share_targets;
create trigger video_smart_collection_share_targets_touch_updated_at before update on public.video_smart_collection_share_targets for each row execute function app_private.video_analysis_touch_updated_at();

drop trigger if exists video_smart_collection_share_targets_prevent_hard_delete on public.video_smart_collection_share_targets;
create trigger video_smart_collection_share_targets_prevent_hard_delete before delete on public.video_smart_collection_share_targets for each row execute function app_private.video_analysis_prevent_hard_delete();
