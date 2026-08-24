-- FS Player Elite pitch calibration metadata.
-- Raw media and dense tracking samples remain device-local.

create table if not exists public.video_pitch_calibrations (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null check (char_length(organization_id) between 1 and 160),
  team_id text not null check (char_length(team_id) between 1 and 160),
  match_id uuid not null references public.video_matches(id) on delete restrict,
  video_id uuid not null references public.video_videos(id) on delete restrict,
  source_id uuid references public.video_sources(id) on delete restrict,
  pitch_length_m numeric(7,3) not null default 105 check (pitch_length_m between 90 and 120),
  pitch_width_m numeric(7,3) not null default 68 check (pitch_width_m between 45 and 90),
  calibration_source text not null default 'manual' check (calibration_source in ('manual','automatic','hybrid')),
  status text not null default 'draft' check (status in ('draft','calibrated','verified','archived')),
  confidence numeric(5,4) not null default 0 check (confidence between 0 and 1),
  frame_count integer not null default 0 check (frame_count between 0 and 500),
  revision integer not null default 1 check (revision > 0),
  verified_by text check (verified_by is null or char_length(verified_by) <= 160),
  verified_at timestamptz,
  created_by text check (created_by is null or char_length(created_by) <= 160),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists video_pitch_calibrations_video_idx
  on public.video_pitch_calibrations (team_id, video_id, source_id, updated_at desc, id)
  where status <> 'archived';

create table if not exists public.video_pitch_calibration_frames (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null check (char_length(organization_id) between 1 and 160),
  team_id text not null check (char_length(team_id) between 1 and 160),
  calibration_id uuid not null references public.video_pitch_calibrations(id) on delete restrict,
  at_ms bigint not null check (at_ms >= 0),
  valid_from_ms bigint not null check (valid_from_ms >= 0),
  valid_to_ms bigint not null check (valid_to_ms >= valid_from_ms),
  image_width integer not null default 0 check (image_width between 0 and 32768),
  image_height integer not null default 0 check (image_height between 0 and 32768),
  input_space text not null default 'normalized-image' check (input_space in ('normalized-image','image-pixels')),
  image_to_pitch_matrix jsonb not null check (jsonb_typeof(image_to_pitch_matrix) = 'array' and jsonb_array_length(image_to_pitch_matrix) = 9),
  control_points_json jsonb not null default '[]'::jsonb check (jsonb_typeof(control_points_json) = 'array' and jsonb_array_length(control_points_json) between 4 and 40),
  confidence numeric(5,4) not null default 0 check (confidence between 0 and 1),
  rms_error_m numeric(7,3) not null default 0 check (rms_error_m between 0 and 100),
  status text not null default 'active' check (status in ('active','archived')),
  revision integer not null default 1 check (revision > 0),
  created_by text check (created_by is null or char_length(created_by) <= 160),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists video_pitch_calibration_frames_time_idx
  on public.video_pitch_calibration_frames (calibration_id, valid_from_ms, valid_to_ms, at_ms, id)
  where status = 'active';

alter table public.video_pitch_calibrations enable row level security;
alter table public.video_pitch_calibration_frames enable row level security;

revoke all on public.video_pitch_calibrations from anon, authenticated;
revoke all on public.video_pitch_calibration_frames from anon, authenticated;

grant select, insert, update, delete on public.video_pitch_calibrations to service_role;
grant select, insert, update, delete on public.video_pitch_calibration_frames to service_role;

drop trigger if exists video_pitch_calibrations_touch_updated_at on public.video_pitch_calibrations;
create trigger video_pitch_calibrations_touch_updated_at before update on public.video_pitch_calibrations
  for each row execute function app_private.video_analysis_touch_updated_at();
drop trigger if exists video_pitch_calibrations_increment_revision on public.video_pitch_calibrations;
create trigger video_pitch_calibrations_increment_revision before update on public.video_pitch_calibrations
  for each row execute function app_private.video_analysis_increment_tracking_revision();
drop trigger if exists video_pitch_calibrations_prevent_hard_delete on public.video_pitch_calibrations;
create trigger video_pitch_calibrations_prevent_hard_delete before delete on public.video_pitch_calibrations
  for each row execute function app_private.video_analysis_prevent_hard_delete();

drop trigger if exists video_pitch_calibration_frames_touch_updated_at on public.video_pitch_calibration_frames;
create trigger video_pitch_calibration_frames_touch_updated_at before update on public.video_pitch_calibration_frames
  for each row execute function app_private.video_analysis_touch_updated_at();
drop trigger if exists video_pitch_calibration_frames_increment_revision on public.video_pitch_calibration_frames;
create trigger video_pitch_calibration_frames_increment_revision before update on public.video_pitch_calibration_frames
  for each row execute function app_private.video_analysis_increment_tracking_revision();
drop trigger if exists video_pitch_calibration_frames_prevent_hard_delete on public.video_pitch_calibration_frames;
create trigger video_pitch_calibration_frames_prevent_hard_delete before delete on public.video_pitch_calibration_frames
  for each row execute function app_private.video_analysis_prevent_hard_delete();
