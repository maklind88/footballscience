-- Teams inherit the bundled Game Model. Store only team edits and additions.
create table public.game_model_items (
  organization_id uuid not null,
  team_id uuid not null,
  id text not null check (char_length(id) between 1 and 180 and id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  kind text not null check (kind in ('team-principle', 'mini-game-principle', 'individual-action')),
  sub_phase_id text not null check (char_length(sub_phase_id) between 1 and 80 and sub_phase_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null check (char_length(btrim(title)) between 1 and 180),
  when_text text not null default '' check (char_length(when_text) <= 400),
  detail text not null default '' check (char_length(detail) <= 1200),
  position_ids text[] not null default '{}'::text[] check (
    cardinality(position_ids) <= 9 and array_position(position_ids, null) is null
    and position_ids <@ array['LB','CB','RB','CMF-6','CMF-8','CMF-10','LW','RW','9']::text[]
  ),
  archived boolean not null default false,
  revision integer not null default 1 check (revision > 0),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (organization_id, team_id, id),
  foreign key (team_id, organization_id) references public.platform_teams(id, organization_id) on delete restrict,
  check (
    (kind = 'individual-action' and cardinality(position_ids) > 0 and btrim(when_text) <> '' and btrim(detail) <> '')
    or (kind <> 'individual-action' and cardinality(position_ids) = 0)
  )
);

alter table public.game_model_items enable row level security;
revoke all on public.game_model_items from public, anon, authenticated, service_role;
grant select, insert, update on public.game_model_items to service_role;

insert into public.platform_permission_matrix
  (module_id, action, roles, scope, requires_organization_scope, requires_team_scope, description)
values
  ('game-model', 'read', array['admin','club-admin','team-admin','coach','scout','analyst','performance','medical'], 'team', true, true, 'Read the active team Game Model.'),
  ('game-model', 'write', array['admin','club-admin','team-admin','coach'], 'team', true, true, 'Edit or archive items in the active team Game Model.')
on conflict (module_id, action) do update set
  roles = excluded.roles, scope = excluded.scope,
  requires_organization_scope = excluded.requires_organization_scope,
  requires_team_scope = excluded.requires_team_scope,
  description = excluded.description, updated_at = now();
