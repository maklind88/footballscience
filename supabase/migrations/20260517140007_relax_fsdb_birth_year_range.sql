-- Football Science DB historic player support
-- REEP contains legitimate 19th-century footballers; keep implausible earlier
-- dates out in application normalization, but allow real historic records.

alter table public.fsdb_players
  drop constraint if exists fsdb_players_birth_year_check;

alter table public.fsdb_players
  add constraint fsdb_players_birth_year_check
  check (birth_year is null or birth_year between 1800 and 2100);
