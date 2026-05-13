-- Scouting player identity and import quality metadata.
-- Keeps weekly imports mergeable by person identity + season + league + team.

alter table public.scouting_players
  add column if not exists player_identity_key text,
  add column if not exists source_aliases jsonb not null default '[]'::jsonb;

update public.scouting_players
set player_identity_key = coalesce(
  nullif(btrim(player_identity_key), ''),
  nullif(btrim(metadata->>'playerIdentityId'), ''),
  nullif(btrim(source_player_id), ''),
  encode(extensions.digest(coalesce(sort_name, canonical_name, id::text), 'sha1'), 'hex')
)
where player_identity_key is null
   or btrim(player_identity_key) = '';

with duplicated as (
  select
    id,
    player_identity_key,
    row_number() over (
      partition by player_identity_key
      order by updated_at desc nulls last, created_at desc nulls last, id
    ) as duplicate_rank
  from public.scouting_players
)
update public.scouting_players p
set player_identity_key = left(coalesce(p.source_system, 'file-import') || '::' || coalesce(p.source_player_id, p.id::text), 180)
from duplicated d
where p.id = d.id
  and d.duplicate_rank > 1;

alter table public.scouting_players
  alter column player_identity_key set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'scouting_players_identity_key_not_empty'
  ) then
    alter table public.scouting_players
      add constraint scouting_players_identity_key_not_empty check (char_length(player_identity_key) between 2 and 180);
  end if;
end $$;

create unique index if not exists scouting_players_identity_key_idx
  on public.scouting_players (player_identity_key);

alter table public.scouting_player_seasons
  add column if not exists player_identity_key text,
  add column if not exists date_of_birth date;

update public.scouting_player_seasons s
set player_identity_key = coalesce(
  nullif(btrim(s.player_identity_key), ''),
  nullif(btrim(s.metadata->>'playerIdentityId'), ''),
  nullif(btrim(p.player_identity_key), ''),
  nullif(btrim(s.source_player_id), '')
)
from public.scouting_players p
where s.player_id = p.id
  and (s.player_identity_key is null or btrim(s.player_identity_key) = '');

update public.scouting_player_seasons s
set date_of_birth = coalesce(s.date_of_birth, p.date_of_birth)
from public.scouting_players p
where s.player_id = p.id
  and s.date_of_birth is null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'scouting_player_seasons_identity_key_not_empty'
  ) then
    alter table public.scouting_player_seasons
      add constraint scouting_player_seasons_identity_key_not_empty check (player_identity_key is null or char_length(player_identity_key) between 2 and 180);
  end if;
end $$;

create index if not exists scouting_player_seasons_identity_merge_idx
  on public.scouting_player_seasons (source_system, player_identity_key, season_label, league_name, team_name)
  where deleted_at is null and status = 'active';

create index if not exists scouting_player_seasons_quality_gin_idx
  on public.scouting_player_seasons using gin ((metadata->'metricQuality') jsonb_path_ops)
  where deleted_at is null and status = 'active';
