-- Synthetic identities only. The native harness never connects to Supabase.
insert into auth.users (id) select ('00000000-0000-4000-8000-' || lpad(i::text,12,'0'))::uuid from generate_series(1,3) i;

insert into platform_organizations (id,slug,name) values
('00000000-0000-4000-8000-000000000101','fixture-a','Fixture A'),
('00000000-0000-4000-8000-000000000102','fixture-b','Fixture B');
insert into platform_clubs (id,organization_id,slug,name)
select ('00000000-0000-4000-8000-' || lpad((200+i)::text,12,'0'))::uuid,
       ('00000000-0000-4000-8000-' || lpad((100+i)::text,12,'0'))::uuid, 'club-'||i, 'Club '||i
from generate_series(1,2) i;
insert into platform_teams (id,organization_id,club_id,slug,name)
select ('00000000-0000-4000-8000-' || lpad((300+i)::text,12,'0'))::uuid,
       ('00000000-0000-4000-8000-' || lpad((100+i)::text,12,'0'))::uuid,
       ('00000000-0000-4000-8000-' || lpad((200+i)::text,12,'0'))::uuid, 'team-'||i, 'Team '||i
from generate_series(1,2) i;
insert into platform_teams (id,organization_id,club_id,slug,name) values
('00000000-0000-4000-8000-000000000303','00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000201','team-a2','Team A2');
insert into platform_user_profiles (user_id,primary_organization_id,primary_team_id,display_name)
select id, case when id='00000000-0000-4000-8000-000000000002' then '00000000-0000-4000-8000-000000000102'::uuid else '00000000-0000-4000-8000-000000000101'::uuid end,
case when id='00000000-0000-4000-8000-000000000002' then '00000000-0000-4000-8000-000000000302'::uuid else '00000000-0000-4000-8000-000000000301'::uuid end, 'Synthetic staff' from auth.users;
insert into platform_memberships (organization_id,team_id,user_id,role,scope)
select primary_organization_id,primary_team_id,user_id,
case when user_id='00000000-0000-4000-8000-000000000003' then 'medical' else 'coach' end,'team' from platform_user_profiles;

insert into squad_organizations (id,slug,name) select id,slug,name from platform_organizations;
insert into squad_clubs (id,organization_id,slug,name) select id,organization_id,slug,name from platform_clubs;
insert into squad_teams (id,organization_id,club_id,slug,name) select id,organization_id,club_id,slug,name from platform_teams;
insert into squad_staff_memberships (organization_id,team_id,user_id,role,scope)
select organization_id,team_id,user_id,role,scope from platform_memberships;
insert into squad_seasons (id,organization_id,team_id,label)
select ('00000000-0000-4000-8000-' || lpad((400+i)::text,12,'0'))::uuid,
       ('00000000-0000-4000-8000-' || lpad((100+i)::text,12,'0'))::uuid,
       ('00000000-0000-4000-8000-' || lpad((300+i)::text,12,'0'))::uuid,'2026' from generate_series(1,2) i;
insert into squad_players (id,organization_id,display_name,sort_name)
select ('00000000-0000-4000-8000-' || lpad((500+i)::text,12,'0'))::uuid,
       ('00000000-0000-4000-8000-' || lpad((100+i)::text,12,'0'))::uuid,'Synthetic player '||i,'Synthetic player '||i from generate_series(1,2) i;
insert into squad_roster_memberships (id,organization_id,team_id,season_id,player_id)
select ('00000000-0000-4000-8000-' || lpad((600+i)::text,12,'0'))::uuid,
       ('00000000-0000-4000-8000-' || lpad((100+i)::text,12,'0'))::uuid,
       ('00000000-0000-4000-8000-' || lpad((300+i)::text,12,'0'))::uuid,
       ('00000000-0000-4000-8000-' || lpad((400+i)::text,12,'0'))::uuid,
       ('00000000-0000-4000-8000-' || lpad((500+i)::text,12,'0'))::uuid from generate_series(1,2) i;
insert into medical_availability_recommendations
(id,organization_id,team_id,season_id,player_id,roster_membership_id,recommendation_date,status,recommended_participation,rtp_phase,internal_note,coach_note,share_with_coach)
select ('00000000-0000-4000-8000-' || lpad((700+i)::text,12,'0'))::uuid,
       organization_id,team_id,season_id,player_id,id,'2026-09-11','modified',50,'modified-team','synthetic-private','synthetic-unshared',false
from squad_roster_memberships join generate_series(1,2) i on id=('00000000-0000-4000-8000-' || lpad((600+i)::text,12,'0'))::uuid;

insert into medical_state_sync_events (organization_id,team_id,event_type,idempotency_key,payload,payload_hash,processing_status) values
('00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000301','recommendation-saved','synthetic-operation-1','{"synthetic":true}',repeat('a',64),'pending'),
('00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000301','recommendation-saved','synthetic-operation-2','{"synthetic":true}',repeat('b',64),'processed');
insert into platform_app_state_records (organization_id,state_key,module_id,merge_policy,revision,value,removed,value_hash) values
('00000000-0000-4000-8000-000000000101','football-schedule-v1','schedule','replace',7,
'{"syntheticTraining":{"id":"00000000-0000-4000-8000-000000000801","teamId":"00000000-0000-4000-8000-000000000301","playerId":"00000000-0000-4000-8000-000000000501"}}',false,repeat('c',64)),
('00000000-0000-4000-8000-000000000102','synthetic-deleted-record','schedule','replace',8,'',true,repeat('d',64));
update platform_app_state_records set value_hash=encode(extensions.digest(value,'sha256'),'hex');
update medical_state_sync_events set payload_hash=encode(extensions.digest(payload::text,'sha256'),'hex');
