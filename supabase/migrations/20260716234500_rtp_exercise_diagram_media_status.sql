-- Treat lightweight, governed technique diagrams as first-class exercise media.
-- Uploaded images and video remain optional and continue to load separately.

alter table public.rtp_library_exercises
  drop constraint if exists rtp_library_exercises_media_status_check;

alter table public.rtp_library_exercises
  add constraint rtp_library_exercises_media_status_check
  check (media_status in ('missing', 'placeholder', 'diagram', 'uploaded', 'external'));

with normalized as (
  select
    id,
    array(select jsonb_array_elements_text(
      case when jsonb_typeof(content->'bodyRegions') = 'array' then content->'bodyRegions' else '[]'::jsonb end
    )) as body_regions,
    array(select jsonb_array_elements_text(
      case when jsonb_typeof(content->'symptomTags') = 'array' then content->'symptomTags' else '[]'::jsonb end
    )) as symptom_tags,
    array(select jsonb_array_elements_text(
      case when jsonb_typeof(content->'mechanismTags') = 'array' then content->'mechanismTags' else '[]'::jsonb end
    )) as mechanism_tags,
    array(select jsonb_array_elements_text(
      case when jsonb_typeof(content->'positionDemands') = 'array' then content->'positionDemands' else '[]'::jsonb end
    )) as position_demands,
    array(select jsonb_array_elements_text(
      case when jsonb_typeof(content->'clinicalTags') = 'array' then content->'clinicalTags' else '[]'::jsonb end
    )) as clinical_tags,
    array(select jsonb_array_elements_text(
      case when jsonb_typeof(content->'coachingCues') = 'array' then content->'coachingCues' else '[]'::jsonb end
    )) as coaching_cues,
    array(select jsonb_array_elements_text(
      case when jsonb_typeof(content->'qualityChecks') = 'array' then content->'qualityChecks' else '[]'::jsonb end
    )) as quality_checks,
    array(select jsonb_array_elements_text(
      case when jsonb_typeof(content->'commonErrors') = 'array' then content->'commonErrors' else '[]'::jsonb end
    )) as common_errors,
    coalesce(content->>'setup', '') as setup,
    coalesce(content->>'execution', '') as execution,
    case when jsonb_typeof(content->'programBuilder') = 'object'
      then content->'programBuilder'
      else '{}'::jsonb
    end as program_builder,
    coalesce(content->'thumbnail'->>'storagePath', '') as thumbnail_storage_path,
    coalesce(content->'thumbnail'->>'url', '') as thumbnail_url,
    coalesce(content->'thumbnail'->>'diagramKey', '') as diagram_key
  from public.rtp_library_exercises
)
update public.rtp_library_exercises as exercise
set
  body_regions = case when cardinality(exercise.body_regions) = 0 then normalized.body_regions else exercise.body_regions end,
  symptom_tags = case when cardinality(exercise.symptom_tags) = 0 then normalized.symptom_tags else exercise.symptom_tags end,
  mechanism_tags = case when cardinality(exercise.mechanism_tags) = 0 then normalized.mechanism_tags else exercise.mechanism_tags end,
  position_demands = case when cardinality(exercise.position_demands) = 0 then normalized.position_demands else exercise.position_demands end,
  clinical_tags = case when cardinality(exercise.clinical_tags) = 0 then normalized.clinical_tags else exercise.clinical_tags end,
  setup = coalesce(nullif(exercise.setup, ''), normalized.setup),
  execution = coalesce(nullif(exercise.execution, ''), normalized.execution),
  coaching_cues = case when cardinality(exercise.coaching_cues) = 0 then normalized.coaching_cues else exercise.coaching_cues end,
  quality_checks = case when cardinality(exercise.quality_checks) = 0 then normalized.quality_checks else exercise.quality_checks end,
  common_errors = case when cardinality(exercise.common_errors) = 0 then normalized.common_errors else exercise.common_errors end,
  program_builder = case when exercise.program_builder = '{}'::jsonb then normalized.program_builder else exercise.program_builder end,
  thumbnail_storage_path = coalesce(nullif(exercise.thumbnail_storage_path, ''), normalized.thumbnail_storage_path),
  thumbnail_url = coalesce(nullif(exercise.thumbnail_url, ''), normalized.thumbnail_url),
  diagram_key = coalesce(nullif(exercise.diagram_key, ''), normalized.diagram_key),
  media_status = case
    when normalized.diagram_key <> '' and exercise.media_status in ('missing', 'placeholder') then 'diagram'
    else exercise.media_status
  end,
  content = case
    when normalized.diagram_key <> ''
      and (
        exercise.content->>'mediaStatus' is distinct from 'diagram'
        or exercise.content->'thumbnail'->>'status' is distinct from 'diagram'
      ) then
      jsonb_set(
        jsonb_set(
          jsonb_set(exercise.content, '{mediaStatus}', to_jsonb('diagram'::text), true),
          '{thumbnail,status}',
          to_jsonb('diagram'::text),
          true
        ),
        '{media}',
        coalesce((
          select jsonb_agg(
            case when media_item->>'type' = 'diagram'
              then media_item || '{"status":"diagram"}'::jsonb
              else media_item
            end
          )
          from jsonb_array_elements(
            case when jsonb_typeof(exercise.content->'media') = 'array'
              then exercise.content->'media'
              else '[]'::jsonb
            end
          ) as media_item
        ), '[]'::jsonb),
        true
      )
    else exercise.content
  end
from normalized
where normalized.id = exercise.id
  and (
    (cardinality(exercise.body_regions) = 0 and cardinality(normalized.body_regions) > 0)
    or (cardinality(exercise.symptom_tags) = 0 and cardinality(normalized.symptom_tags) > 0)
    or (cardinality(exercise.mechanism_tags) = 0 and cardinality(normalized.mechanism_tags) > 0)
    or (cardinality(exercise.position_demands) = 0 and cardinality(normalized.position_demands) > 0)
    or (cardinality(exercise.clinical_tags) = 0 and cardinality(normalized.clinical_tags) > 0)
    or (exercise.setup = '' and normalized.setup <> '')
    or (exercise.execution = '' and normalized.execution <> '')
    or (cardinality(exercise.coaching_cues) = 0 and cardinality(normalized.coaching_cues) > 0)
    or (cardinality(exercise.quality_checks) = 0 and cardinality(normalized.quality_checks) > 0)
    or (cardinality(exercise.common_errors) = 0 and cardinality(normalized.common_errors) > 0)
    or (exercise.program_builder = '{}'::jsonb and normalized.program_builder <> '{}'::jsonb)
    or (exercise.thumbnail_storage_path = '' and normalized.thumbnail_storage_path <> '')
    or (exercise.thumbnail_url = '' and normalized.thumbnail_url <> '')
    or (exercise.diagram_key = '' and normalized.diagram_key <> '')
    or (exercise.media_status in ('missing', 'placeholder') and normalized.diagram_key <> '')
    or (
      normalized.diagram_key <> ''
      and (
        exercise.content->>'mediaStatus' is distinct from 'diagram'
        or exercise.content->'thumbnail'->>'status' is distinct from 'diagram'
      )
    )
  );
