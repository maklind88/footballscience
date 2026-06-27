-- Forward fix for environments where 20260613000100_video_analysis_metadata_foundation.sql
-- is already marked as applied but the trigram indexes use unqualified operator classes.

create extension if not exists pg_trgm with schema extensions;
alter extension pg_trgm set schema extensions;

DO $$
BEGIN
  IF to_regclass('public.video_clip_tags') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname = 'video_clip_tags_tag_trgm_idx'
        AND indexdef ILIKE '%extensions.gin_trgm_ops%'
    ) THEN
      DROP INDEX IF EXISTS public.video_clip_tags_tag_trgm_idx;
      CREATE INDEX video_clip_tags_tag_trgm_idx
        ON public.video_clip_tags USING gin ((lower(tag)) extensions.gin_trgm_ops);
    END IF;
  END IF;

  IF to_regclass('public.video_clip_notes') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname = 'video_clip_notes_note_trgm_idx'
        AND indexdef ILIKE '%extensions.gin_trgm_ops%'
    ) THEN
      DROP INDEX IF EXISTS public.video_clip_notes_note_trgm_idx;
      CREATE INDEX video_clip_notes_note_trgm_idx
        ON public.video_clip_notes USING gin ((lower(note)) extensions.gin_trgm_ops);
    END IF;
  END IF;
END $$;
