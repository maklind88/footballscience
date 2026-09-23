-- Read-boundary hardening only. No clinical rows, events or write paths change.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

-- Table revokes also remove column grants. Regrant the explicit safe contract
-- below; a column-only revoke would leave a table-level grant as a bypass.
revoke select on public.medical_availability_recommendations from public, anon, authenticated;
revoke select on public.medical_availability_plans from public, anon, authenticated;
revoke select (coach_note) on public.medical_availability_recommendations from public, anon, authenticated;
revoke select (coach_note) on public.medical_availability_plans from public, anon, authenticated;

-- Preserve the original safe fields and add only the invoker-view predicates.
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

create or replace function app_private.medical_coach_recommendation_note(target_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select recommendation.coach_note
  from public.medical_availability_recommendations recommendation
  where recommendation.id = target_id
    and recommendation.deleted_at is null
    and recommendation.share_with_coach
    and (
      -- Database role, not a client/JWT role claim. Server reads stay server-side.
      pg_catalog.current_setting('role', true) = 'service_role'
      or (
        app_private.is_medical_staff()
        and app_private.is_medical_team_member(recommendation.team_id)
      )
    );
$$;

create or replace function app_private.medical_coach_plan_note(target_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select plan.coach_note
  from public.medical_availability_plans plan
  where plan.id = target_id
    and plan.archived_at is null
    and plan.share_with_coach
    and (
      pg_catalog.current_setting('role', true) = 'service_role'
      or (
        app_private.is_medical_staff()
        and app_private.is_medical_team_member(plan.team_id)
      )
    );
$$;

revoke all on function app_private.medical_coach_recommendation_note(uuid) from public, anon, authenticated;
revoke all on function app_private.medical_coach_plan_note(uuid) from public, anon, authenticated;
grant usage on schema app_private to authenticated, service_role;
grant execute on function app_private.medical_coach_recommendation_note(uuid) to authenticated, service_role;
grant execute on function app_private.medical_coach_plan_note(uuid) to authenticated, service_role;

create or replace view public.medical_coach_availability
with (security_invoker = true)
as
select
  recommendation.id,
  recommendation.organization_id,
  recommendation.team_id,
  recommendation.season_id,
  recommendation.player_id,
  recommendation.roster_membership_id,
  recommendation.recommendation_date,
  recommendation.status,
  recommendation.recommended_participation,
  recommendation.rtp_phase,
  case when recommendation.share_with_coach
    then app_private.medical_coach_recommendation_note(recommendation.id)
    else null::text end as coach_note,
  recommendation.share_with_coach,
  recommendation.source,
  recommendation.created_at,
  recommendation.updated_at
from public.medical_availability_recommendations recommendation
where recommendation.deleted_at is null;

create or replace view public.medical_coach_availability_plans
with (security_invoker = true)
as
select
  plan.id,
  plan.organization_id,
  plan.team_id,
  plan.season_id,
  plan.player_id,
  plan.roster_membership_id,
  plan.starts_on,
  plan.ends_on,
  plan.status,
  plan.recommended_participation,
  plan.rtp_phase,
  case when plan.share_with_coach
    then app_private.medical_coach_plan_note(plan.id)
    else null::text end as coach_note,
  plan.share_with_coach,
  plan.created_at,
  plan.updated_at
from public.medical_availability_plans plan
where plan.archived_at is null;

revoke all on public.medical_coach_availability from public, anon;
revoke all on public.medical_coach_availability_plans from public, anon;
grant select on public.medical_coach_availability to authenticated;
grant select on public.medical_coach_availability_plans to authenticated;
commit;
