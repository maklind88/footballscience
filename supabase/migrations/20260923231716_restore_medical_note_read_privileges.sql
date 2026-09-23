-- Restore the reviewed 20260911185738 column contract after table-grant drift.
-- No row, policy, view, function, default privilege or server-write change.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

do $$
begin
  if to_regprocedure('app_private.medical_coach_recommendation_note(uuid)') is null
    or to_regprocedure('app_private.medical_coach_plan_note(uuid)') is null
    or (select count(*) from pg_class where oid in (
      'public.medical_coach_availability'::regclass,
      'public.medical_coach_availability_plans'::regclass
    ) and reloptions @> array['security_invoker=true']) <> 2
    or (select count(*) from pg_class where oid in (
      'public.medical_availability_recommendations'::regclass,
      'public.medical_availability_plans'::regclass
    ) and relrowsecurity) <> 2 then
    raise exception 'Medical read boundary prerequisites are not installed';
  end if;
end;
$$;

revoke select on public.medical_availability_recommendations from public, anon, authenticated;
revoke select on public.medical_availability_plans from public, anon, authenticated;
revoke select (coach_note, internal_note) on public.medical_availability_recommendations from public, anon, authenticated;
revoke select (coach_note, internal_note) on public.medical_availability_plans from public, anon, authenticated;

grant select (
  id, organization_id, team_id, season_id, player_id, roster_membership_id,
  recommendation_date, status, recommended_participation, rtp_phase,
  share_with_coach, source, created_at, updated_at, deleted_at
) on public.medical_availability_recommendations to authenticated;
grant select (
  id, organization_id, team_id, season_id, player_id, roster_membership_id,
  starts_on, ends_on, status, recommended_participation, rtp_phase,
  share_with_coach, created_at, updated_at, archived_at
) on public.medical_availability_plans to authenticated;

do $$
declare
  relation regclass;
  actor text;
begin
  foreach relation in array array[
    'public.medical_availability_recommendations'::regclass,
    'public.medical_availability_plans'::regclass
  ] loop
    foreach actor in array array['anon', 'authenticated'] loop
      if has_table_privilege(actor, relation, 'SELECT')
        or has_column_privilege(actor, relation, 'coach_note', 'SELECT')
        or has_column_privilege(actor, relation, 'internal_note', 'SELECT') then
        raise exception 'Medical raw-note access remains for % on %', actor, relation;
      end if;
    end loop;
    if not has_column_privilege('authenticated', relation, 'id', 'SELECT')
      or not has_column_privilege('service_role', relation, 'internal_note', 'SELECT') then
      raise exception 'Medical safe-read/server-read contract is missing on %', relation;
    end if;
  end loop;
end;
$$;
commit;
