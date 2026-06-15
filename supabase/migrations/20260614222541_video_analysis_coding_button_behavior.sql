-- Football Science Video Analysis Coding Window button behavior.
-- Additive only: code buttons own timing/behavior metadata, video remains local.

alter table if exists public.video_coding_templates
  add column if not exists default_clip_duration_ms integer not null default 15000 check (default_clip_duration_ms >= 100),
  alter column default_mode set default 'instant';

alter table if exists public.video_coding_buttons
  add column if not exists group_id text check (group_id is null or char_length(group_id) <= 120),
  add column if not exists target_field text check (target_field is null or char_length(target_field) <= 120),
  add column if not exists button_behavior text not null default 'create_tag' check (button_behavior in ('create_tag', 'toggle_duration', 'label_current', 'descriptor', 'player_tag', 'custom')),
  add column if not exists creates_clip boolean not null default true,
  add column if not exists applies_label boolean not null default false,
  add column if not exists default_duration_ms integer not null default 15000 check (default_duration_ms >= 100),
  add column if not exists start_offset_ms integer not null default 0,
  add column if not exists end_offset_ms integer not null default 15000;

create index if not exists video_coding_buttons_template_group_order_idx
  on public.video_coding_buttons (template_id, group_id, sort_order, id)
  where status = 'active';

create index if not exists video_coding_buttons_behavior_idx
  on public.video_coding_buttons (team_id, button_behavior)
  where status = 'active';
