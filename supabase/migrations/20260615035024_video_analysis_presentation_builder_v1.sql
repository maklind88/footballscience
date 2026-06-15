-- Football Science Video Analysis Presentation Builder v1.
-- Video remains local. Presentation, drawings, sharing, and smart collections store metadata only.

create extension if not exists pg_trgm with schema extensions;

create table if not exists public.video_presentations (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null check (char_length(organization_id) between 1 and 160),
  team_id text not null check (char_length(team_id) between 1 and 160),
  title text not null check (char_length(title) between 1 and 180),
  purpose text not null default 'team-meeting' check (purpose in ('team-meeting', 'unit-meeting', 'player-review', 'analysis', 'custom')),
  owner_id text check (owner_id is null or char_length(owner_id) <= 160),
  status text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  notes text check (notes is null or char_length(notes) <= 5000),
  created_by text check (created_by is null or char_length(created_by) <= 160),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.video_presentation_sections (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null check (char_length(organization_id) between 1 and 160),
  team_id text not null check (char_length(team_id) between 1 and 160),
  presentation_id uuid not null references public.video_presentations(id) on delete restrict,
  title text not null check (char_length(title) between 1 and 180),
  section_type text not null default 'custom' check (section_type in ('opening', 'team', 'unit', 'player', 'phase', 'set-piece', 'custom')),
  sort_order integer not null default 0 check (sort_order >= 0),
  coach_note text check (coach_note is null or char_length(coach_note) <= 4000),
  status text not null default 'active' check (status in ('active', 'archived')),
  created_by text check (created_by is null or char_length(created_by) <= 160),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.video_presentation_items (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null check (char_length(organization_id) between 1 and 160),
  team_id text not null check (char_length(team_id) between 1 and 160),
  presentation_id uuid not null references public.video_presentations(id) on delete restrict,
  section_id uuid not null references public.video_presentation_sections(id) on delete restrict,
  clip_instance_id uuid not null references public.video_clip_instances(id) on delete restrict,
  sort_order integer not null default 0 check (sort_order >= 0),
  custom_title text check (custom_title is null or char_length(custom_title) <= 180),
  coach_note text check (coach_note is null or char_length(coach_note) <= 3000),
  start_ms integer check (start_ms is null or start_ms >= 0),
  end_ms integer check (end_ms is null or end_ms >= 0),
  freeze_points_json jsonb not null default '[]'::jsonb check (jsonb_typeof(freeze_points_json) = 'array'),
  status text not null default 'active' check (status in ('active', 'archived')),
  created_by text check (created_by is null or char_length(created_by) <= 160),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.video_drawing_layers (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null check (char_length(organization_id) between 1 and 160),
  team_id text not null check (char_length(team_id) between 1 and 160),
  presentation_id uuid not null references public.video_presentations(id) on delete restrict,
  presentation_item_id uuid references public.video_presentation_items(id) on delete restrict,
  clip_instance_id uuid not null references public.video_clip_instances(id) on delete restrict,
  timestamp_ms integer not null default 0 check (timestamp_ms >= 0),
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  tool text not null check (tool in ('arrow', 'circle', 'spotlight', 'text', 'freeze', 'zoom')),
  geometry_json jsonb not null default '{}'::jsonb check (jsonb_typeof(geometry_json) = 'object'),
  style_json jsonb not null default '{}'::jsonb check (jsonb_typeof(style_json) = 'object'),
  layer_text text check (layer_text is null or char_length(layer_text) <= 500),
  sort_order integer not null default 0 check (sort_order >= 0),
  status text not null default 'active' check (status in ('active', 'archived')),
  created_by text check (created_by is null or char_length(created_by) <= 160),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.video_smart_collections (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null check (char_length(organization_id) between 1 and 160),
  team_id text not null check (char_length(team_id) between 1 and 160),
  presentation_id uuid references public.video_presentations(id) on delete restrict,
  title text not null check (char_length(title) between 1 and 180),
  search_json jsonb not null default '{}'::jsonb check (jsonb_typeof(search_json) = 'object'),
  is_shared boolean not null default true,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_by text check (created_by is null or char_length(created_by) <= 160),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  unique (team_id, title)
);

create table if not exists public.video_presentation_share_targets (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null check (char_length(organization_id) between 1 and 160),
  team_id text not null check (char_length(team_id) between 1 and 160),
  presentation_id uuid not null references public.video_presentations(id) on delete restrict,
  target_type text not null check (target_type in ('team', 'role', 'group', 'player', 'user')),
  target_id text not null check (char_length(target_id) between 1 and 180),
  access_level text not null default 'view' check (access_level in ('view', 'present', 'edit')),
  status text not null default 'active' check (status in ('active', 'archived')),
  created_by text check (created_by is null or char_length(created_by) <= 160),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  unique (presentation_id, target_type, target_id, access_level)
);

create index if not exists video_presentations_team_updated_idx on public.video_presentations (team_id, updated_at desc, id) where status <> 'archived';
create index if not exists video_presentation_sections_order_idx on public.video_presentation_sections (presentation_id, sort_order, id) where status = 'active';
create index if not exists video_presentation_items_order_idx on public.video_presentation_items (presentation_id, section_id, sort_order, id) where status = 'active';
create index if not exists video_presentation_items_clip_idx on public.video_presentation_items (team_id, clip_instance_id, created_at desc) where status = 'active';
create index if not exists video_drawing_layers_item_time_idx on public.video_drawing_layers (presentation_item_id, timestamp_ms, sort_order, id) where status = 'active';
create index if not exists video_drawing_layers_clip_time_idx on public.video_drawing_layers (team_id, clip_instance_id, timestamp_ms, id) where status = 'active';
create index if not exists video_smart_collections_team_idx on public.video_smart_collections (team_id, updated_at desc, id) where status = 'active';
create index if not exists video_smart_collections_search_gin_idx on public.video_smart_collections using gin (search_json);
create index if not exists video_presentation_share_targets_target_idx on public.video_presentation_share_targets (team_id, target_type, target_id, access_level) where status = 'active';

alter table public.video_presentations enable row level security;
alter table public.video_presentation_sections enable row level security;
alter table public.video_presentation_items enable row level security;
alter table public.video_drawing_layers enable row level security;
alter table public.video_smart_collections enable row level security;
alter table public.video_presentation_share_targets enable row level security;

revoke all on public.video_presentations from anon, authenticated;
revoke all on public.video_presentation_sections from anon, authenticated;
revoke all on public.video_presentation_items from anon, authenticated;
revoke all on public.video_drawing_layers from anon, authenticated;
revoke all on public.video_smart_collections from anon, authenticated;
revoke all on public.video_presentation_share_targets from anon, authenticated;

grant select, insert, update, delete on public.video_presentations to service_role;
grant select, insert, update, delete on public.video_presentation_sections to service_role;
grant select, insert, update, delete on public.video_presentation_items to service_role;
grant select, insert, update, delete on public.video_drawing_layers to service_role;
grant select, insert, update, delete on public.video_smart_collections to service_role;
grant select, insert, update, delete on public.video_presentation_share_targets to service_role;

drop trigger if exists video_presentations_touch_updated_at on public.video_presentations;
create trigger video_presentations_touch_updated_at before update on public.video_presentations for each row execute function app_private.video_analysis_touch_updated_at();
drop trigger if exists video_presentation_sections_touch_updated_at on public.video_presentation_sections;
create trigger video_presentation_sections_touch_updated_at before update on public.video_presentation_sections for each row execute function app_private.video_analysis_touch_updated_at();
drop trigger if exists video_presentation_items_touch_updated_at on public.video_presentation_items;
create trigger video_presentation_items_touch_updated_at before update on public.video_presentation_items for each row execute function app_private.video_analysis_touch_updated_at();
drop trigger if exists video_drawing_layers_touch_updated_at on public.video_drawing_layers;
create trigger video_drawing_layers_touch_updated_at before update on public.video_drawing_layers for each row execute function app_private.video_analysis_touch_updated_at();
drop trigger if exists video_smart_collections_touch_updated_at on public.video_smart_collections;
create trigger video_smart_collections_touch_updated_at before update on public.video_smart_collections for each row execute function app_private.video_analysis_touch_updated_at();
drop trigger if exists video_presentation_share_targets_touch_updated_at on public.video_presentation_share_targets;
create trigger video_presentation_share_targets_touch_updated_at before update on public.video_presentation_share_targets for each row execute function app_private.video_analysis_touch_updated_at();

drop trigger if exists video_presentations_prevent_hard_delete on public.video_presentations;
create trigger video_presentations_prevent_hard_delete before delete on public.video_presentations for each row execute function app_private.video_analysis_prevent_hard_delete();
drop trigger if exists video_presentation_sections_prevent_hard_delete on public.video_presentation_sections;
create trigger video_presentation_sections_prevent_hard_delete before delete on public.video_presentation_sections for each row execute function app_private.video_analysis_prevent_hard_delete();
drop trigger if exists video_presentation_items_prevent_hard_delete on public.video_presentation_items;
create trigger video_presentation_items_prevent_hard_delete before delete on public.video_presentation_items for each row execute function app_private.video_analysis_prevent_hard_delete();
drop trigger if exists video_drawing_layers_prevent_hard_delete on public.video_drawing_layers;
create trigger video_drawing_layers_prevent_hard_delete before delete on public.video_drawing_layers for each row execute function app_private.video_analysis_prevent_hard_delete();
drop trigger if exists video_smart_collections_prevent_hard_delete on public.video_smart_collections;
create trigger video_smart_collections_prevent_hard_delete before delete on public.video_smart_collections for each row execute function app_private.video_analysis_prevent_hard_delete();
drop trigger if exists video_presentation_share_targets_prevent_hard_delete on public.video_presentation_share_targets;
create trigger video_presentation_share_targets_prevent_hard_delete before delete on public.video_presentation_share_targets for each row execute function app_private.video_analysis_prevent_hard_delete();

insert into public.platform_permission_matrix
  (module_id, action, roles, scope, requires_organization_scope, requires_team_scope, description)
values
  ('video-analysis', 'present', array['admin','club-admin','team-admin','coach','analyst','performance'], 'team', true, true, 'Present saved video analysis presentations without exposing local video files.'),
  ('video-analysis', 'share', array['admin','club-admin','team-admin','coach','analyst'], 'team', true, true, 'Share presentation metadata to approved team, role, group, player, or user targets.')
on conflict (module_id, action) do update
set
  roles = excluded.roles,
  scope = excluded.scope,
  requires_organization_scope = excluded.requires_organization_scope,
  requires_team_scope = excluded.requires_team_scope,
  description = excluded.description,
  updated_at = now();
