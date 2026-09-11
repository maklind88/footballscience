-- Read-only, one statement/consistent snapshot. Returns counts, never player content.
-- Current legacy owner is resolved from SERVER metadata, not names/browser metadata.
-- No matching owner, missing source, or incomplete mapping must block migration.
with legacy_teams as (
  select t.id as team_id, t.organization_id, t.club_id
  from public.platform_teams t
  join public.platform_clubs c on c.id = t.club_id and c.organization_id = t.organization_id
  join public.platform_organizations o on o.id = t.organization_id
  where t.status = 'active' and c.status = 'active' and o.status = 'active'
    and t.deleted_at is null and c.deleted_at is null and o.deleted_at is null
    and t.metadata ->> 'legacyTeamId' = 'team-north-carolina-courage'
    and o.metadata ->> 'legacyOrganization' = 'football-science-live'
), linked_teams as (
  select l.organization_id, l.team_id, l.module_record_id as squad_team_id
  from public.platform_tenant_links l
  join legacy_teams t on t.team_id = l.team_id
    and t.organization_id = l.organization_id and t.club_id = l.club_id
  join public.squad_teams s on s.id = l.module_record_id
    and s.organization_id = l.organization_id and s.id = l.team_id
  where l.status = 'active' and l.module_id = 'player-profiles'
    and l.module_table = 'squad_teams' and s.status = 'active'
), sources as (
  select k.state_key, r.revision, r.updated_at, r.value_hash,
    case when not r.removed then r.value::jsonb end as doc
  from (values ('football-player-profiles-v1'), ('football-medical-team-v1')) k(state_key)
  left join public.platform_app_state_records r
    on r.state_key = k.state_key and r.organization_id = 'global'
), collections as (
  select s.*, c.label, c.field, c.reference_field,
    coalesce(jsonb_typeof(s.doc) = 'object' and jsonb_typeof(s.doc -> c.field) = 'array', false) as valid
  from sources s
  join (values
    ('football-player-profiles-v1', 'squad-players', 'players', 'id'),
    ('football-medical-team-v1', 'medical-players', 'players', 'id'),
    ('football-medical-team-v1', 'medical-records', 'records', 'playerId'),
    ('football-medical-team-v1', 'medical-plans', 'injuryPlans', 'playerId')
  ) c(state_key, label, field, reference_field) on c.state_key = s.state_key
), source_items as (
  select c.label, nullif(btrim(p ->> 'id'), '') as item_id,
    nullif(btrim(p ->> c.reference_field), '') as legacy_id,
    case when lower(btrim(p ->> 'rosterType')) in ('squad', 'academy', 'trialist', 'guest')
      then lower(btrim(p ->> 'rosterType')) else 'unknown' end as roster_type,
    coalesce(nullif(btrim(p ->> 'archivedAt'), ''), nullif(btrim(p ->> 'deletedAt'), '')) is not null as archived,
    case when jsonb_typeof(p -> 'countsInSquad') = 'boolean' then p ->> 'countsInSquad' else 'unknown' end as counts_in_squad
  from collections c
  cross join lateral jsonb_array_elements(case when c.valid then c.doc -> c.field else '[]'::jsonb end) p
), all_target_players as (
  select p.id, p.organization_id, p.status, p.deleted_at,
    nullif(btrim(p.metadata ->> 'legacyId'), '') as legacy_id
  from public.squad_players p
  where exists (select 1 from legacy_teams t where t.organization_id = p.organization_id)
), target_players as (
  select * from all_target_players where deleted_at is null and status <> 'archived'
), player_matches as (
  select legacy_id, count(*) as matches from target_players group by legacy_id
), membership_matches as (
  select p.legacy_id, count(*) as matches
  from target_players p
  join public.squad_roster_memberships m on m.player_id = p.id and m.organization_id = p.organization_id
  where m.deleted_at is null and m.status = 'active'
    and exists (select 1 from linked_teams t where t.squad_team_id = m.team_id and t.organization_id = m.organization_id)
  group by p.legacy_id
), measures as (
  select c.label, c.valid, count(i.label) as items,
    count(distinct i.legacy_id) as distinct_players,
    count(i.label) filter (where i.item_id is null or i.legacy_id is null) as missing_ids,
    count(i.item_id) - count(distinct i.item_id) as duplicate_ids,
    count(i.label) filter (where coalesce(p.matches, 0) = 0) as unmapped,
    count(i.label) filter (where p.matches > 1) as ambiguous,
    count(i.label) filter (where p.matches = 1) as mapped,
    count(i.label) filter (where p.matches = 1 and coalesce(m.matches, 0) <> 1) as membership_gaps,
    count(i.label) filter (where c.reference_field = 'playerId' and not exists (
      select 1 from source_items medical where medical.label = 'medical-players' and medical.legacy_id = i.legacy_id
    )) as missing_medical_source_player
  from collections c
  left join source_items i on i.label = c.label
  left join player_matches p on p.legacy_id = i.legacy_id
  left join membership_matches m on m.legacy_id = i.legacy_id
  group by c.label, c.valid
), identity_rows as (
  select i.*, exists (
      select 1 from source_items s where s.label = 'squad-players' and s.legacy_id = i.legacy_id
    ) as in_squad_source,
    case
      when (select count(*) from all_target_players t where t.legacy_id = i.legacy_id) > 1 then 'ambiguous'
      when exists (select 1 from target_players t where t.legacy_id = i.legacy_id) then 'current-target'
      when exists (select 1 from all_target_players t where t.legacy_id = i.legacy_id) then 'historical-target'
      else 'missing-target'
    end as target_state,
    (select count(*) from source_items r where r.label = 'medical-records' and r.legacy_id = i.legacy_id) as medical_records,
    (select count(*) from source_items r where r.label = 'medical-plans' and r.legacy_id = i.legacy_id) as medical_plans,
    exists (select 1 from source_items s where s.label = 'squad-players' and s.legacy_id = i.legacy_id
      and (s.roster_type <> i.roster_type or s.counts_in_squad <> i.counts_in_squad or s.archived <> i.archived)) as source_disagreement
  from source_items i where i.label in ('squad-players', 'medical-players')
), identity_groups as (
  select label, roster_type, archived, counts_in_squad, in_squad_source, target_state,
    count(*) as players, sum(medical_records) as medical_records, sum(medical_plans) as medical_plans,
    count(*) filter (where source_disagreement) as source_disagreements
  from identity_rows
  group by label, roster_type, archived, counts_in_squad, in_squad_source, target_state
)
select jsonb_build_object(
  'schema', 'footballscience-identity-foundation-evidence-v1',
  'observedAt', now(),
  'legacyOwnerTeams', (select count(*) from legacy_teams),
  'canonicalSquadLinks', (select count(*) from linked_teams),
  'sources', (select jsonb_agg(jsonb_build_object(
    'key', state_key, 'revision', revision, 'updatedAt', updated_at, 'valueHash', value_hash
  ) order by state_key) from sources),
  'collections', (select jsonb_agg(to_jsonb(m) order by label) from measures m),
  'identityReview', coalesce((select jsonb_agg(to_jsonb(g) order by label, roster_type, archived, counts_in_squad, in_squad_source, target_state)
    from identity_groups g), '[]'::jsonb)
) as evidence;
