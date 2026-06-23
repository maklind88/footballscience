-- Forward fix for environments where 20260514153000 is already recorded as applied.
-- Ensures Scouting source identity defaults never reference row columns.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
alter extension pgcrypto set schema extensions;

alter table public.scouting_players
  add column if not exists source_system text,
  add column if not exists source_player_id text;

update public.scouting_players
set source_system = coalesce(nullif(btrim(source_system), ''), 'file-import')
where source_system is null
  or btrim(source_system) = '';

update public.scouting_players
set source_player_id = coalesce(
  nullif(btrim(source_player_id), ''),
  encode(
    extensions.digest(
      coalesce(source_system, 'file-import') || '::' || canonical_name,
      'sha1'
    ),
    'hex'
  )
)
where source_player_id is null
  or btrim(source_player_id) = '';

alter table public.scouting_players
  alter column source_system set default 'file-import',
  alter column source_system set not null,
  alter column source_player_id set default encode(extensions.digest(extensions.gen_random_uuid()::text, 'sha1'), 'hex'),
  alter column source_player_id set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'scouting_players_source_system_not_empty'
      and conrelid = 'public.scouting_players'::regclass
  ) then
    alter table public.scouting_players
      add constraint scouting_players_source_system_not_empty check (char_length(source_system) between 2 and 40);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'scouting_players_source_player_id_not_empty'
      and conrelid = 'public.scouting_players'::regclass
  ) then
    alter table public.scouting_players
      add constraint scouting_players_source_player_id_not_empty check (char_length(source_player_id) between 2 and 160);
  end if;
end $$;

create unique index if not exists scouting_players_source_key_idx
  on public.scouting_players (source_system, source_player_id);

alter table public.scouting_player_seasons
  add column if not exists source_system text,
  add column if not exists source_player_id text,
  add column if not exists source_record_id text;

update public.scouting_player_seasons s
set source_system = coalesce(
  nullif(btrim(s.source_system), ''),
  coalesce(nullif(btrim(p.source_system), ''), 'file-import')
)
from public.scouting_players p
where s.player_id = p.id
  and (s.source_system is null or btrim(s.source_system) = '');

update public.scouting_player_seasons
set source_system = coalesce(nullif(btrim(source_system), ''), 'file-import')
where source_system is null
  or btrim(source_system) = '';

update public.scouting_player_seasons s
set source_player_id = coalesce(
  nullif(btrim(s.source_player_id), ''),
  nullif(btrim(p.source_player_id), ''),
  encode(extensions.digest(s.id::text, 'sha1'), 'hex')
)
from public.scouting_players p
where s.player_id = p.id
  and (s.source_player_id is null or btrim(s.source_player_id) = '');

update public.scouting_player_seasons
set source_player_id = coalesce(
  nullif(btrim(source_player_id), ''),
  encode(extensions.digest(id::text, 'sha1'), 'hex')
)
where source_player_id is null
  or btrim(source_player_id) = '';

update public.scouting_player_seasons
set source_record_id = coalesce(
  nullif(btrim(source_record_id), ''),
  nullif(btrim(record_key), ''),
  encode(extensions.digest(id::text, 'sha1'), 'hex')
)
where source_record_id is null
  or btrim(source_record_id) = '';

update public.scouting_player_seasons
set source_record_id = left(
      case
        when source_record_id ~ '^[^:]+::.+$' then source_record_id
        else coalesce(btrim(source_system), 'file-import') || '::' || coalesce(nullif(btrim(source_record_id), ''), encode(extensions.digest(id::text, 'sha1'), 'hex'))
      end,
      160
    )
where source_record_id !~ '^[^:]+::.+$'
   or btrim(source_record_id) = '';

update public.scouting_player_seasons
set record_key = left(
      case
        when record_key ~ '^[^:]+::.+$' then record_key
        else coalesce(btrim(source_system), 'file-import') || '::' || coalesce(nullif(btrim(source_record_id), ''), encode(extensions.digest(id::text, 'sha1'), 'hex'))
      end,
      180
    )
where record_key !~ '^[^:]+::.+$'
   or btrim(record_key) = '';

alter table public.scouting_player_seasons
  alter column source_system set default 'file-import',
  alter column source_system set not null,
  alter column source_player_id set default encode(extensions.digest(extensions.gen_random_uuid()::text, 'sha1'), 'hex'),
  alter column source_player_id set not null,
  alter column source_record_id set default encode(extensions.digest(extensions.gen_random_uuid()::text, 'sha1'), 'hex'),
  alter column source_record_id set not null;

create unique index if not exists scouting_player_seasons_source_record_idx
  on public.scouting_player_seasons (source_system, source_record_id);

create index if not exists scouting_player_seasons_source_player_idx
  on public.scouting_player_seasons (source_player_id, season_label, position_text);
