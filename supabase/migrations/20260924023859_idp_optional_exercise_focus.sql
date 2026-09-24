-- Exercises belong to the player. Existing focus links and all drawings stay intact.
begin;
set local lock_timeout = '5s';
alter table public.idp_development_interventions alter column focus_id drop not null;
commit;
