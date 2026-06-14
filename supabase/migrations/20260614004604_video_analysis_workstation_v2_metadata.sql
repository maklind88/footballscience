-- Football Science Video Analysis Coding Workstation v2 metadata.
-- Additive only: video stays local, coaching intelligence stays central.

create extension if not exists pg_trgm with schema extensions;

alter table if exists public.video_clip_instances
  add column if not exists coding_template_id uuid,
  add column if not exists coding_button_id uuid,
  add column if not exists coding_mode text not null default 'manual' check (coding_mode in ('manual', 'instant')),
  add column if not exists pre_roll_ms integer not null default 0 check (pre_roll_ms >= 0),
  add column if not exists post_roll_ms integer not null default 0 check (post_roll_ms >= 0);

create table if not exists public.video_coding_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null check (char_length(organization_id) between 1 and 160),
  team_id text not null check (char_length(team_id) between 1 and 160),
  title text not null check (char_length(title) between 1 and 180),
  description text check (description is null or char_length(description) <= 1000),
  default_mode text not null default 'manual' check (default_mode in ('manual', 'instant')),
  pre_roll_ms integer not null default 4000 check (pre_roll_ms >= 0),
  post_roll_ms integer not null default 4000 check (post_roll_ms >= 0),
  is_default boolean not null default false,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_by text check (created_by is null or char_length(created_by) <= 160),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  settings jsonb not null default '{}'::jsonb,
  unique (team_id, title)
);

create table if not exists public.video_coding_buttons (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null check (char_length(organization_id) between 1 and 160),
  team_id text not null check (char_length(team_id) between 1 and 160),
  template_id uuid not null references public.video_coding_templates(id) on delete restrict,
  button_type text not null check (button_type in ('phase', 'sub_phase', 'team_principle', 'mini_game_principle', 'outcome', 'descriptor', 'player', 'unit', 'custom')),
  label text not null check (char_length(label) between 1 and 120),
  value text not null check (char_length(value) between 1 and 180),
  hotkey text check (hotkey is null or char_length(hotkey) <= 40),
  color text check (color is null or char_length(color) <= 40),
  sort_order integer not null default 0 check (sort_order >= 0),
  instant_enabled boolean not null default true,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_by text check (created_by is null or char_length(created_by) <= 160),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  unique (template_id, button_type, value)
);

create table if not exists public.video_coding_button_links (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null check (char_length(organization_id) between 1 and 160),
  team_id text not null check (char_length(team_id) between 1 and 160),
  template_id uuid not null references public.video_coding_templates(id) on delete restrict,
  source_button_id uuid not null references public.video_coding_buttons(id) on delete restrict,
  target_button_id uuid not null references public.video_coding_buttons(id) on delete restrict,
  link_type text not null default 'activates' check (link_type in ('activates', 'suggests', 'requires')),
  status text not null default 'active' check (status in ('active', 'archived')),
  created_by text check (created_by is null or char_length(created_by) <= 160),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  unique (template_id, source_button_id, target_button_id, link_type)
);

create table if not exists public.video_clip_labels (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null check (char_length(organization_id) between 1 and 160),
  team_id text not null check (char_length(team_id) between 1 and 160),
  clip_instance_id uuid not null references public.video_clip_instances(id) on delete restrict,
  label_type text not null check (label_type in ('phase', 'sub_phase', 'team_principle', 'mini_game_principle', 'outcome', 'descriptor', 'custom')),
  label_value text not null check (char_length(label_value) between 1 and 180),
  label_text text check (label_text is null or char_length(label_text) <= 180),
  created_by text check (created_by is null or char_length(created_by) <= 160),
  created_at timestamptz not null default now(),
  unique (clip_instance_id, label_type, label_value)
);

create table if not exists public.video_clip_descriptors (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null check (char_length(organization_id) between 1 and 160),
  team_id text not null check (char_length(team_id) between 1 and 160),
  clip_instance_id uuid not null references public.video_clip_instances(id) on delete restrict,
  descriptor_type text not null check (descriptor_type in ('player', 'unit', 'pitch_zone', 'pressure', 'decision', 'execution', 'custom')),
  descriptor_value text not null check (char_length(descriptor_value) between 1 and 180),
  descriptor_label text check (descriptor_label is null or char_length(descriptor_label) <= 180),
  created_by text check (created_by is null or char_length(created_by) <= 160),
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  unique (clip_instance_id, descriptor_type, descriptor_value)
);

create table if not exists public.video_timeline_lanes (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null check (char_length(organization_id) between 1 and 160),
  team_id text not null check (char_length(team_id) between 1 and 160),
  template_id uuid references public.video_coding_templates(id) on delete restrict,
  lane_key text not null check (char_length(lane_key) between 1 and 120),
  label text not null check (char_length(label) between 1 and 120),
  source_type text not null check (source_type in ('phase', 'player', 'unit', 'outcome', 'descriptor', 'custom')),
  sort_order integer not null default 0 check (sort_order >= 0),
  status text not null default 'active' check (status in ('active', 'archived')),
  created_by text check (created_by is null or char_length(created_by) <= 160),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  unique (team_id, lane_key)
);

create table if not exists public.video_saved_clip_searches (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null check (char_length(organization_id) between 1 and 160),
  team_id text not null check (char_length(team_id) between 1 and 160),
  title text not null check (char_length(title) between 1 and 180),
  search_json jsonb not null default '{}'::jsonb,
  is_shared boolean not null default true,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_by text check (created_by is null or char_length(created_by) <= 160),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (team_id, title)
);

create table if not exists public.video_review_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null check (char_length(organization_id) between 1 and 160),
  team_id text not null check (char_length(team_id) between 1 and 160),
  playlist_id uuid references public.video_playlists(id) on delete restrict,
  title text not null check (char_length(title) between 1 and 180),
  purpose text not null default 'team-meeting' check (purpose in ('team-meeting', 'unit-meeting', 'player-review')),
  player_id text check (player_id is null or char_length(player_id) <= 160),
  unit text check (unit is null or char_length(unit) <= 120),
  status text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  created_by text check (created_by is null or char_length(created_by) <= 160),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  notes text check (notes is null or char_length(notes) <= 4000),
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.video_playlist_sections (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null check (char_length(organization_id) between 1 and 160),
  team_id text not null check (char_length(team_id) between 1 and 160),
  playlist_id uuid references public.video_playlists(id) on delete restrict,
  review_session_id uuid references public.video_review_sessions(id) on delete restrict,
  title text not null check (char_length(title) between 1 and 180),
  section_type text not null default 'team-meeting' check (section_type in ('team-meeting', 'unit-meeting', 'player-review', 'custom')),
  sort_order integer not null default 0 check (sort_order >= 0),
  meeting_note text check (meeting_note is null or char_length(meeting_note) <= 3000),
  status text not null default 'active' check (status in ('active', 'archived')),
  created_by text check (created_by is null or char_length(created_by) <= 160),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

alter table if exists public.video_playlist_items
  add column if not exists section_id uuid references public.video_playlist_sections(id) on delete restrict;

create table if not exists public.video_clip_revisions (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null check (char_length(organization_id) between 1 and 160),
  team_id text not null check (char_length(team_id) between 1 and 160),
  clip_instance_id uuid not null references public.video_clip_instances(id) on delete restrict,
  revision_number integer not null check (revision_number > 0),
  change_reason text check (change_reason is null or char_length(change_reason) <= 240),
  before_record jsonb,
  after_record jsonb not null default '{}'::jsonb,
  created_by text check (created_by is null or char_length(created_by) <= 160),
  created_at timestamptz not null default now(),
  unique (clip_instance_id, revision_number)
);

alter table if exists public.video_clip_instances
  drop constraint if exists video_clip_instances_coding_template_id_fkey,
  add constraint video_clip_instances_coding_template_id_fkey
    foreign key (coding_template_id) references public.video_coding_templates(id) on delete restrict;

alter table if exists public.video_clip_instances
  drop constraint if exists video_clip_instances_coding_button_id_fkey,
  add constraint video_clip_instances_coding_button_id_fkey
    foreign key (coding_button_id) references public.video_coding_buttons(id) on delete restrict;

create index if not exists video_coding_templates_team_idx on public.video_coding_templates (team_id, is_default desc, created_at desc) where status = 'active';
create index if not exists video_coding_buttons_template_order_idx on public.video_coding_buttons (template_id, sort_order, id) where status = 'active';
create index if not exists video_coding_buttons_hotkey_idx on public.video_coding_buttons (team_id, lower(hotkey)) where status = 'active' and hotkey is not null;
create index if not exists video_coding_button_links_source_idx on public.video_coding_button_links (source_button_id, link_type) where status = 'active';
create index if not exists video_clip_labels_clip_idx on public.video_clip_labels (clip_instance_id, label_type, label_value);
create index if not exists video_clip_labels_value_trgm_idx on public.video_clip_labels using gin ((lower(label_value)) gin_trgm_ops);
create index if not exists video_clip_descriptors_clip_idx on public.video_clip_descriptors (clip_instance_id, descriptor_type, descriptor_value);
create index if not exists video_clip_descriptors_value_idx on public.video_clip_descriptors (team_id, descriptor_type, descriptor_value, created_at desc);
create index if not exists video_timeline_lanes_team_order_idx on public.video_timeline_lanes (team_id, sort_order, id) where status = 'active';
create index if not exists video_saved_clip_searches_team_idx on public.video_saved_clip_searches (team_id, created_at desc) where status = 'active';
create index if not exists video_review_sessions_team_idx on public.video_review_sessions (team_id, created_at desc) where status <> 'archived';
create index if not exists video_review_sessions_player_idx on public.video_review_sessions (team_id, player_id, created_at desc) where player_id is not null and status <> 'archived';
create index if not exists video_playlist_sections_review_order_idx on public.video_playlist_sections (review_session_id, sort_order, id) where status = 'active';
create index if not exists video_playlist_sections_playlist_order_idx on public.video_playlist_sections (playlist_id, sort_order, id) where status = 'active';
create index if not exists video_playlist_items_section_order_idx on public.video_playlist_items (section_id, sort_order, id) where section_id is not null;
create index if not exists video_clip_revisions_clip_idx on public.video_clip_revisions (clip_instance_id, revision_number desc);

alter table public.video_coding_templates enable row level security;
alter table public.video_coding_buttons enable row level security;
alter table public.video_coding_button_links enable row level security;
alter table public.video_clip_labels enable row level security;
alter table public.video_clip_descriptors enable row level security;
alter table public.video_timeline_lanes enable row level security;
alter table public.video_saved_clip_searches enable row level security;
alter table public.video_review_sessions enable row level security;
alter table public.video_playlist_sections enable row level security;
alter table public.video_clip_revisions enable row level security;

revoke all on public.video_coding_templates from anon, authenticated;
revoke all on public.video_coding_buttons from anon, authenticated;
revoke all on public.video_coding_button_links from anon, authenticated;
revoke all on public.video_clip_labels from anon, authenticated;
revoke all on public.video_clip_descriptors from anon, authenticated;
revoke all on public.video_timeline_lanes from anon, authenticated;
revoke all on public.video_saved_clip_searches from anon, authenticated;
revoke all on public.video_review_sessions from anon, authenticated;
revoke all on public.video_playlist_sections from anon, authenticated;
revoke all on public.video_clip_revisions from anon, authenticated;

grant select, insert, update, delete on public.video_coding_templates to service_role;
grant select, insert, update, delete on public.video_coding_buttons to service_role;
grant select, insert, update, delete on public.video_coding_button_links to service_role;
grant select, insert, update, delete on public.video_clip_labels to service_role;
grant select, insert, update, delete on public.video_clip_descriptors to service_role;
grant select, insert, update, delete on public.video_timeline_lanes to service_role;
grant select, insert, update, delete on public.video_saved_clip_searches to service_role;
grant select, insert, update, delete on public.video_review_sessions to service_role;
grant select, insert, update, delete on public.video_playlist_sections to service_role;
grant select, insert, update, delete on public.video_clip_revisions to service_role;

drop trigger if exists video_coding_templates_touch_updated_at on public.video_coding_templates;
create trigger video_coding_templates_touch_updated_at before update on public.video_coding_templates for each row execute function app_private.video_analysis_touch_updated_at();
drop trigger if exists video_coding_buttons_touch_updated_at on public.video_coding_buttons;
create trigger video_coding_buttons_touch_updated_at before update on public.video_coding_buttons for each row execute function app_private.video_analysis_touch_updated_at();
drop trigger if exists video_coding_button_links_touch_updated_at on public.video_coding_button_links;
create trigger video_coding_button_links_touch_updated_at before update on public.video_coding_button_links for each row execute function app_private.video_analysis_touch_updated_at();
drop trigger if exists video_timeline_lanes_touch_updated_at on public.video_timeline_lanes;
create trigger video_timeline_lanes_touch_updated_at before update on public.video_timeline_lanes for each row execute function app_private.video_analysis_touch_updated_at();
drop trigger if exists video_saved_clip_searches_touch_updated_at on public.video_saved_clip_searches;
create trigger video_saved_clip_searches_touch_updated_at before update on public.video_saved_clip_searches for each row execute function app_private.video_analysis_touch_updated_at();
drop trigger if exists video_review_sessions_touch_updated_at on public.video_review_sessions;
create trigger video_review_sessions_touch_updated_at before update on public.video_review_sessions for each row execute function app_private.video_analysis_touch_updated_at();
drop trigger if exists video_playlist_sections_touch_updated_at on public.video_playlist_sections;
create trigger video_playlist_sections_touch_updated_at before update on public.video_playlist_sections for each row execute function app_private.video_analysis_touch_updated_at();

drop trigger if exists video_coding_templates_prevent_hard_delete on public.video_coding_templates;
create trigger video_coding_templates_prevent_hard_delete before delete on public.video_coding_templates for each row execute function app_private.video_analysis_prevent_hard_delete();
drop trigger if exists video_coding_buttons_prevent_hard_delete on public.video_coding_buttons;
create trigger video_coding_buttons_prevent_hard_delete before delete on public.video_coding_buttons for each row execute function app_private.video_analysis_prevent_hard_delete();
drop trigger if exists video_coding_button_links_prevent_hard_delete on public.video_coding_button_links;
create trigger video_coding_button_links_prevent_hard_delete before delete on public.video_coding_button_links for each row execute function app_private.video_analysis_prevent_hard_delete();
drop trigger if exists video_clip_labels_prevent_hard_delete on public.video_clip_labels;
create trigger video_clip_labels_prevent_hard_delete before delete on public.video_clip_labels for each row execute function app_private.video_analysis_prevent_hard_delete();
drop trigger if exists video_clip_descriptors_prevent_hard_delete on public.video_clip_descriptors;
create trigger video_clip_descriptors_prevent_hard_delete before delete on public.video_clip_descriptors for each row execute function app_private.video_analysis_prevent_hard_delete();
drop trigger if exists video_timeline_lanes_prevent_hard_delete on public.video_timeline_lanes;
create trigger video_timeline_lanes_prevent_hard_delete before delete on public.video_timeline_lanes for each row execute function app_private.video_analysis_prevent_hard_delete();
drop trigger if exists video_saved_clip_searches_prevent_hard_delete on public.video_saved_clip_searches;
create trigger video_saved_clip_searches_prevent_hard_delete before delete on public.video_saved_clip_searches for each row execute function app_private.video_analysis_prevent_hard_delete();
drop trigger if exists video_review_sessions_prevent_hard_delete on public.video_review_sessions;
create trigger video_review_sessions_prevent_hard_delete before delete on public.video_review_sessions for each row execute function app_private.video_analysis_prevent_hard_delete();
drop trigger if exists video_playlist_sections_prevent_hard_delete on public.video_playlist_sections;
create trigger video_playlist_sections_prevent_hard_delete before delete on public.video_playlist_sections for each row execute function app_private.video_analysis_prevent_hard_delete();
drop trigger if exists video_clip_revisions_prevent_hard_delete on public.video_clip_revisions;
create trigger video_clip_revisions_prevent_hard_delete before delete on public.video_clip_revisions for each row execute function app_private.video_analysis_prevent_hard_delete();
