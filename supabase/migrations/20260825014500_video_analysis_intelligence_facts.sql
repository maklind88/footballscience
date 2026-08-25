-- Tenant-scoped metadata read model for FS Player cross-match analysis.
-- Raw video, local file identities, signed URLs and media payloads are intentionally excluded.

create index if not exists video_clip_notes_clip_created_idx
  on public.video_clip_notes (clip_instance_id, created_at, id);

create or replace view public.video_clip_analysis_facts
with (security_invoker = true)
as
select
  clip.id,
  clip.organization_id,
  clip.team_id,
  clip.match_id,
  clip.video_id,
  clip.start_ms,
  clip.end_ms,
  clip.period,
  clip.phase,
  clip.sub_phase,
  clip.team_principle_id,
  clip.mini_game_principle_id,
  clip.outcome,
  clip.created_at,
  clip.updated_at,
  fixture.title as match_title,
  fixture.match_date,
  fixture.opponent,
  video.title as video_title,
  case
    when lower(coalesce(fixture.metadata ->> 'eventType', fixture.metadata ->> 'event_type', '')) = 'training' then 'training'
    else 'match'
  end as event_type,
  coalesce((
    select jsonb_agg(jsonb_build_object(
      'player_id', player.player_id,
      'player_label', coalesce(player.player_label, player.player_id),
      'role', player.role
    ) order by player.role, coalesce(player.player_label, player.player_id), player.id)
    from public.video_clip_players player
    where player.clip_instance_id = clip.id
      and player.organization_id = clip.organization_id
      and player.team_id = clip.team_id
  ), '[]'::jsonb) as players,
  coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', label.label_value,
      'label', coalesce(label.label_text, label.label_value)
    ) order by label.created_at, label.id)
    from public.video_clip_labels label
    where label.clip_instance_id = clip.id
      and label.organization_id = clip.organization_id
      and label.team_id = clip.team_id
      and label.label_type = 'mini_game_principle'
  ), '[]'::jsonb) as mini_game_principles,
  coalesce((
    select jsonb_agg(descriptor.descriptor_value order by descriptor.created_at, descriptor.id)
    from public.video_clip_descriptors descriptor
    where descriptor.clip_instance_id = clip.id
      and descriptor.organization_id = clip.organization_id
      and descriptor.team_id = clip.team_id
      and descriptor.descriptor_type = 'unit'
  ), '[]'::jsonb) as units,
  coalesce((
    select jsonb_agg(tag.tag order by tag.created_at, tag.id)
    from public.video_clip_tags tag
    where tag.clip_instance_id = clip.id
      and tag.organization_id = clip.organization_id
      and tag.team_id = clip.team_id
  ), '[]'::jsonb) as tags,
  coalesce((
    select jsonb_agg(jsonb_build_object('note', note.note) order by note.created_at, note.id)
    from public.video_clip_notes note
    where note.clip_instance_id = clip.id
      and note.organization_id = clip.organization_id
      and note.team_id = clip.team_id
  ), '[]'::jsonb) as notes
from public.video_clip_instances clip
join public.video_matches fixture
  on fixture.id = clip.match_id
  and fixture.organization_id = clip.organization_id
  and fixture.team_id = clip.team_id
join public.video_videos video
  on video.id = clip.video_id
  and video.organization_id = clip.organization_id
  and video.team_id = clip.team_id
where clip.status = 'active'
  and fixture.status = 'active'
  and video.status <> 'archived';

revoke all on public.video_clip_analysis_facts from anon, authenticated;
grant select on public.video_clip_analysis_facts to service_role;

comment on view public.video_clip_analysis_facts is
  'Tenant-scoped metadata-only read model for FS Player matrices, natural-language filters, comparisons and reports.';
