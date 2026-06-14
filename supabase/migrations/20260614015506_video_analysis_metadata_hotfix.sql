-- Production hotfix marker for Video Analysis metadata.
--
-- The production database was missing the Video Analysis metadata tables even
-- though the canonical schema already exists in:
-- - 20260613000100_video_analysis_metadata_foundation.sql
-- - 20260614004604_video_analysis_workstation_v2_metadata.sql
--
-- The emergency Supabase MCP migration named `video_analysis_metadata_hotfix`
-- re-applied that canonical, idempotent schema to production and reloaded the
-- PostgREST schema cache. This file preserves the remote migration version in
-- source control so future migration checks stay aligned.

notify pgrst, 'reload schema';
