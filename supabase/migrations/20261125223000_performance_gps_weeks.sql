create table public.performance_gps_imports (
  organization_id uuid not null,
  team_id uuid not null,
  dataset_sha256 text not null check (dataset_sha256 ~ '^[0-9a-f]{64}$'),
  source_sha256 text not null check (source_sha256 ~ '^[0-9a-f]{64}$'),
  source_row_count integer not null check (source_row_count > 0),
  source_metadata jsonb not null check (jsonb_typeof(source_metadata) = 'object'),
  is_current boolean not null default false,
  published_at timestamptz,
  check (not is_current or published_at is not null),
  created_at timestamptz not null default now(),
  primary key (organization_id, team_id, dataset_sha256),
  foreign key (team_id, organization_id) references public.platform_teams (id, organization_id) on delete restrict
);

create unique index performance_gps_one_published_import
  on public.performance_gps_imports (organization_id, team_id) where is_current;

create table public.performance_gps_week_snapshots (
  organization_id uuid not null,
  team_id uuid not null,
  dataset_sha256 text not null,
  week_start date not null check (extract(isodow from week_start) = 1),
  observations jsonb not null check (
    jsonb_typeof(observations) = 'array' and pg_column_size(observations) <= 262144
  ),
  archive_observations jsonb not null check (
    jsonb_typeof(archive_observations) = 'array' and pg_column_size(archive_observations) <= 262144
  ),
  primary key (organization_id, team_id, dataset_sha256, week_start),
  foreign key (organization_id, team_id, dataset_sha256)
    references public.performance_gps_imports (organization_id, team_id, dataset_sha256) on delete restrict
);

alter table public.performance_gps_imports enable row level security;
alter table public.performance_gps_week_snapshots enable row level security;
revoke all on public.performance_gps_imports, public.performance_gps_week_snapshots from public, anon, authenticated, service_role;
grant select on public.performance_gps_imports, public.performance_gps_week_snapshots to service_role;

create function public.read_performance_gps_week(
  p_actor_id uuid, p_organization_id uuid, p_team_id uuid, p_week date, p_history boolean
) returns jsonb language plpgsql stable security invoker
set search_path = '' as $$
begin
  if not app_private.leaderboard_actor_has_role(p_actor_id, p_organization_id, p_team_id,
    array['admin','club-admin','team-admin','coach','performance','medical']) then
    raise exception 'Active team membership required.' using errcode = '42501';
  end if;

  return (
    select coalesce(case when p_history then snapshot.archive_observations else snapshot.observations end, '[]'::jsonb)
    from public.performance_gps_imports as import
    left join public.performance_gps_week_snapshots as snapshot
      on snapshot.organization_id = import.organization_id
      and snapshot.team_id = import.team_id
      and snapshot.dataset_sha256 = import.dataset_sha256
      and snapshot.week_start = p_week
    where import.organization_id = p_organization_id
      and import.team_id = p_team_id
      and import.is_current
  );
end;
$$;

revoke all on function public.read_performance_gps_week(uuid, uuid, uuid, date, boolean) from public, anon, authenticated;
grant execute on function public.read_performance_gps_week(uuid, uuid, uuid, date, boolean) to service_role;
