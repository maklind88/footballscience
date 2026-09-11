-- Synthetic acceptance model only. NOT a Supabase migration or product schema.
create schema identity_proof;
create table identity_proof.teams (
  organization_id uuid not null,
  id uuid not null,
  primary key (organization_id, id)
);
create table identity_proof.sources (
  organization_id uuid not null,
  team_id uuid not null,
  revision bigint not null check (revision > 0),
  body jsonb not null,
  primary key (organization_id, team_id),
  foreign key (organization_id, team_id) references identity_proof.teams
);
create table identity_proof.players (
  organization_id uuid not null,
  id uuid not null,
  legacy_id text not null,
  archived boolean not null,
  deleted boolean not null,
  primary key (organization_id, id),
  unique (organization_id, legacy_id),
  unique (organization_id, legacy_id, id)
);
create table identity_proof.memberships (
  organization_id uuid not null,
  team_id uuid not null,
  player_id uuid not null,
  joined_on date not null,
  left_on date,
  active boolean not null,
  primary key (organization_id, team_id, player_id, joined_on),
  foreign key (organization_id, team_id) references identity_proof.teams,
  foreign key (organization_id, player_id) references identity_proof.players
);
create table identity_proof.links (
  organization_id uuid not null,
  team_id uuid not null,
  legacy_id text not null,
  player_id uuid not null,
  primary key (organization_id, team_id, legacy_id),
  foreign key (organization_id, team_id) references identity_proof.teams,
  foreign key (organization_id, legacy_id, player_id)
    references identity_proof.players (organization_id, legacy_id, id)
);
create table identity_proof.references (
  organization_id uuid not null,
  team_id uuid not null,
  kind text not null check (kind in ('record', 'plan')),
  id text not null,
  legacy_id text not null,
  player_id uuid not null,
  payload jsonb not null,
  primary key (organization_id, team_id, kind, id),
  foreign key (organization_id, team_id, legacy_id) references identity_proof.links,
  foreign key (organization_id, legacy_id, player_id)
    references identity_proof.players (organization_id, legacy_id, id)
);
create table identity_proof.receipts (
  organization_id uuid not null,
  team_id uuid not null,
  operation_id uuid not null,
  request_hash text not null,
  source_revision bigint not null,
  primary key (organization_id, team_id, operation_id),
  foreign key (organization_id, team_id) references identity_proof.teams
);
